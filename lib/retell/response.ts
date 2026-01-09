/**
 * Retell AI Response Formatter
 * Formats agent responses for Retell's expected JSON format
 */

export interface RetellResponse {
  // Retell expects response in this format
  response: string;
  // Optional: end call flag
  end_call?: boolean;
  // Optional: custom data
  custom_data?: Record<string, any>;
}

/**
 * Format response for Retell AI
 * 
 * @param options - Response options
 * @returns Formatted Retell response
 */
export function formatRetellResponse(options: {
  response: string;
  endCall?: boolean;
  customData?: Record<string, any>;
}): RetellResponse {
  const { response, endCall = false, customData } = options;

  const retellResponse: RetellResponse = {
    response: response || "",
  };

  if (endCall) {
    retellResponse.end_call = true;
  }

  if (customData) {
    retellResponse.custom_data = customData;
  }

  return retellResponse;
}
