import type { NextApiRequest, NextApiResponse } from "next";
import { getQuestions, getSettingsByNumber, upsertSession } from "@/lib/receptionist";
import { xmlEscape, xmlEscapeAttr } from "@/lib/xml";

function xmlResponse(res: NextApiResponse, twiml: string) {
  res.setHeader("Content-Type", "text/xml");
  res.status(200).send(twiml);
}

function baseUrl(req: NextApiRequest) {
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${protocol}://${host}`.replace(/\/+$/, "");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  console.log("[receptionist] incoming body", req.body);
  console.log("[receptionist] headers", req.headers);

  const toNumber = (req.body?.To || req.body?.to || "").toString();
  const fromNumber = (req.body?.From || req.body?.from || "").toString();
  const callSid = (req.body?.CallSid || req.body?.CallSid || "").toString();

  if (!toNumber || !callSid) {
    return xmlResponse(
      res,
      '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, this line is not configured.</Say><Hangup/></Response>'
    );
  }

  const settings = await getSettingsByNumber(toNumber);
  if (!settings) {
    return xmlResponse(
      res,
      '<?xml version="1.0" encoding="UTF-8"?><Response><Say>This number is not configured for the receptionist.</Say><Hangup/></Response>'
    );
  }

  const questions = await getQuestions(settings.workspace_id);
  if (questions.length === 0) {
    return xmlResponse(
      res,
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${settings.greeting}</Say><Say>There are no questions configured yet. Someone will contact you soon.</Say><Hangup/></Response>`
    );
  }

  await upsertSession({
    callSid,
    workspaceId: settings.workspace_id,
    from: fromNumber,
    to: toNumber,
  });

  const question = questions[0];
  const actionUrl = `${baseUrl(req)}/api/receptionist/voice/response?callSid=${encodeURIComponent(
    callSid
  )}&index=0`;
  const escapedAction = xmlEscapeAttr(actionUrl);

  const greeting = xmlEscape(settings.greeting);
  const prompt = xmlEscape(question.prompt);

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>${greeting}</Say>
  <Pause length="1"/>
  <Gather input="speech" action="${escapedAction}" method="POST" speechTimeout="auto">
    <Say>${prompt}</Say>
  </Gather>
  <Say>I am sorry, I did not hear anything. Let me try again.</Say>
  <Redirect>${escapedAction}</Redirect>
</Response>`;

  return xmlResponse(res, twiml);
}

