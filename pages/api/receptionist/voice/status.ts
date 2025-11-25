import type { NextApiRequest, NextApiResponse } from "next";
import { logStatusEvent } from "@/lib/receptionist";

export const config = {
  api: {
    bodyParser: false,
  },
};

async function parseFormBody(req: NextApiRequest): Promise<Record<string, string>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req as any) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return Object.fromEntries(new URLSearchParams(raw));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }

  const data = await parseFormBody(req);

  const callSid = data.CallSid || data.CallSid || "";
  const status = data.CallStatus || data.CallStatus || data.CallState || "";
  const duration = data.CallDuration || "";

  if (callSid) {
    await logStatusEvent({
      callSid,
      status,
      callDuration: duration,
      payload: data,
    });
  }

  res.status(204).end();
}












