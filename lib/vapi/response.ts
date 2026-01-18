/**
 * Vapi Response Formatter
 * Formats agent responses for Vapi's expected JSON format
 */

export interface VapiResponse {
  // Vapi expects messages array format (CRITICAL for Server URL to work)
  messages?: Array<{
    role: "assistant" | "user" | "system";
    content: string;
  }>;
  // Legacy format (may still work but messages is preferred)
  response?: string;
  endCall?: boolean;
  voice?: {
    provider: "elevenlabs";
    voiceId: string;
  };
}

/**
 * Format response for Vapi
 * 
 * CRITICAL: Vapi expects messages array format for Server URL responses
 * Format: { messages: [{ role: "assistant", content: "..." }] }
 * 
 * @param options - Response options
 * @returns Formatted Vapi response
 */
export function formatVapiResponse(options: {
  response: string;
  endCall?: boolean;
  voiceId?: string | null;
}): VapiResponse {
  const { response, endCall = false, voiceId } = options;

  // CRITICAL: Vapi expects messages array format
  const vapiResponse: VapiResponse = {
    messages: [
      {
        role: "assistant",
        content: response || "",
      },
    ],
    // Also include legacy format for compatibility
    response: response || "",
  };

  // If conversation should end, set endCall flag
  if (endCall) {
    vapiResponse.endCall = true;
  }

  // If ElevenLabs voice is configured, include voice settings
  // Note: Vapi will use the voice configured in the assistant settings
  // But we can also specify it here if needed
  if (voiceId) {
    vapiResponse.voice = {
      provider: "elevenlabs",
      voiceId: voiceId,
    };
  }

  return vapiResponse;
}

/**
 * Map conversation state to Vapi format (if needed)
 * Currently Vapi handles state internally, but this can be used for custom state
 */
export function mapConversationState(conversationState: Record<string, any>): Record<string, any> {
  // Vapi manages its own state, but we can pass custom data if needed
  return conversationState;
}

/**
 * Determine if call should end based on agent execution result
 */
export function shouldEndCall(shouldContinue: boolean, output?: string): boolean {
  // End call if agent says conversation should end
  if (!shouldContinue) {
    return true;
  }

  // Check for goodbye phrases in output
  if (output) {
    const goodbyePhrases = [
      "goodbye",
      "bye",
      "have a great day",
      "talk to you later",
      "see you later",
      "farewell",
    ];
    
    const lowerOutput = output.toLowerCase();
    if (goodbyePhrases.some(phrase => lowerOutput.includes(phrase))) {
      return true;
    }
  }

  return false;
}

