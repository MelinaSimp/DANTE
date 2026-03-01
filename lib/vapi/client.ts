/**
 * VAPI REST API Client
 * Handles creating, updating, and deleting VAPI assistants and phone numbers
 */

const VAPI_BASE_URL = "https://api.vapi.ai";

function getApiKey(): string {
  const key = process.env.VAPI_API_KEY;
  if (!key) throw new Error("VAPI_API_KEY is not set");
  return key;
}

function headers() {
  return {
    Authorization: `Bearer ${getApiKey()}`,
    "Content-Type": "application/json",
  };
}

// ─── Assistants ──────────────────────────────────────────────

export interface VapiAssistantConfig {
  name: string;
  firstMessage?: string;
  model: {
    provider: string;
    model: string;
    messages: Array<{ role: string; content: string }>;
    tools?: any[];
    temperature?: number;
    maxTokens?: number;
  };
  voice?: {
    provider: string;
    voiceId: string;
  };
  serverUrl?: string;
  serverMessages?: string[];
  endCallMessage?: string;
  maxDurationSeconds?: number;
  silenceTimeoutSeconds?: number;
  transcriber?: {
    provider: string;
    model?: string;
    language?: string;
  };
}

export async function createAssistant(config: VapiAssistantConfig): Promise<{ id: string; [key: string]: any }> {
  const res = await fetch(`${VAPI_BASE_URL}/assistant`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(config),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`VAPI createAssistant failed (${res.status}): ${body}`);
  }

  return res.json();
}

export async function updateAssistant(assistantId: string, config: Partial<VapiAssistantConfig>): Promise<any> {
  const res = await fetch(`${VAPI_BASE_URL}/assistant/${assistantId}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(config),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`VAPI updateAssistant failed (${res.status}): ${body}`);
  }

  return res.json();
}

export async function deleteAssistant(assistantId: string): Promise<void> {
  const res = await fetch(`${VAPI_BASE_URL}/assistant/${assistantId}`, {
    method: "DELETE",
    headers: headers(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`VAPI deleteAssistant failed (${res.status}): ${body}`);
  }
}

export async function getAssistant(assistantId: string): Promise<any> {
  const res = await fetch(`${VAPI_BASE_URL}/assistant/${assistantId}`, {
    method: "GET",
    headers: headers(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`VAPI getAssistant failed (${res.status}): ${body}`);
  }

  return res.json();
}

// ─── Phone Numbers ───────────────────────────────────────────

export interface ImportTwilioNumberConfig {
  provider: "twilio";
  number: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  assistantId?: string;
  serverUrl?: string;
  name?: string;
}

export async function importTwilioNumber(config: ImportTwilioNumberConfig): Promise<{ id: string; [key: string]: any }> {
  const res = await fetch(`${VAPI_BASE_URL}/phone-number`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(config),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`VAPI importTwilioNumber failed (${res.status}): ${body}`);
  }

  return res.json();
}

export async function updatePhoneNumber(phoneNumberId: string, updates: Record<string, any>): Promise<any> {
  const res = await fetch(`${VAPI_BASE_URL}/phone-number/${phoneNumberId}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(updates),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`VAPI updatePhoneNumber failed (${res.status}): ${body}`);
  }

  return res.json();
}

export async function deletePhoneNumber(phoneNumberId: string): Promise<void> {
  const res = await fetch(`${VAPI_BASE_URL}/phone-number/${phoneNumberId}`, {
    method: "DELETE",
    headers: headers(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`VAPI deletePhoneNumber failed (${res.status}): ${body}`);
  }
}

// ─── Outbound Calls ─────────────────────────────────────────

export interface OutboundCallConfig {
  assistantId: string;
  phoneNumberId: string;
  customer: { number: string; name?: string };
  assistantOverrides?: {
    firstMessage?: string;
    model?: {
      provider?: string;
      model?: string;
      messages?: Array<{ role: string; content: string }>;
    };
  };
}

export async function createOutboundCall(config: OutboundCallConfig): Promise<{ id: string; status: string; [key: string]: any }> {
  const res = await fetch(`${VAPI_BASE_URL}/call/phone`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(config),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`VAPI createOutboundCall failed (${res.status}): ${body}`);
  }

  return res.json();
}

export async function getCall(callId: string): Promise<{ id: string; status: string; endedReason?: string; summary?: string; duration?: number; [key: string]: any }> {
  const res = await fetch(`${VAPI_BASE_URL}/call/${callId}`, {
    method: "GET",
    headers: headers(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`VAPI getCall failed (${res.status}): ${body}`);
  }

  return res.json();
}

// ─── Phone Numbers (continued) ──────────────────────────────

export async function listPhoneNumbers(): Promise<any[]> {
  const res = await fetch(`${VAPI_BASE_URL}/phone-number`, {
    method: "GET",
    headers: headers(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`VAPI listPhoneNumbers failed (${res.status}): ${body}`);
  }

  return res.json();
}
