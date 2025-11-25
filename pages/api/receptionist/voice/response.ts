import type { NextApiRequest, NextApiResponse } from "next";
import {
  getQuestions,
  getSession,
  getSettingsByNumber,
  logCompletedCall,
  updateSessionAnswers,
  updateSessionState,
  upsertSession,
} from "@/lib/receptionist";
import { createReceptionistReply } from "@/lib/receptionist-ai";
import {
  createAppointmentFromSuggestion,
  generateAppointmentSuggestion,
} from "@/lib/receptionist-appointment";
import { answerKnowledgeQuestion } from "@/lib/receptionist-knowledge";
import { generateCallAnalysis } from "@/lib/receptionist-analysis";
import { xmlEscape, xmlEscapeAttr } from "@/lib/xml";

function baseUrl(req: NextApiRequest) {
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${protocol}://${host}`.replace(/\/+$/, "");
}

function xml(res: NextApiResponse, twiml: string) {
  res.setHeader("Content-Type", "text/xml");
  res.status(200).send(twiml);
}

function gatherResponse(prompt: string, actionUrl: string, retryMessage: string) {
  const escapedPrompt = xmlEscape(prompt);
  const escapedAction = xmlEscapeAttr(actionUrl);
  const escapedRetry = xmlEscape(retryMessage);
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" method="POST" speechTimeout="auto" action="${escapedAction}">
    <Say>${escapedPrompt}</Say>
  </Gather>
  <Say>${escapedRetry}</Say>
  <Redirect>${escapedAction}</Redirect>
</Response>`;
}

function finalSummaryResponse(summary: string, farewell: string, qaActionUrl: string) {
  const escapedSummary = xmlEscape(summary);
  const escapedFarewell = xmlEscape(farewell);
  const escapedQaAction = xmlEscapeAttr(qaActionUrl);
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>${escapedSummary}</Say>
  <Pause length="1"/>
  <Gather input="speech" method="POST" speechTimeout="auto" action="${escapedQaAction}">
    <Say>If you have any other questions for me, please say them now. If you're all set, simply stay quiet and I will wrap up the call.</Say>
  </Gather>
  <Say>${escapedFarewell}</Say>
  <Hangup/>
</Response>`;
}

function qaAnswerResponse(answer: string, farewell: string) {
  const escapedAnswer = xmlEscape(answer);
  const escapedFarewell = xmlEscape(farewell);
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>${escapedAnswer}</Say>
  <Pause length="1"/>
  <Say>${escapedFarewell}</Say>
  <Hangup/>
</Response>`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    console.log("[receptionist] response body", req.body);

    const callSid = (req.query.callSid || req.body.CallSid || "").toString();
    const mode = (req.query.mode || req.body.mode || "").toString();
    let index = Number(req.query.index ?? req.body.index ?? 0);
    if (Number.isNaN(index) || index < 0) index = 0;

    const speechResult = (req.body.SpeechResult || "").toString().trim();
    const toNumber = (req.body.To || "").toString();
    const fromNumber = (req.body.From || "").toString();

    if (!callSid) {
      return xml(
        res,
        '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Call session missing.</Say><Hangup/></Response>'
      );
    }

    let session = await getSession(callSid);
    if (!session) {
      const settings = await getSettingsByNumber(toNumber);
      if (!settings) {
        return xml(
          res,
          '<?xml version="1.0" encoding="UTF-8"?><Response><Say>This number is not configured.</Say><Hangup/></Response>'
        );
      }
      session = await upsertSession({
        callSid,
        workspaceId: settings.workspace_id,
        from: fromNumber,
        to: toNumber,
      });
    }

    const answers = Array.isArray(session.answers) ? [...session.answers] : [];
    const followupQueue = Array.isArray(session.followup_queue) ? session.followup_queue : [];
    const followupIndex = session.followup_index ?? 0;
    const processingFollowup =
      mode === "followup" || (followupQueue.length > 0 && followupIndex < followupQueue.length);

    if (mode === "qa") {
      const settings = await getSettingsByNumber(session.to_number || toNumber);
      const farewell = settings?.farewell || "Thanks for calling. Someone will be in touch soon.";

      if (!speechResult) {
        return xml(res, qaAnswerResponse("No worries! We'll be here if you need anything else.", farewell));
      }

      const answer = await answerKnowledgeQuestion(session.workspace_id, speechResult);
      answers.push({
        question_id: "knowledge",
        prompt: "Caller question",
        answer: speechResult,
        captured_at: new Date().toISOString(),
        type: "knowledge",
      });
      await updateSessionAnswers(callSid, { answers });

      return xml(res, qaAnswerResponse(answer, farewell));
    }

    const questions = await getQuestions(session.workspace_id);
    if (questions.length === 0) {
      return xml(
        res,
        '<?xml version="1.0" encoding="UTF-8"?><Response><Say>No questions configured.</Say><Hangup/></Response>'
      );
    }

    const currentQuestion =
      !processingFollowup && index < questions.length ? questions[index] : null;
    const currentFollowup = processingFollowup ? followupQueue[followupIndex] : null;

    if (!speechResult) {
      if (processingFollowup && currentFollowup) {
        const actionUrl = `${baseUrl(req)}/api/receptionist/voice/response?callSid=${encodeURIComponent(
          callSid
        )}&mode=followup&index=${index}`;
        return xml(
          res,
          gatherResponse(
            currentFollowup.question,
            actionUrl,
            "I’m sorry, I didn’t hear that. Let me ask again."
          )
        );
      }

      if (currentQuestion) {
        const actionUrl = `${baseUrl(req)}/api/receptionist/voice/response?callSid=${encodeURIComponent(
          callSid
        )}&index=${index}`;
        return xml(
          res,
          gatherResponse(
            currentQuestion.prompt,
            actionUrl,
            "I am sorry, I did not catch that. Please repeat."
          )
        );
      }
    }

    const now = new Date().toISOString();

    if (processingFollowup && currentFollowup) {
      answers.push({
        question_id: `followup:${currentFollowup.field}`,
        prompt: currentFollowup.question,
        answer: speechResult,
        captured_at: now,
        followup_field: currentFollowup.field,
        type: "followup",
      });

      await updateSessionAnswers(callSid, { answers });

      const nextFollowupIndex = followupIndex + 1;
      await updateSessionState(callSid, {
        followup_index: nextFollowupIndex,
        followup_queue: followupQueue,
      });
      session.followup_index = nextFollowupIndex;
      session.followup_queue = followupQueue;
      session.answers = answers;

      const remaining = nextFollowupIndex < followupQueue.length;
      if (remaining) {
        const nextItem = followupQueue[nextFollowupIndex];
        const actionUrl = `${baseUrl(req)}/api/receptionist/voice/response?callSid=${encodeURIComponent(
          callSid
        )}&mode=followup&index=${index}`;
        return xml(
          res,
          gatherResponse(
            nextItem.question,
            actionUrl,
            "I’m sorry, I didn’t hear that. Let me ask again."
          )
        );
      }

      await updateSessionState(callSid, { followup_queue: [], followup_index: 0 });
      session.followup_queue = [];
      session.followup_index = 0;
    } else if (currentQuestion) {
      answers[index] = {
        question_id: currentQuestion.id,
        prompt: currentQuestion.prompt,
        answer: speechResult,
        captured_at: now,
        type: "script",
      };

      const nextIndex = index + 1;
      const hasMore = nextIndex < questions.length;

      await updateSessionAnswers(callSid, {
        answers,
        current_index: hasMore ? nextIndex : nextIndex,
        completed: !hasMore,
      });
      session.answers = answers;
      session.current_index = hasMore ? nextIndex : nextIndex;
      session.completed = !hasMore;

      if (hasMore) {
        const nextQuestion = questions[nextIndex];
        const actionUrl = `${baseUrl(req)}/api/receptionist/voice/response?callSid=${encodeURIComponent(
          callSid
        )}&index=${nextIndex}`;
        return xml(
          res,
          gatherResponse(
            nextQuestion.prompt,
            actionUrl,
            "I'm sorry, I didn't hear anything. Let me ask again."
          )
        );
      }
    }

    const plan = await generateAppointmentSuggestion(session.answers);
    console.log("[receptionist] appointment plan", plan);

    if (plan?.followups && plan.followups.length > 0) {
      const trimmed = plan.followups.slice(0, 2);
      await updateSessionState(callSid, {
        followup_queue: trimmed.map((item) => ({
          field: item.field,
          question: item.question,
          type: "appointment",
        })),
        followup_index: 0,
      });
      session.followup_queue = trimmed;
      session.followup_index = 0;
      const first = trimmed[0];
      const actionUrl = `${baseUrl(req)}/api/receptionist/voice/response?callSid=${encodeURIComponent(
        callSid
      )}&mode=followup&index=${questions.length}`;
      return xml(
        res,
        gatherResponse(
          first.question,
          actionUrl,
          "I’m sorry, I didn’t hear that. Let me ask again."
        )
      );
    }

    const settings = await getSettingsByNumber(session.to_number || toNumber);
    const reply = await createReceptionistReply({
      settings: settings || {
        workspace_id: session.workspace_id,
        greeting: "Hello.",
        farewell: "Goodbye.",
        twilio_phone_number: session.to_number,
      },
      answers: session.answers,
    });

    let appointmentLine = "";
    let appointmentSummaryForAnalysis: string | null = null;
    if (plan) {
      try {
        const notesContext = session.answers
          .map((entry, idx) => `Q${idx + 1}: ${entry.prompt}\nA: ${entry.answer}`)
          .join("\n\n");
        const creation = await createAppointmentFromSuggestion({
          workspaceId: session.workspace_id,
          plan,
          fallbackFromNumber: session.from_number || fromNumber,
          notesContext,
        });
        console.log("[receptionist] appointment creation result", creation);

        if (creation.created && creation.appointment) {
          const start = new Date(creation.appointment.scheduled_at);
          const formatted = isNaN(start.getTime())
            ? creation.appointment.scheduled_at
            : start.toLocaleString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              });
          const service = creation.appointment.service_type || "your appointment";
          appointmentLine = `I’ve scheduled ${service} for ${formatted}.`;
          appointmentSummaryForAnalysis = appointmentLine;
        } else if (creation.reason) {
          appointmentLine = creation.reason;
          appointmentSummaryForAnalysis = appointmentLine;
        }
      } catch (creationError) {
        console.error("[receptionist] Appointment automation failed", creationError);
      }
    }

    const analysisText = await generateCallAnalysis({
      answers: session.answers,
      aiResponse: reply,
      appointmentSummary: appointmentSummaryForAnalysis,
    });

    await logCompletedCall({
      workspaceId: session.workspace_id,
      callSid,
      from: session.from_number || fromNumber,
      to: session.to_number || toNumber,
      answers: session.answers,
      aiResponse: reply,
      analysis: analysisText,
    });

    const farewell =
      settings?.farewell || "Thanks for calling. Someone will be in touch soon.";
    const qaActionUrl = `${baseUrl(req)}/api/receptionist/voice/response?callSid=${encodeURIComponent(
      callSid
    )}&mode=qa&index=${questions.length}`;

    const extra = appointmentLine ? ` ${appointmentLine}` : "";
    const fullSummary = `${reply}${extra}`;

    return xml(res, finalSummaryResponse(fullSummary, farewell, qaActionUrl));
  } catch (error) {
    console.error("Receptionist response handler failed", error);
    return xml(
      res,
      '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, I ran into a technical issue. A member of the team will follow up shortly.</Say><Hangup/></Response>'
    );
  }
}

