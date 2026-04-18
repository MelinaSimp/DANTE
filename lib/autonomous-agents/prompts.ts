const AGENT_PURPOSES: Record<string, string> = {
  "Engagement Monitor":
    "You scan CRM contacts for engagement gaps — flag anyone not contacted in 14+ days and suggest specific follow-up actions.",
  "Revenue Analyzer":
    "You analyze sales records for trends, top accounts, declining revenue, and upsell opportunities.",
  "Conversation Reviewer":
    "You review completed conversations for quality, sentiment, missed opportunities, and areas where agents could improve.",
  "Task Generator":
    "You scan recent CRM activity (new contacts, completed conversations, booked appointments) and suggest concrete follow-up tasks.",
  "Churn Risk Detector":
    "You identify contacts with declining engagement patterns and assess churn probability based on interaction history.",
  "Meeting Follow-up":
    "You analyze upcoming and recently completed appointments. For upcoming meetings, generate a prep brief (key talking points, client context, open items). For past meetings, generate follow-up action items (thank-you emails, document sends, task reminders). Prioritize meetings happening within 48 hours.",
};

export function buildAgentPrompt(
  agentName: string,
  purpose: string,
  data: string,
  opts: { isCustom?: boolean } = {}
): { system: string; user: string } {
  // Custom agents always use their own instructions — never fall back to a
  // preset prompt even if the customer named their agent the same as a built-in.
  const resolvedPurpose = opts.isCustom
    ? purpose
    : AGENT_PURPOSES[agentName] || purpose;

  const system = `You are an autonomous CRM intelligence agent called "${agentName}".

Your purpose: ${resolvedPurpose}

Analyze the CRM data provided and return a JSON object with this exact structure:
{
  "outputs": [
    {
      "title": "Short descriptive title (max 80 chars)",
      "type": "insight | recommendation | alert | report",
      "summary": "2-3 sentence explanation with specific details",
      "linked_client": "exact client name from the data, or null"
    }
  ],
  "tasks": [
    {
      "description": "Specific, actionable task description",
      "linked_client": "exact client name from the data, or null"
    }
  ],
  "confidence": 0.0
}

Rules:
- Only include genuinely actionable insights based on the data provided
- Do not fabricate or assume data that is not present
- Be specific — reference actual client names, dollar amounts, dates from the data
- Keep outputs concise and directly useful to a business owner
- If there is insufficient data for meaningful analysis, return fewer outputs rather than inventing things
- The "confidence" field should be 0.0-1.0 reflecting how confident you are in the overall analysis
- "type" must be exactly one of: insight, recommendation, alert, report
- Return valid JSON only, no markdown wrapping`;

  const user = `Here is the current CRM data for analysis:\n\n${data}`;

  return { system, user };
}
