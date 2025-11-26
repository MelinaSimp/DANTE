/**
 * Agent Execution Engine
 * Core runtime that executes agent scenarios and steps during conversations
 */

import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import pdfParse from "pdf-parse";
import { createWorker } from "tesseract.js";

export interface ConversationContext {
  conversationId: string;
  agentId: string;
  scenarioId: string | null;
  currentStepId: string | null;
  gatheredData: Record<string, any>;
  conversationState: Record<string, any>;
  transcript: Array<{ role: "user" | "assistant"; content: string; timestamp: string }>;
}

export interface StepResult {
  success: boolean;
  output?: string;
  nextStepId?: string | null;
  nextScenarioId?: string | null;
  error?: string;
  gatheredData?: Record<string, any>;
  shouldContinue: boolean;
}

export class AgentExecutor {
  private context: ConversationContext;
  private supabase: any;

  constructor(context: ConversationContext) {
    this.context = context;
    this.supabase = supabaseAdmin;
  }

  /**
   * Execute the next step in the conversation
   */
  async executeNextStep(userInput: string): Promise<StepResult> {
    try {
      // Validate context
      if (!this.context.agentId) {
        console.error("[Agent Executor] Missing agentId in context");
        return {
          success: false,
          error: "Agent ID is missing",
          shouldContinue: false,
        };
      }

      if (!this.context.currentStepId) {
        console.error("[Agent Executor] Missing currentStepId in context");
        return {
          success: false,
          error: "Current step ID is missing",
          shouldContinue: false,
        };
      }

      // Load current step
      const step = await this.loadStep(this.context.currentStepId);
      if (!step) {
        console.error("[Agent Executor] Step not found:", this.context.currentStepId);
        return {
          success: false,
          error: `Step not found: ${this.context.currentStepId}`,
          shouldContinue: false,
        };
      }

      // Check if we're in Q&A mode (after inquiry has been answered)
      // If so, use policies/data sources to answer their question or check satisfaction
      if (this.context.gatheredData.inquiry_answered) {
        // First check if they're satisfied and want to end
        const satisfactionCheck = await this.checkSatisfaction(userInput);
        if (satisfactionCheck.isSatisfied) {
          return {
            success: true,
            output: satisfactionCheck.closingMessage || "Thank you for calling! Have a great day!",
            nextStepId: null,
            nextScenarioId: null,
            shouldContinue: false, // End conversation
            gatheredData: this.context.gatheredData,
          };
        }
        
        // They have another question - answer it using policies/data sources
        console.log("[Q&A Mode] Customer has a follow-up question, answering with policies/data sources");
        console.log("[Q&A Mode] Customer question:", userInput);
        
        // Load agent context (policies, data sources, personalization)
        const agentContext = await this.loadAgentContext();
        const systemPrompt = this.buildSystemPrompt(agentContext);
        
        // Build context from conversation history
        const conversationContext = this.context.transcript
          .slice(-6) // Last 6 messages for context
          .map((msg: any) => `${msg.role === "user" ? "Customer" : "Receptionist"}: ${msg.content}`)
          .join("\n");
        
        const userPrompt = `The customer asked: "${userInput}"

${conversationContext ? `Recent conversation context:\n${conversationContext}\n\n` : ""}Based on the policies and knowledge base provided above, provide a helpful, accurate answer. Be concise but complete. If you don't have enough information in the knowledge base, politely say so and offer to help them further or connect them with someone who can help.

After providing your answer, ask if there's anything else you can help with.`;

        // Generate AI response using policies and data sources
        const answer = await this.generateAIResponseWithContext(systemPrompt, userPrompt);
        
        // Update gathered data with the new question
        const updatedGatheredData = {
          ...this.context.gatheredData,
          last_question: userInput,
        };
        
        // Return the answer and continue the conversation
        return {
          success: true,
          output: answer,
          nextStepId: this.context.currentStepId, // Stay on current step to continue Q&A
          nextScenarioId: null,
          shouldContinue: true,
          gatheredData: updatedGatheredData,
        };
      }

      // Execute step based on type
      let result: StepResult;
      switch (step.type) {
        case "say":
          result = await this.executeSayStep(step, userInput);
          break;
        case "gather":
          result = await this.executeGatherStep(step, userInput);
          break;
        case "if":
          result = await this.executeIfStep(step, userInput);
          break;
        case "code":
          result = await this.executeCodeStep(step, userInput);
          break;
        case "api_call":
          result = await this.executeApiCallStep(step, userInput);
          break;
        case "schedule":
          result = await this.executeScheduleStep(step, userInput);
          break;
        default:
          result = {
            success: false,
            error: `Unknown step type: ${step.type}`,
            shouldContinue: false,
          };
      }

      // Update conversation state
      if (result.success) {
        await this.updateConversationState(result);
      }

      return result;
    } catch (error: any) {
      console.error("[Agent Executor] Execution error:", {
        error: error.message,
        stack: error.stack,
        conversationId: this.context.conversationId,
        stepId: this.context.currentStepId,
        agentId: this.context.agentId,
        fullError: error,
      });
      return {
        success: false,
        error: error.message || "Execution failed",
        shouldContinue: false,
      };
    }
  }

  /**
   * Substitute variables in message (e.g., [customer_name] -> actual value)
   */
  private substituteVariables(message: string, gatheredData: Record<string, any>): string {
    if (!message || !gatheredData) return message;
    
    // Replace [variable_name] with values from gatheredData
    let result = message;
    
    // Common variable name mappings (e.g., "name" -> "customer_name", "inquiry" -> "inquiry_reason")
    const variableMappings: Record<string, string[]> = {
      "customer_name": ["name", "customer_name", "customerName", "customer name", "What is your name"],
      "inquiry_reason": ["inquiry", "inquiry_reason", "inquiryReason", "inquiry reason", "reason", "What would you like help with"],
    };
    
    // Debug: log gathered data
    console.log("[Variable Substitution] Gathered data keys:", Object.keys(gatheredData));
    console.log("[Variable Substitution] Gathered data:", JSON.stringify(gatheredData));
    console.log("[Variable Substitution] Original message:", message);
    
    // Match [variable_name] patterns
    const variablePattern = /\[([^\]]+)\]/g;
    result = result.replace(variablePattern, (match, varName) => {
      const key = varName.trim();
      console.log("[Variable Substitution] Looking for variable:", key);
      
      // Try exact match first
      if (gatheredData[key] !== undefined && gatheredData[key] !== null && gatheredData[key] !== "") {
        console.log("[Variable Substitution] Found exact match:", key, "=", gatheredData[key]);
        return String(gatheredData[key]);
      }
      
      // Try case-insensitive match
      const lowerKey = key.toLowerCase();
      for (const [dataKey, value] of Object.entries(gatheredData)) {
        if (dataKey.toLowerCase() === lowerKey && value !== null && value !== undefined && value !== "") {
          console.log("[Variable Substitution] Found case-insensitive match:", dataKey, "=", value);
          return String(value);
        }
      }
      
      // Try variable mappings (e.g., customer_name -> name)
      if (variableMappings[key]) {
        for (const mappedKey of variableMappings[key]) {
          if (gatheredData[mappedKey] !== undefined && gatheredData[mappedKey] !== null && gatheredData[mappedKey] !== "") {
            console.log("[Variable Substitution] Found via mapping:", mappedKey, "=", gatheredData[mappedKey]);
            return String(gatheredData[mappedKey]);
          }
          // Also try case-insensitive match for mapped keys
          for (const [dataKey, value] of Object.entries(gatheredData)) {
            if (dataKey.toLowerCase() === mappedKey.toLowerCase() && value !== null && value !== undefined && value !== "") {
              console.log("[Variable Substitution] Found via case-insensitive mapping:", dataKey, "=", value);
              return String(value);
            }
          }
        }
      }
      
      // Try partial key matching (e.g., if key is "customer_name" and we have "name")
      for (const [dataKey, value] of Object.entries(gatheredData)) {
        if (value !== null && value !== undefined && value !== "") {
          // Check if the variable name contains the data key or vice versa
          if (key.toLowerCase().includes(dataKey.toLowerCase()) || dataKey.toLowerCase().includes(key.toLowerCase())) {
            // Only use if it's a reasonable match (not too generic)
            if (dataKey.length > 2 && key.length > 2) {
              console.log("[Variable Substitution] Found via partial match:", dataKey, "=", value);
              return String(value);
            }
          }
        }
      }
      
      // If not found, return empty string instead of placeholder
      console.log("[Variable Substitution] Variable not found:", key, "- returning empty string");
      return "";
    });
    
    console.log("[Variable Substitution] Final message:", result);
    return result;
  }

  /**
   * Execute a "Say" step - Use configured message or generate AI response
   */
  private async executeSayStep(step: any, userInput: string): Promise<StepResult> {
    // If step has a configured message (ai_message), use it directly
    // Otherwise, generate AI response
    let output: string;
    if (step.ai_message && step.ai_message.trim().length > 0) {
      // Use the exact configured message and substitute variables
      output = this.substituteVariables(step.ai_message.trim(), this.context.gatheredData);
    } else {
      // Fallback to AI generation if no message configured
      output = await this.generateAIResponse(step, userInput);
    }

    // Check for branches
    const nextStep = await this.evaluateBranches(step.id, userInput, output);

    // If no branch selected, get next step in scenario
    let nextStepId = nextStep?.next_step_id || null;
    if (!nextStepId && !nextStep?.next_scenario_id) {
      nextStepId = await this.getNextStepInScenario(step.id);
    }

    return {
      success: true,
      output: output,
      nextStepId: nextStepId,
      nextScenarioId: nextStep?.next_scenario_id || null,
      shouldContinue: nextStepId !== null || nextStep?.next_scenario_id !== null,
    };
  }

  /**
   * Execute a "Gather" step - Extract information from user input
   */
  private async executeGatherStep(step: any, userInput: string): Promise<StepResult> {
    // Use AI to extract the requested information
    const extractedData = await this.extractInformation(step, userInput);

    // Store gathered data - use step.name as key, or a default key
    const gatherKey = step.name || step.variable || "gathered_value";
    const gatheredData = {
      ...this.context.gatheredData,
      [gatherKey]: extractedData.trim(),
    };

    // Check if this is a general question/inquiry gathering step
    // We'll treat it as an inquiry if:
    // 1. The step name/message contains inquiry/question keywords, OR
    // 2. This is the first gather step in the conversation (after greeting), OR
    // 3. The step is explicitly asking for a question/inquiry
    const stepMessage = (step.ai_message || step.name || "").toLowerCase();
    const isInquiryStep = 
      gatherKey.toLowerCase().includes("inquiry") || 
                         gatherKey.toLowerCase().includes("question") ||
                         gatherKey.toLowerCase().includes("help") ||
                         gatherKey.toLowerCase().includes("issue") ||
      stepMessage.includes("how can i help") ||
      stepMessage.includes("what can i help") ||
      stepMessage.includes("how may i help") ||
      stepMessage.includes("what would you like") ||
      stepMessage.includes("what do you need") ||
      stepMessage.includes("what's your question") ||
      stepMessage.includes("what is your question") ||
      // If this is the first gather step (no inquiry_answered flag), treat it as inquiry
      (!this.context.gatheredData.inquiry_answered && Object.keys(this.context.gatheredData).length === 0);

    let output = "";
    let nextStepId: string | null = null;
    let nextStep: { next_step_id?: string | null; next_scenario_id?: string | null } | null = null;

    // If this is an inquiry step and we have user input, answer it using policies/data sources
    if (isInquiryStep && extractedData.trim().length > 0) {
      // This is an inquiry - use AI with policies/data sources to answer
      console.log("[Gather] Detected inquiry/question step, generating AI response with policies/data sources");
      console.log("[Gather] Customer question:", extractedData.trim());
      
      // Load agent context (policies, data sources, personalization)
      const agentContext = await this.loadAgentContext();
      
      // Build prompt for answering the inquiry
      const systemPrompt = this.buildSystemPrompt(agentContext);
      
      const userPrompt = `The customer asked: "${extractedData.trim()}"

Based on the policies and knowledge base provided above, provide a helpful, accurate answer. Be concise but complete. If you don't have enough information in the knowledge base, politely say so and offer to help them further or connect them with someone who can help.

After providing your answer, ask if there's anything else you can help with.`;

      // Generate AI response using policies and data sources
      output = await this.generateAIResponseWithContext(systemPrompt, userPrompt);
      
      // Store that we've answered the inquiry and are now in Q&A mode
      gatheredData.inquiry_answered = true;
      gatheredData.inquiry = extractedData.trim();
      gatheredData.last_question = extractedData.trim();
      
      // Stay on the same step (or loop back) to continue Q&A mode
      // The next iteration will check inquiry_answered and handle follow-up questions
      nextStepId = step.id; // Stay on this step for Q&A mode
      console.log("[Gather] Answered inquiry, staying in Q&A mode on step:", step.id);
    } else {
      // Regular gather step - check for branches
      nextStep = await this.evaluateBranches(step.id, userInput, extractedData);

      // If no branch selected, get next step in scenario
      nextStepId = nextStep?.next_step_id || null;
      if (!nextStepId && !nextStep?.next_scenario_id) {
        nextStepId = await this.getNextStepInScenario(step.id);
      }
    }

    // If there's a next step and we haven't generated output yet, try to find a Say step to execute immediately
    // This handles chains like: Gather -> IF -> Say (execute all in one go)
    let finalNextStepId = nextStepId;
    
    if (nextStepId && !output) {
      // Follow the chain of steps until we find a Say step or hit a dead end
      let currentStepId = nextStepId;
      let maxDepth = 5; // Prevent infinite loops
      let depth = 0;
      
      while (currentStepId && depth < maxDepth && !output) {
        const currentStepData = await this.loadStep(currentStepId);
        if (!currentStepData) break;
        
        if (currentStepData.type === "say") {
          // Found a Say step - use it
          if (currentStepData.ai_message && currentStepData.ai_message.trim().length > 0) {
            output = this.substituteVariables(currentStepData.ai_message.trim(), gatheredData);
          } else {
            output = await this.generateAIResponse(currentStepData, userInput);
          }
          // Find the step after this Say step
          const stepAfterSay = await this.evaluateBranches(currentStepData.id, userInput, output);
          if (stepAfterSay?.next_step_id) {
            finalNextStepId = stepAfterSay.next_step_id;
          } else {
            finalNextStepId = await this.getNextStepInScenario(currentStepData.id);
          }
          break;
        } else if (currentStepData.type === "if") {
          // Execute the IF statement to find which branch to take
          const branchResult = await this.evaluateBranches(currentStepData.id, userInput, gatheredData);
          if (branchResult?.next_step_id) {
            currentStepId = branchResult.next_step_id;
          } else if (branchResult?.next_scenario_id) {
            // Branch leads to another scenario - stop here
            finalNextStepId = null;
            break;
          } else {
            // No branch matched, get next step in scenario
            currentStepId = await this.getNextStepInScenario(currentStepData.id);
          }
        } else {
          // Other step types (Gather, Code, etc.) - stop here, they'll be handled next iteration
          finalNextStepId = currentStepId;
          break;
        }
        
        depth++;
      }
      
      // If we didn't find a Say step, use the final next step ID
      if (!output) {
        finalNextStepId = currentStepId;
      }
    }

    // Return the output and next step ID
    return {
      success: true,
      output: output, // Will be empty if no Say step found, or the Say step's message
      nextStepId: finalNextStepId,
      nextScenarioId: nextStep?.next_scenario_id || null,
      gatheredData,
      shouldContinue: finalNextStepId !== null || nextStep?.next_scenario_id !== null,
    };
  }

  /**
   * Execute an "If" step - Conditional branching
   */
  private async evaluateBranches(stepId: string, userInput: string, context: any): Promise<any> {
    const { data: branches } = await this.supabase
      .from("branches")
      .select("*")
      .eq("step_id", stepId)
      .order("created_at", { ascending: true });

    if (!branches || branches.length === 0) {
      return null;
    }

    // Evaluate each branch condition
    for (const branch of branches) {
      const conditionMet = await this.evaluateCondition(branch, userInput, context);
      if (conditionMet) {
        return {
          next_step_id: branch.next_step_id,
          next_scenario_id: branch.next_scenario_id,
          target: branch.target,
        };
      }
    }

    return null;
  }

  /**
   * Execute an "If" step - Conditional branching (silent, no output)
   */
  private async executeIfStep(step: any, userInput: string): Promise<StepResult> {
    const branchResult = await this.evaluateBranches(step.id, userInput, this.context.gatheredData);
    
    // Get the next step ID from the branch result, or find next step in scenario
    let nextStepId = branchResult?.next_step_id || null;
    if (!nextStepId && !branchResult?.next_scenario_id) {
      nextStepId = await this.getNextStepInScenario(step.id);
    }

    // IF statements should not produce output themselves
    // But if the next step is a "Say" step, we should use its message
    let output = "";
    if (nextStepId) {
      const nextStepData = await this.loadStep(nextStepId);
      if (nextStepData) {
        if (nextStepData.type === "say") {
          // For "say" steps, use configured message if available, otherwise generate
          if (nextStepData.ai_message && nextStepData.ai_message.trim().length > 0) {
            // Substitute variables in the message
            output = this.substituteVariables(nextStepData.ai_message.trim(), this.context.gatheredData);
            // Update nextStepId to point to the step after this "say" step
            const stepAfterSay = await this.evaluateBranches(nextStepData.id, userInput, output);
            if (stepAfterSay?.next_step_id) {
              nextStepId = stepAfterSay.next_step_id;
            } else {
              nextStepId = await this.getNextStepInScenario(nextStepData.id);
            }
          } else {
            output = await this.generateAIResponse(nextStepData, userInput);
            // Update nextStepId to point to the step after this "say" step
            const stepAfterSay = await this.evaluateBranches(nextStepData.id, userInput, output);
            if (stepAfterSay?.next_step_id) {
              nextStepId = stepAfterSay.next_step_id;
            } else {
              nextStepId = await this.getNextStepInScenario(nextStepData.id);
            }
          }
        }
        // For other step types, output remains empty - they'll be handled in the next iteration
      }
    }
    
    return {
      success: true,
      output: output, // Empty unless next step is a "Say" step
      nextStepId: nextStepId,
      nextScenarioId: branchResult?.next_scenario_id || null,
      shouldContinue: nextStepId !== null || branchResult?.next_scenario_id !== null,
    };
  }

  /**
   * Execute a "Code" step - Run custom code
   */
  private async executeCodeStep(step: any, userInput: string): Promise<StepResult> {
    // For security, code execution should be sandboxed
    // This is a simplified version - in production, use a proper sandbox
    try {
      // Extract code from step message
      const code = step.ai_message || "";
      
      // Create a safe execution context
      const context = {
        userInput,
        gatheredData: this.context.gatheredData,
        conversationState: this.context.conversationState,
      };

      // Execute code (in production, use a proper sandbox like VM2 or isolated container)
      // For now, we'll just return a placeholder
      const result = `Code executed: ${code.substring(0, 50)}...`;

      return {
        success: true,
        output: result,
        shouldContinue: true,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        shouldContinue: false,
      };
    }
  }

  /**
   * Execute an "API Call" step
   */
  private async executeApiCallStep(step: any, userInput: string): Promise<StepResult> {
    try {
      // Extract API endpoint and method from step
      const apiConfig = JSON.parse(step.ai_message || "{}");
      
      const response = await fetch(apiConfig.url, {
        method: apiConfig.method || "GET",
        headers: apiConfig.headers || {},
        body: apiConfig.body ? JSON.stringify(apiConfig.body) : undefined,
      });

      const data = await response.json();

      return {
        success: true,
        output: JSON.stringify(data),
        shouldContinue: true,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        shouldContinue: false,
      };
    }
  }

  /**
   * Execute a "Schedule" step - Create appointment from gathered data
   */
  private async executeScheduleStep(step: any, userInput: string): Promise<StepResult> {
    try {
      // Extract appointment details from gathered data and user input
      const gatheredData = this.context.gatheredData || {};
      
      // Use AI to extract appointment information from user input
      const appointmentInfo = await this.extractAppointmentInfo(userInput, gatheredData);
      
      if (!appointmentInfo.success) {
        return {
          success: false,
          output: appointmentInfo.error || "I couldn't extract the appointment details. Could you please provide the date, time, and service type?",
          shouldContinue: true, // Continue to gather more info
        };
      }

      // Get base URL for API call
      const baseUrl = process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL || "";
      if (!baseUrl) {
        return {
          success: false,
          error: "Configuration error: Missing base URL",
          shouldContinue: false,
        };
      }

      // Get conversation to find contact phone
      const { data: conversation } = await this.supabase
        .from("conversations")
        .select("from_number, to_number")
        .eq("id", this.context.conversationId)
        .single();

      // Create appointment via API
      const response = await fetch(`${baseUrl}/api/agents/${this.context.agentId}/schedule`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contactName: appointmentInfo.contactName || "Caller",
          contactPhone: appointmentInfo.contactPhone || conversation?.from_number || "",
          scheduledAt: appointmentInfo.scheduledAt,
          serviceType: appointmentInfo.serviceType,
          durationMinutes: appointmentInfo.durationMinutes || 60,
          notes: appointmentInfo.notes || "",
          fromNumber: conversation?.from_number,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        return {
          success: false,
          output: errorData.error || "I couldn't schedule that appointment. " + (errorData.conflicts ? "That time slot is already booked." : "Please try a different time."),
          shouldContinue: true,
        };
      }

      const data = await response.json();
      const appointment = data.appointment;

      // Format confirmation message
      const scheduledDate = new Date(appointment.scheduled_at);
      const formattedDate = scheduledDate.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });

      const confirmationMessage = step.ai_message || 
        `Perfect! I've scheduled your ${appointment.service_type} appointment for ${formattedDate}. ` +
        `The appointment is confirmed and you'll receive a reminder. Is there anything else I can help you with?`;

      // Store appointment ID in gathered data
      const updatedGatheredData = {
        ...gatheredData,
        appointmentId: appointment.id,
        appointmentScheduledAt: appointment.scheduled_at,
        appointmentServiceType: appointment.service_type,
      };

      return {
        success: true,
        output: confirmationMessage,
        gatheredData: updatedGatheredData,
        shouldContinue: true,
      };
    } catch (error: any) {
      console.error("Schedule step error:", error);
      return {
        success: false,
        error: error.message || "Failed to schedule appointment",
        shouldContinue: true, // Continue to allow retry
      };
    }
  }

  /**
   * Extract appointment information from user input using AI
   */
  private async extractAppointmentInfo(
    userInput: string,
    gatheredData: Record<string, any>
  ): Promise<{
    success: boolean;
    contactName?: string;
    contactPhone?: string;
    scheduledAt?: string;
    serviceType?: string;
    durationMinutes?: number;
    notes?: string;
    error?: string;
  }> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        success: false,
        error: "AI service not configured",
      };
    }

    // Build context from gathered data
    const context = Object.entries(gatheredData)
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n");

    const prompt = `Extract appointment scheduling information from the user's message and gathered data.

Gathered data so far:
${context || "None"}

User message: ${userInput}

Extract the following information:
- contactName: The person's name (use gathered data if available)
- contactPhone: Phone number (use gathered data if available)
- scheduledAt: Date and time in ISO 8601 format (YYYY-MM-DDTHH:MM:SS). If only date is provided, suggest a reasonable time (9 AM - 5 PM). If time is ambiguous, use the next available business hour.
- serviceType: Type of service/appointment (e.g., "Consultation", "Meeting", "Service Call")
- durationMinutes: Duration in minutes (default: 60)
- notes: Any additional notes

Return ONLY valid JSON in this format:
{
  "success": true,
  "contactName": "string or null",
  "contactPhone": "string or null",
  "scheduledAt": "ISO 8601 string or null",
  "serviceType": "string or null",
  "durationMinutes": number or null,
  "notes": "string or null"
}

If critical information is missing (especially scheduledAt or serviceType), set "success": false and include an "error" field explaining what's missing.`;

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "You are an appointment scheduling assistant. Extract appointment details from conversations. Return only valid JSON.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 500,
        }),
      });

      if (!response.ok) {
        return {
          success: false,
          error: "Failed to extract appointment information",
        };
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content || "";

      // Parse JSON response
      const cleaned = content.trim().replace(/```json|```/g, "");
      const parsed = JSON.parse(cleaned);

      if (!parsed.success) {
        return {
          success: false,
          error: parsed.error || "Missing appointment information",
        };
      }

      // Validate required fields
      if (!parsed.scheduledAt || !parsed.serviceType) {
        return {
          success: false,
          error: "Missing required information: date/time and service type",
        };
      }

      return {
        success: true,
        contactName: parsed.contactName || gatheredData.name || gatheredData.contactName || null,
        contactPhone: parsed.contactPhone || gatheredData.phone || gatheredData.contactPhone || null,
        scheduledAt: parsed.scheduledAt,
        serviceType: parsed.serviceType,
        durationMinutes: parsed.durationMinutes || 60,
        notes: parsed.notes || null,
      };
    } catch (error: any) {
      console.error("Appointment extraction error:", error);
      return {
        success: false,
        error: "Failed to parse appointment information",
      };
    }
  }

  /**
   * Generate AI response using OpenAI with custom context
   */
  private async generateAIResponseWithContext(systemPrompt: string, userPrompt: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    // Build messages array - safely handle transcript
    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPrompt },
    ];
    
    // Add transcript messages if available and valid
    if (this.context.transcript && Array.isArray(this.context.transcript)) {
      const transcriptMessages = this.context.transcript
        .slice(-10)
        .filter((msg: any) => msg && msg.role && msg.content) // Filter out invalid messages
        .map((msg: any) => ({
          role: msg.role === "user" || msg.role === "assistant" ? msg.role : "user",
          content: String(msg.content || ""),
        }));
      messages.push(...transcriptMessages);
    }
    
    messages.push({ role: "user", content: userPrompt });

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response.";
  }

  /**
   * Generate AI response using OpenAI
   */
  private async generateAIResponse(step: any, userInput: string): Promise<string> {
    // Load agent context (policies, data sources, personalization)
    const agentContext = await this.loadAgentContext();

    // Build prompt
    const systemPrompt = this.buildSystemPrompt(agentContext);
    const userPrompt = this.buildUserPrompt(step, userInput, agentContext);

    return await this.generateAIResponseWithContext(systemPrompt, userPrompt);
  }

  /**
   * Check if customer is satisfied and wants to end the conversation
   */
  private async checkSatisfaction(userInput: string): Promise<{ isSatisfied: boolean; closingMessage?: string }> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      // Simple keyword matching fallback
      const lowerInput = userInput.toLowerCase();
      const satisfiedKeywords = ["no", "that's all", "that's it", "nothing else", "all set", "good", "thanks", "thank you"];
      const isSatisfied = satisfiedKeywords.some(keyword => lowerInput.includes(keyword));
      return {
        isSatisfied,
        closingMessage: isSatisfied ? "Thank you for calling! Have a great day!" : undefined,
      };
    }

    const prompt = `Determine if the customer is satisfied and wants to end the conversation.

User said: "${userInput}"

Respond with ONLY valid JSON:
{
  "isSatisfied": true or false,
  "closingMessage": "A brief, friendly closing message if satisfied, or null if not satisfied"
}

The customer is satisfied if they indicate:
- They don't need anything else
- They're all set
- They're done
- They're saying goodbye
- They're thanking you and ending

Be generous - if it's unclear, assume they want to continue.`;

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "You are a conversation analyzer. Return only valid JSON." },
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 100,
        }),
      });

      if (!response.ok) {
        return { isSatisfied: false };
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content || "";
      const cleaned = content.trim().replace(/```json|```/g, "");
      const parsed = JSON.parse(cleaned);

      return {
        isSatisfied: parsed.isSatisfied === true,
        closingMessage: parsed.closingMessage || undefined,
      };
    } catch (error) {
      console.error("[Satisfaction Check] Error:", error);
      return { isSatisfied: false };
    }
  }

  /**
   * Extract information from user input (for Gather steps)
   */
  private async extractInformation(step: any, userInput: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return userInput; // Fallback to raw input
    }

    const prompt = `Extract the requested information from the user's message.

Step context: ${step.ai_message || step.prompt || "No context provided"}
User message: ${userInput}

Extract ONLY the requested information. Return JUST the extracted value, nothing else. Do not add any commentary, explanation, or phrases like "it seems" or "you mentioned". Just return the extracted information.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are an information extraction assistant. Extract only the requested information." },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      return userInput; // Fallback
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || userInput;
  }

  /**
   * Evaluate a branch condition
   */
  private async evaluateCondition(branch: any, userInput: string, context: any): Promise<boolean> {
    if (!branch.condition && !branch.condition_tag) {
      return false;
    }

    // Use AI to evaluate condition
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      // Simple keyword matching fallback
      const condition = (branch.condition || "").toLowerCase();
      return userInput.toLowerCase().includes(condition);
    }

    const prompt = `Evaluate if this condition is met:

Condition: ${branch.condition || branch.condition_tag}
User input: ${userInput}
Context: ${JSON.stringify(context)}

Respond with only "true" or "false".`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a condition evaluator. Respond with only 'true' or 'false'." },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 10,
      }),
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    const result = data.choices[0]?.message?.content?.toLowerCase().trim();
    return result === "true";
  }

  /**
   * Load step from database
   */
  private async loadStep(stepId: string | null): Promise<any> {
    if (!stepId) {
      console.warn("[Agent Executor] loadStep called with null stepId");
      return null;
    }

    try {
      const { data, error } = await this.supabase
      .from("steps")
      .select("*")
      .eq("id", stepId)
      .single();

      if (error) {
        console.error("[Agent Executor] Error loading step:", error);
        return null;
      }

    return data;
    } catch (error: any) {
      console.error("[Agent Executor] Exception loading step:", error);
      return null;
    }
  }

  /**
   * Get next step in scenario (by sort_order)
   */
  private async getNextStepInScenario(currentStepId: string): Promise<string | null> {
    // Get current step to find its scenario and sort_order
    const currentStep = await this.loadStep(currentStepId);
    if (!currentStep || !currentStep.scenario_id) return null;

    // Get next step in same scenario
    const { data: nextStep } = await this.supabase
      .from("steps")
      .select("id")
      .eq("scenario_id", currentStep.scenario_id)
      .gt("sort_order", currentStep.sort_order || 0)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();

    return nextStep?.id || null;
  }

  /**
   * Load agent context (policies, data sources, personalization)
   */
  private async loadAgentContext(): Promise<any> {
    const [policies, dataSources, personalization] = await Promise.all([
      this.supabase.from("agent_policies").select("*").eq("agent_id", this.context.agentId),
      this.supabase.from("agent_data_sources").select("*").eq("agent_id", this.context.agentId),
      this.supabase.from("personalization").select("*").eq("agent_id", this.context.agentId).maybeSingle(),
    ]);

    // Helper function to enrich file-based sources
    const enrichSource = async (source: any, sourceType: string) => {
      // If it's a text source with content, use it as-is
      if (source.type === "text" && source.content) {
        return source;
      }
      
      // If it's a file source, fetch and extract content
      if (source.type === "file" && source.file_url) {
        try {
          console.log(`[Agent Context] Fetching ${sourceType} file content from: ${source.file_url}`);
          const fileContent = await this.fetchFileContent(source.file_url, source.file_type);
    return {
            ...source,
            content: fileContent, // Add extracted content
          };
        } catch (error: any) {
          console.error(`[Agent Context] Failed to fetch ${sourceType} file content for ${source.name}:`, error);
          // Return source without content if fetch fails
          return {
            ...source,
            content: `[File content unavailable: ${error.message}]`,
          };
        }
      }
      
      // Return as-is if no content to fetch
      return source;
    };

    // Enrich both policies and data sources
    const enrichedPolicies = await Promise.all(
      (policies.data || []).map((policy: any) => enrichSource(policy, "policy"))
    );
    
    const enrichedDataSources = await Promise.all(
      (dataSources.data || []).map((source: any) => enrichSource(source, "data source"))
    );

    console.log(`[Agent Context] Loaded ${enrichedPolicies.length} policies, ${enrichedDataSources.length} data sources`);

    return {
      policies: enrichedPolicies,
      dataSources: enrichedDataSources,
      personalization: personalization.data || null,
    };
  }

  /**
   * Extract text from images using OCR (Optical Character Recognition)
   */
  private async extractTextWithOCR(fileUrl: string, fileType: string): Promise<string> {
    try {
      console.log(`[OCR] Starting OCR extraction for ${fileType}...`);
      
      // Fetch the image
      const response = await fetch(fileUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch file for OCR: ${response.status}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      // Initialize Tesseract worker
      const worker = await createWorker('eng'); // English language
      
      try {
        // Perform OCR
        const { data: { text } } = await worker.recognize(buffer);
        
        // Clean up worker
        await worker.terminate();
        
        const extractedText = text.trim();
        console.log(`[OCR] Extracted ${extractedText.length} characters`);
        
        return extractedText;
      } catch (ocrError: any) {
        // Make sure to terminate worker even on error
        await worker.terminate();
        throw ocrError;
      }
    } catch (error: any) {
      console.error("[OCR] Error during OCR extraction:", error);
      throw error;
    }
  }

  /**
   * Fetch and extract text content from a file URL
   */
  private async fetchFileContent(fileUrl: string, fileType?: string): Promise<string> {
    try {
      // Fetch the file
      const response = await fetch(fileUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
      }

      const contentType = fileType || response.headers.get("content-type") || "";

      // Handle different file types
      if (contentType.includes("text/") || contentType.includes("application/json") || contentType.includes("application/xml")) {
        // Text-based files
        return await response.text();
      } else if (contentType === "application/pdf") {
        // PDF files - extract text using pdf-parse
        try {
          console.log("[Agent Context] Extracting text from PDF...");
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          
          // Parse PDF
          const pdfData = await pdfParse(buffer, {
            // Options for better extraction
            max: 0, // 0 = no page limit
          });
          
          const extractedText = pdfData.text.trim();
          
          if (!extractedText || extractedText.length === 0) {
            // PDF appears to be image-based (scanned document) - try OCR on first page
            console.warn("[Agent Context] PDF appears to be image-based, attempting OCR...");
            try {
              // For image-based PDFs, we need to convert pages to images first
              // This is a simplified approach - in production, you might want to use pdf2pic
              // For now, we'll note that OCR for image-based PDFs requires page-to-image conversion
              console.warn("[Agent Context] Image-based PDF detected. OCR for multi-page PDFs requires converting pages to images first, which may not be fully supported.");
              return `[PDF file: ${fileUrl}. This PDF appears to be a scanned document (image-based). Text extraction from scanned PDFs requires converting each page to an image and then using OCR, which is computationally intensive. For now, please use individual image files (PNG/JPG) for OCR, or convert the PDF pages to images first.]`;
            } catch (ocrError: any) {
              console.warn("[Agent Context] OCR processing note:", ocrError.message);
              return `[PDF file: ${fileUrl}. This PDF appears to contain only images (scanned document). OCR for image-based PDFs requires additional processing.]`;
            }
          }
          
          console.log(`[Agent Context] Successfully extracted ${extractedText.length} characters from PDF (${pdfData.numpages} pages)`);
          
          // If PDF is very large, we'll truncate it later in buildSystemPrompt
          return extractedText;
        } catch (pdfError: any) {
          console.error("[Agent Context] Error parsing PDF:", pdfError);
          // Provide helpful error message
          if (pdfError.message?.includes("Invalid PDF")) {
            throw new Error(`Invalid or corrupted PDF file: ${pdfError.message}`);
          }
          throw new Error(`Failed to parse PDF: ${pdfError.message || "Unknown error"}`);
        }
      } else if (contentType.startsWith("image/")) {
        // Images - use OCR to extract text
        try {
          console.log("[Agent Context] Extracting text from image using OCR...");
          const ocrText = await this.extractTextWithOCR(fileUrl, contentType);
          if (ocrText && ocrText.trim().length > 0) {
            console.log(`[Agent Context] OCR extracted ${ocrText.length} characters from image`);
            return ocrText;
          } else {
            return `[Image file: ${fileUrl}. OCR was attempted but no text could be extracted. The image may not contain readable text.]`;
          }
        } catch (ocrError: any) {
          console.error("[Agent Context] OCR error:", ocrError);
          return `[Image file: ${fileUrl}. OCR extraction failed: ${ocrError.message}]`;
        }
      } else {
        // Unknown type - try as text
        try {
          return await response.text();
        } catch {
          return `[Binary file: ${fileUrl}. Content type: ${contentType}]`;
        }
      }
    } catch (error: any) {
      console.error("[Agent Context] Error fetching file content:", error);
      throw error;
    }
  }

  /**
   * Build system prompt from agent context
   */
  private buildSystemPrompt(agentContext: any): string {
    const parts = ["You are a helpful AI receptionist assistant."];

    // Add personalization
    if (agentContext.personalization) {
      const p = agentContext.personalization;
      if (p.personality) parts.push(`Personality: ${p.personality}`);
      if (p.response_style) parts.push(`Response style: ${p.response_style}`);
      if (p.formality) parts.push(`Formality level: ${p.formality}`);
    }

    // Add policies - these are important guidelines for how to respond
    if (agentContext.policies && agentContext.policies.length > 0) {
      let policyCount = 0;
      const policyParts: string[] = [];
      
      agentContext.policies.forEach((policy: any) => {
        // Include policies with content (either text or extracted from files)
        if (policy.content && policy.content.trim()) {
          policyCount++;
          const name = policy.name ? `${policy.name}: ` : "";
          const content = policy.content.trim();
          // Limit content length to avoid token limits (increased for PDFs which can be large)
          // Keep first 10000 chars for policies (they're important)
          const truncatedContent = content.length > 10000 
            ? content.substring(0, 10000) + `... [content truncated, ${content.length - 10000} more characters]` 
            : content;
          policyParts.push(`${policyCount}. ${name}${truncatedContent}`);
        } else if (policy.type === "file" && policy.file_url) {
          // Even if we couldn't extract content, mention the file exists
          policyCount++;
          const name = policy.name ? `${policy.name}: ` : "";
          policyParts.push(`${policyCount}. ${name}[File available at ${policy.file_url} but content could not be extracted]`);
        }
      });
      
      if (policyCount > 0) {
        parts.push("\n=== COMPANY POLICIES ===");
        parts.push("Follow these policies when answering customer questions:");
        parts.push(...policyParts);
        console.log(`[System Prompt] Loaded ${policyCount} policies`);
      } else {
        console.log("[System Prompt] No policies with content found");
      }
    } else {
      console.log("[System Prompt] No policies found");
    }

    // Add data sources - this is the knowledge base for answering questions
    if (agentContext.dataSources && agentContext.dataSources.length > 0) {
      parts.push("\n=== KNOWLEDGE BASE ===");
      parts.push("Use this information to answer customer questions accurately:");
      let sourceCount = 0;
      agentContext.dataSources.forEach((source: any) => {
        // Include sources with content (either text or extracted from files)
        if (source.content && source.content.trim()) {
          sourceCount++;
          const name = source.name ? `${source.name}: ` : "";
          const content = source.content.trim();
          // Limit content length to avoid token limits (increased for PDFs which can be large)
          // Keep first 15000 chars per data source (they're the knowledge base)
          const truncatedContent = content.length > 15000 
            ? content.substring(0, 15000) + `... [content truncated, ${content.length - 15000} more characters]` 
            : content;
          parts.push(`${sourceCount}. ${name}${truncatedContent}`);
        } else if (source.type === "file" && source.file_url) {
          // Even if we couldn't extract content, mention the file exists
          sourceCount++;
          const name = source.name ? `${source.name}: ` : "";
          parts.push(`${sourceCount}. ${name}[File available at ${source.file_url} but content could not be extracted]`);
    }
      });
      
      if (sourceCount === 0) {
        parts.push("(No data sources with content available)");
      } else {
        console.log(`[System Prompt] Loaded ${sourceCount} data sources`);
      }
    } else {
      console.log("[System Prompt] No data sources found");
    }

    // Add instructions for using the knowledge base
    parts.push("\n=== INSTRUCTIONS ===");
    parts.push("- Always refer to the policies and knowledge base above when answering questions");
    parts.push("- If the information is in the knowledge base, use it to provide accurate answers");
    parts.push("- If you don't have the information, politely say so and offer to help further");
    parts.push("- Be friendly, professional, and helpful");
    parts.push("- Keep responses concise but complete");

    return parts.join("\n");
  }

  /**
   * Build user prompt
   */
  private buildUserPrompt(step: any, userInput: string, agentContext: any): string {
    if (step.type === "say") {
      return `User said: "${userInput}"\n\nRespond naturally and helpfully based on the step context: ${step.ai_message || "No specific context"}`;
    }
    return userInput;
  }

  /**
   * Update conversation state after step execution
   */
  private async updateConversationState(result: StepResult): Promise<void> {
    const updates: any = {
      updated_at: new Date().toISOString(),
    };

    if (result.nextStepId !== undefined) {
      updates.current_step_id = result.nextStepId;
    }

    if (result.gatheredData) {
      updates.gathered_data = result.gatheredData;
    }

    // Add to transcript
    const { data: conversation } = await this.supabase
      .from("conversations")
      .select("transcript")
      .eq("id", this.context.conversationId)
      .single();

    const transcript = conversation?.transcript || [];
    transcript.push({
      role: "assistant",
      content: result.output || "",
      timestamp: new Date().toISOString(),
    });

    updates.transcript = transcript;

    await this.supabase
      .from("conversations")
      .update(updates)
      .eq("id", this.context.conversationId);

    // Log step execution
    await this.supabase.from("conversation_steps").insert({
      conversation_id: this.context.conversationId,
      step_id: this.context.currentStepId,
      step_type: "executed",
      output_data: { output: result.output },
    });
  }
}

