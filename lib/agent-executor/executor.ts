/**
 * Agent Execution Engine
 * Core runtime that executes agent scenarios and steps during conversations
 */

import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

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
  // NEW FIELDS:
  transferToAgentId?: string | null;  // For transfer steps
  scheduledSMSId?: string;  // For send_sms steps
  loopState?: any;  // For loop steps
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
   * Continues executing steps automatically until we get output or need user input
   */
  async executeNextStep(userInput: string, maxDepth: number = 10): Promise<StepResult> {
    try {
      // Prevent infinite loops
      if (maxDepth <= 0) {
        return {
          success: false,
          error: "Maximum execution depth reached",
          shouldContinue: false,
        };
      }

      // Load current step
      const step = await this.loadStep(this.context.currentStepId);
      if (!step) {
        // If no step configured, use AI to generate a response
        if (!this.context.currentStepId) {
          // Get agent info for context
          const { data: agent } = await this.supabase
            .from("agents")
            .select("name, description")
            .eq("id", this.context.agentId)
            .single();

          const agentName = agent?.name || "AI Assistant";
          const agentDesc = agent?.description || "";

          // Use OpenAI to generate a response
          const apiKey = process.env.OPENAI_API_KEY;
          if (apiKey) {
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
                      content: `You are ${agentName}. ${agentDesc || "You are a helpful AI assistant."} Be friendly and concise.`,
                    },
                    ...this.context.transcript.slice(-5).map((msg: any) => ({
                      role: msg.role,
                      content: msg.content,
                    })),
                    { role: "user", content: userInput },
                  ],
                  temperature: 0.7,
                  max_tokens: 200,
                }),
              });

              if (response.ok) {
                const data = await response.json();
                const aiResponse = data.choices[0]?.message?.content || "Hello! How can I help you today?";
                return {
                  success: true,
                  output: aiResponse,
                  nextStepId: null,
                  shouldContinue: false,
                };
              }
            } catch (error) {
              console.error("AI generation error:", error);
            }
          }

          // Fallback if AI generation fails
          return {
            success: true,
            output: "Hello! I'm your AI assistant. How can I help you today?",
            nextStepId: null,
            shouldContinue: false,
          };
        }
        return {
          success: false,
          error: "Step not found",
          shouldContinue: false,
        };
      }

      // Check for loop continuation before loading step
      const loopContinuation = await this.checkLoopContinuation(this.context.currentStepId);
      if (loopContinuation) {
        // We're at the end of a loop, check if we should continue
        const loopStep = await this.loadStep(loopContinuation);
        if (loopStep) {
          return await this.executeLoopStep(loopStep, userInput);
        }
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
        case "qa":
          result = await this.executeQAStep(step, userInput);
          break;
        // REMOVED: case "if" - If steps are removed, use branches on Gather/Q/A instead
        case "code":
          result = await this.executeCodeStep(step, userInput);
          break;
        case "api_call":
          result = await this.executeApiCallStep(step, userInput);
          break;
        case "schedule":
          result = await this.executeScheduleStep(step, userInput);
          break;
        // NEW STEP TYPES:
        case "loop":
          result = await this.executeLoopStep(step, userInput);
          break;
        case "send_sms":
          result = await this.executeSendSMSStep(step, userInput);
          break;
        case "transfer":
          result = await this.executeTransferStep(step, userInput);
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

      // If we have no output but have a next step, continue executing automatically
      // This handles cases like: Gather -> IF -> Say (we want to execute IF and Say in one go)
      if (result.success && 
          (!result.output || result.output.trim().length === 0) && 
          result.nextStepId && 
          result.shouldContinue) {
        // Update context to the next step
        const previousContext = { ...this.context };
        this.context.currentStepId = result.nextStepId;
        if (result.gatheredData) {
          this.context.gatheredData = { ...this.context.gatheredData, ...result.gatheredData };
        }
        
        // Continue executing the next step
        const nextResult = await this.executeNextStep(userInput, maxDepth - 1);
        
        // Merge results: use next step's output, but preserve gathered data from both
        if (nextResult.success) {
          return {
            ...nextResult,
            gatheredData: {
              ...result.gatheredData,
              ...nextResult.gatheredData,
            },
          };
        } else {
          // If next step failed, return the original result
          return result;
        }
      }

      return result;
    } catch (error: any) {
      console.error("Agent execution error:", error);
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
      "customer_name": ["name", "customer_name", "customerName", "customer name"],
      "inquiry_reason": ["inquiry", "inquiry_reason", "inquiryReason", "inquiry reason", "reason"],
    };
    
    // Match [variable_name] patterns
    const variablePattern = /\[([^\]]+)\]/g;
    result = result.replace(variablePattern, (match, varName) => {
      const key = varName.trim();
      
      // Try exact match first
      if (gatheredData[key] !== undefined && gatheredData[key] !== null) {
        return String(gatheredData[key]);
      }
      
      // Try case-insensitive match
      const lowerKey = key.toLowerCase();
      for (const [dataKey, value] of Object.entries(gatheredData)) {
        if (dataKey.toLowerCase() === lowerKey) {
          return String(value);
        }
      }
      
      // Try variable mappings (e.g., customer_name -> name)
      if (variableMappings[key]) {
        for (const mappedKey of variableMappings[key]) {
          if (gatheredData[mappedKey] !== undefined && gatheredData[mappedKey] !== null) {
            return String(gatheredData[mappedKey]);
          }
          // Also try case-insensitive match for mapped keys
          for (const [dataKey, value] of Object.entries(gatheredData)) {
            if (dataKey.toLowerCase() === mappedKey.toLowerCase()) {
              return String(value);
            }
          }
        }
      }
      
      // If not found, return the original placeholder
      return match;
    });
    
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

    // Check for branches
    const nextStep = await this.evaluateBranches(step.id, userInput, extractedData);

    // If no branch selected, get next step in scenario
    let nextStepId = nextStep?.next_step_id || null;
    if (!nextStepId && !nextStep?.next_scenario_id) {
      nextStepId = await this.getNextStepInScenario(step.id);
    }

    // Gather steps don't produce output themselves
    // The next step will be executed automatically by executeNextStep
    return {
      success: true,
      output: "", // Empty - next step will be executed automatically
      nextStepId: nextStepId,
      nextScenarioId: nextStep?.next_scenario_id || null,
      gatheredData,
      shouldContinue: nextStepId !== null || nextStep?.next_scenario_id !== null,
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
   * Execute a "Q/A" step - Answer question using data sources
   * Optimized to call data sources directly instead of making HTTP requests
   * Now includes follow-up questions and conversation looping
   */
  private async executeQAStep(step: any, userInput: string): Promise<StepResult> {
    // Check if user wants to end conversation
    const wantsToEnd = await this.checkIfConversationEnd(userInput);
    if (wantsToEnd) {
      return {
        success: true,
        output: "Thank you for calling. Have a great day!",
        shouldContinue: false,
      };
    }

    // Get the question from gathered data (usually from previous Gather step)
    // Try to find the most recent gathered value, or use userInput
    let question = userInput;
    if (!question || question.trim().length === 0) {
      // Try to get from gathered data - use the last value or find by common keys
      const gatheredValues = Object.values(this.context.gatheredData).filter(v => v && String(v).trim().length > 0);
      question = gatheredValues.length > 0 ? String(gatheredValues[gatheredValues.length - 1]) : "";
    }
    
    if (!question || question.trim().length === 0) {
      return {
        success: false,
        error: "No question provided for Q/A step",
        shouldContinue: false,
      };
    }

    try {
      // MODIFIED: Fetch only selected data sources (not all)
      const selectedDataSourceIds = step.selected_data_source_ids || [];
      
      let dataSources = [];
      if (selectedDataSourceIds.length > 0) {
        const { data, error: dsError } = await this.supabase
          .from("agent_data_sources")
          .select("id, name, type, content, file_url, file_type, integration_type, integration_config, last_synced_at")
          .in("id", selectedDataSourceIds)
          .eq("agent_id", this.context.agentId);
        
        if (dsError) {
          console.error("Error fetching data sources:", dsError);
          return {
            success: false,
            error: "Failed to fetch data sources",
            shouldContinue: false,
          };
        }
        
        dataSources = data || [];
      } else {
        // No data sources selected - can still work with AI-only
        console.warn("Q/A step has no data sources selected");
      }

      if (!dataSources || dataSources.length === 0) {
        const answer = "I'm sorry, I don't have any information available to answer that question.";
        // Loop back to Gather step for next question
        const gatherStepId = await this.findGatherStepInScenario(step.id);
        return {
          success: true,
          output: answer,
          nextStepId: gatherStepId,
          shouldContinue: gatherStepId !== null,
        };
      }

      // MODIFIED: Separate static vs live data sources
      const staticSources = dataSources.filter((ds: any) => 
        !ds.integration_type || ds.integration_type === 'static'
      );
      const liveSources = dataSources.filter((ds: any) => 
        ds.integration_type && ds.integration_type !== 'static'
      );
      
      // NEW: Fetch live data sources in parallel
      const liveDataPromises = liveSources.map(async (ds: any) => {
        try {
          const liveData = await this.fetchLiveDataSource(ds);
          return {
            name: ds.name,
            content: liveData,
            type: ds.integration_type
          };
        } catch (error) {
          console.error(`Error fetching live data source ${ds.name}:`, error);
          // Fallback to cached content if available
          return ds.content ? {
            name: ds.name,
            content: ds.content,
            type: 'static'
          } : null;
        }
      });
      
      const liveDataResults = await Promise.all(liveDataPromises);
      const validLiveData = liveDataResults.filter(Boolean);
      
      // Combine static and live data
      const allDataSources = [...staticSources, ...validLiveData];

      // Extract content from all data sources (limit to first 5000 chars per source for speed)
      const dataSourceContents = await Promise.all(
        allDataSources.map(async (ds: any) => {
          if (ds.type === "text" && ds.content) {
            return { name: ds.name, content: ds.content.substring(0, 5000) };
          }
          if (ds.type === "file" && ds.file_url) {
            // Check if content is already extracted and stored
            if (ds.content && ds.content.trim().length > 0) {
              return { name: ds.name, content: ds.content.substring(0, 5000) };
            }
            
            // For PDFs and other files, try to extract text using OpenAI
            // Check if it's a PDF
            const isPDF = ds.file_url.toLowerCase().endsWith('.pdf') || 
                         ds.file_type === 'application/pdf';
            
            if (isPDF) {
              try {
                // Use OpenAI to extract text from PDF
                // First, we need to download the PDF and convert it to base64 or use file API
                // For now, let's try a simpler approach: use OpenAI's file reading if available
                // Or we can fetch the PDF and use a text extraction service
                
                // Since we can't easily parse PDFs in serverless, let's use OpenAI's vision API
                // But that requires the file to be accessible. For now, return a message that
                // the file needs to have its content extracted first.
                
                // Actually, let's check if we can fetch and parse it
                // For PDFs, we'll need to use a service or library
                // For now, skip PDFs without extracted content
                console.warn(`PDF file ${ds.name} does not have extracted content. Skipping.`);
                return null;
              } catch (error) {
                console.error(`Error processing file ${ds.name}:`, error);
                return null;
              }
            }
            
            // For other file types, skip if no content
            return null;
          }
          return null;
        })
      );
      
      // Filter out nulls
      const validContents = dataSourceContents.filter(Boolean);

      if (validContents.length === 0) {
        const answer = "I'm sorry, I couldn't find an answer to that question in my knowledge base.";
        // Loop back to Gather step for next question
        const gatherStepId = await this.findGatherStepInScenario(step.id);
        return {
          success: true,
          output: answer,
          nextStepId: gatherStepId,
          shouldContinue: gatherStepId !== null,
        };
      }

      // Build context from data sources (limit total context size for speed)
      const context = validContents
        .slice(0, 5) // Limit to first 5 data sources
        .map((ds: any) => `[${ds.name}]\n${ds.content}`)
        .join("\n\n---\n\n")
        .substring(0, 8000); // Limit total context to 8000 chars

      // Use OpenAI to generate answer and check if question is answerable
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return {
          success: false,
          error: "OpenAI API key not configured",
          shouldContinue: false,
        };
      }

      // First, check if the question is answerable (within company scope)
      const answerabilityPrompt = `Determine if this question is within the scope of customer support for this company. 
Questions about the AI itself (e.g., "are you an AI?") are answerable and should be answered honestly.
Questions completely unrelated to the company (e.g., asking a supercar company about groceries) are NOT answerable.

KNOWLEDGE BASE CONTEXT:
${context.substring(0, 2000)}

QUESTION: ${question}

Respond with ONLY "answerable" or "not_answerable".`;

      const answerabilityResponse = await fetch("https://api.openai.com/v1/chat/completions", {
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
              content: "You are a scope evaluator. Respond with only 'answerable' or 'not_answerable'.",
            },
            { role: "user", content: answerabilityPrompt },
          ],
          temperature: 0.1,
          max_tokens: 10,
        }),
      });

      let isAnswerable = true;
      if (answerabilityResponse.ok) {
        const answerabilityData = await answerabilityResponse.json();
        const answerabilityResult = answerabilityData.choices[0]?.message?.content?.trim().toLowerCase() || "";
        isAnswerable = answerabilityResult.includes("answerable") && !answerabilityResult.includes("not");
      }

      // If not answerable, return fallback message
      if (!isAnswerable) {
        const fallbackMessage = "Unfortunately, I am only permitted to answer questions regarding customer support, and this doesn't fall into that basis. Or would you like to ask something else?";
        // Loop back to Gather step for next question
        const gatherStepId = await this.findGatherStepInScenario(step.id);
        return {
          success: true,
          output: fallbackMessage,
          nextStepId: gatherStepId,
          shouldContinue: gatherStepId !== null,
        };
      }

      // Generate answer
      const answerPrompt = `Answer this question using ONLY the knowledge base below. Be concise (max 2 sentences). 
If the question is about whether you are an AI, answer honestly that you are an AI assistant.
If not found, say "I don't have that information."

KNOWLEDGE BASE:
${context}

QUESTION: ${question}

Answer:`;

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
              content: "You are a helpful assistant. Answer concisely using only the provided knowledge base. If asked if you are an AI, be honest.",
            },
            { role: "user", content: answerPrompt },
          ],
          temperature: 0.3,
          max_tokens: 200,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("OpenAI API error:", errorText);
        return {
          success: false,
          error: "Failed to generate answer",
          shouldContinue: false,
        };
      }

      const data = await response.json();
      const answer = data.choices[0]?.message?.content?.trim() || "I'm sorry, I couldn't find an answer to that question.";

      // Check if answer has enough context to generate a follow-up question
      const hasEnoughContext = context.length > 500 && answer.length > 20 && !answer.toLowerCase().includes("i don't have");

      let finalOutput = answer;

      if (hasEnoughContext) {
        // Generate a context-aware follow-up question
        const followUpPrompt = `Based on this answer and context, generate ONE concise follow-up question that dives deeper into the topic. 
The question should be natural and encourage the customer to ask more about related products/services.

ANSWER GIVEN: ${answer}
CONTEXT: ${context.substring(0, 3000)}

Generate a follow-up question (max 15 words) that starts with "Would you like to know" or similar. Example: "Would you like to know more about a specific product?"`;

        try {
          const followUpResponse = await fetch("https://api.openai.com/v1/chat/completions", {
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
                  content: "You are a conversational assistant. Generate natural follow-up questions.",
                },
                { role: "user", content: followUpPrompt },
              ],
              temperature: 0.7,
              max_tokens: 50,
            }),
          });

          if (followUpResponse.ok) {
            const followUpData = await followUpResponse.json();
            const followUpQuestion = followUpData.choices[0]?.message?.content?.trim();
            if (followUpQuestion && followUpQuestion.length > 0) {
              // Remove any quotes or extra formatting
              const cleanFollowUp = followUpQuestion.replace(/^["']|["']$/g, "").trim();
              finalOutput = `${answer} ${cleanFollowUp}? Or would you like to ask something else?`;
            } else {
              finalOutput = `${answer} Or would you like to ask something else?`;
            }
          } else {
            finalOutput = `${answer} Or would you like to ask something else?`;
          }
        } catch (error) {
          console.error("Error generating follow-up question:", error);
          finalOutput = `${answer} Or would you like to ask something else?`;
        }
      } else {
        // Not enough context, just append the scripted option
        finalOutput = `${answer} Or would you like to ask something else?`;
      }

      // NEW: Check for branches (like Gather step)
      const branchResult = await this.evaluateBranches(step.id, userInput, {
        ...this.context.gatheredData,
        answer: finalOutput  // Include answer in branch evaluation context
      });
      
      // Use branch result or default to next step
      let nextStepId = branchResult?.next_step_id || null;
      if (!nextStepId && !branchResult?.next_scenario_id) {
        // Try to loop back to Gather step for next question
        const gatherStepId = await this.findGatherStepInScenario(step.id);
        nextStepId = gatherStepId;
      }
      
      return {
        success: true,
        output: finalOutput,
        nextStepId: nextStepId,
        nextScenarioId: branchResult?.next_scenario_id || null,
        shouldContinue: nextStepId !== null || branchResult?.next_scenario_id !== null,
      };
    } catch (error: any) {
      console.error("Q/A step execution error:", error);
      return {
        success: false,
        error: error.message || "Failed to execute Q/A step",
        shouldContinue: false,
      };
    }
  }

  // REMOVED: executeIfStep - If steps are removed, use branches on Gather/Q/A steps instead

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
   * Generate AI response using OpenAI
   */
  private async generateAIResponse(step: any, userInput: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    // Load agent context (policies, data sources, personalization)
    const agentContext = await this.loadAgentContext();

    // Build prompt
    const systemPrompt = this.buildSystemPrompt(agentContext);
    const userPrompt = this.buildUserPrompt(step, userInput, agentContext);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          ...this.context.transcript.slice(-10).map((msg: any) => ({
            role: msg.role,
            content: msg.content,
          })),
          { role: "user", content: userPrompt },
        ],
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
   * Extract information from user input (for Gather steps)
   */
  private async extractInformation(step: any, userInput: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return userInput; // Fallback to raw input
    }

    // Optimized prompt - shorter and more direct
    const prompt = `Extract the requested info. Return ONLY the value.

Context: ${(step.ai_message || step.prompt || "").substring(0, 100)}
User: ${userInput}

Value:`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Extract only the value. No commentary." },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 50, // Reduced for faster responses
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

    // Optimized prompt - shorter and more direct
    const prompt = `Is this condition true? Answer only "true" or "false".

Condition: ${branch.condition || branch.condition_tag}
Input: ${userInput}
Context: ${JSON.stringify(context).substring(0, 200)}

Answer:`;

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
    if (!stepId) return null;

    const { data } = await this.supabase
      .from("steps")
      .select("*")
      .eq("id", stepId)
      .single();

    return data;
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
   * Find a Gather step in the scenario to loop back to for continuous conversation
   */
  private async findGatherStepInScenario(currentStepId: string): Promise<string | null> {
    // Get current step to find its scenario
    const currentStep = await this.loadStep(currentStepId);
    if (!currentStep || !currentStep.scenario_id) return null;

    // Find the first Gather step in the scenario (or any Gather step)
    const { data: gatherStep } = await this.supabase
      .from("steps")
      .select("id")
      .eq("scenario_id", currentStep.scenario_id)
      .eq("type", "gather")
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();

    // If no Gather step found, try to find the next step after current
    if (!gatherStep) {
      return await this.getNextStepInScenario(currentStepId);
    }

    return gatherStep.id;
  }

  /**
   * Check if the user wants to end the conversation
   */
  private async checkIfConversationEnd(userInput: string): Promise<boolean> {
    if (!userInput || userInput.trim().length === 0) return false;

    const endPhrases = [
      "thank you",
      "thanks",
      "that's all",
      "thats all",
      "that is all",
      "nothing else",
      "no more",
      "no thanks",
      "no thank you",
      "goodbye",
      "bye",
      "have a good day",
      "have a nice day",
      "i'm done",
      "im done",
      "i am done",
      "all set",
      "that's it",
      "thats it",
    ];

    const lowerInput = userInput.toLowerCase().trim();
    
    // Check for exact matches or phrases contained in input
    for (const phrase of endPhrases) {
      if (lowerInput === phrase || lowerInput.includes(phrase)) {
        // Make sure it's not part of a longer question
        // If the input is just the phrase or starts/ends with it, it's likely an end signal
        if (lowerInput === phrase || 
            lowerInput.startsWith(phrase + " ") || 
            lowerInput.endsWith(" " + phrase) ||
            lowerInput.length < phrase.length + 10) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Load agent context (policies, data sources, personalization)
   */
  private async loadAgentContext(): Promise<any> {
    const [policies, dataSources, personalization] = await Promise.all([
      this.supabase.from("policies").select("*").eq("agent_id", this.context.agentId),
      this.supabase.from("data_sources").select("*").eq("agent_id", this.context.agentId),
      this.supabase.from("personalization").select("*").eq("agent_id", this.context.agentId).maybeSingle(),
    ]);

    return {
      policies: policies.data || [],
      dataSources: dataSources.data || [],
      personalization: personalization.data || null,
    };
  }

  /**
   * Build system prompt from agent context
   */
  private buildSystemPrompt(agentContext: any): string {
    const parts = ["You are a helpful AI assistant."];

    // Add personalization
    if (agentContext.personalization) {
      const p = agentContext.personalization;
      if (p.personality) parts.push(`Personality: ${p.personality}`);
      if (p.response_style) parts.push(`Response style: ${p.response_style}`);
      if (p.formality) parts.push(`Formality level: ${p.formality}`);
    }

    // Add policies
    if (agentContext.policies.length > 0) {
      parts.push("\nPolicies to follow:");
      agentContext.policies.forEach((policy: any) => {
        if (policy.content) {
          parts.push(`- ${policy.content}`);
        }
      });
    }

    // Add data sources
    if (agentContext.dataSources.length > 0) {
      parts.push("\nKnowledge base:");
      agentContext.dataSources.forEach((source: any) => {
        if (source.content) {
          parts.push(`- ${source.content}`);
        }
      });
    }

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

  /**
   * Execute a "Loop" step - Repeat a sequence of steps
   */
  private async executeLoopStep(step: any, userInput: string): Promise<StepResult> {
    const config = step.loop_config;
    if (!config) {
      return {
        success: false,
        error: "Loop step missing loop_config",
        shouldContinue: false,
      };
    }
    
    // Get or initialize loop state
    const loopState = this.context.conversationState.loopState || {};
    const activeLoop = loopState[step.id] || {
      iteration: 0,
      startStepId: config.start_step_id,
      endStepId: config.end_step_id,
      maxIterations: config.max_iterations || 10,
    };
    
    // Check loop exit conditions
    if (config.loop_type === "for") {
      if (activeLoop.iteration >= activeLoop.maxIterations) {
        // Exit loop - go to next step after loop
        delete loopState[step.id];
        this.context.conversationState.loopState = loopState;
        const nextStepId = await this.getStepAfterLoop(step.id);
        return {
          success: true,
          output: "",
          nextStepId: nextStepId,
          shouldContinue: nextStepId !== null,
        };
      }
    } else if (config.loop_type === "while" || config.loop_type === "until") {
      const conditionMet = await this.evaluateCondition(
        { condition: config.condition },
        userInput,
        this.context.gatheredData
      );
      
      if (config.loop_type === "while" && !conditionMet) {
        // Exit while loop
        delete loopState[step.id];
        this.context.conversationState.loopState = loopState;
        const nextStepId = await this.getStepAfterLoop(step.id);
        return {
          success: true,
          output: "",
          nextStepId: nextStepId,
          shouldContinue: nextStepId !== null,
        };
      } else if (config.loop_type === "until" && conditionMet) {
        // Exit until loop
        delete loopState[step.id];
        this.context.conversationState.loopState = loopState;
        const nextStepId = await this.getStepAfterLoop(step.id);
        return {
          success: true,
          output: "",
          nextStepId: nextStepId,
          shouldContinue: nextStepId !== null,
        };
      }
    }
    
    // Continue loop - increment iteration and jump to start step
    activeLoop.iteration++;
    loopState[step.id] = activeLoop;
    this.context.conversationState.loopState = loopState;
    
    return {
      success: true,
      output: "",
      nextStepId: config.start_step_id,
      loopState: loopState,
      shouldContinue: true,
    };
  }

  /**
   * Execute a "Send SMS" step - Send text message to customer
   */
  private async executeSendSMSStep(step: any, userInput: string): Promise<StepResult> {
    const config = step.sms_config;
    if (!config) {
      return {
        success: false,
        error: "Send SMS step missing sms_config",
        shouldContinue: false,
      };
    }
    
    // Substitute variables in message
    const message = this.substituteVariables(config.message, this.context.gatheredData);
    
    // Get phone number from config or gathered data
    let phoneNumber = config.phone_number;
    if (phoneNumber && phoneNumber.startsWith("{{") && phoneNumber.endsWith("}}")) {
      const variableName = phoneNumber.slice(2, -2).trim();
      phoneNumber = this.context.gatheredData[variableName] || phoneNumber;
    }
    
    if (!phoneNumber) {
      return {
        success: false,
        error: "Phone number not provided for SMS",
        shouldContinue: false,
      };
    }
    
    // Normalize phone number
    const { normalizePhone } = await import("@/lib/phone");
    const normalizedPhone = normalizePhone(phoneNumber);
    if (!normalizedPhone) {
      return {
        success: false,
        error: "Invalid phone number format",
        shouldContinue: false,
      };
    }
    
    // Check optional condition
    if (config.condition) {
      const conditionMet = await this.evaluateCondition(
        { condition: config.condition },
        userInput,
        this.context.gatheredData
      );
      if (!conditionMet) {
        // Skip SMS, continue to next step
        const nextStepId = await this.getNextStepInScenario(step.id);
        return {
          success: true,
          output: "",
          nextStepId: nextStepId,
          shouldContinue: nextStepId !== null,
        };
      }
    }
    
    // Schedule or send immediately
    if (config.delay_minutes && config.delay_minutes > 0) {
      // Schedule SMS
      const scheduledAt = new Date(Date.now() + config.delay_minutes * 60 * 1000);
      
      // Get workspace_id from agent
      const { data: agent } = await this.supabase
        .from("agents")
        .select("workspace_id")
        .eq("id", this.context.agentId)
        .single();
      
      if (!agent) {
        return {
          success: false,
          error: "Agent not found",
          shouldContinue: false,
        };
      }
      
      const { data: scheduledSMS, error } = await this.supabase
        .from("scheduled_sms")
        .insert({
          conversation_id: this.context.conversationId,
          workspace_id: agent.workspace_id,
          agent_id: this.context.agentId,
          phone_number: normalizedPhone,
          message: message,
          scheduled_at: scheduledAt.toISOString(),
          status: "pending",
        })
        .select()
        .single();
      
      if (error) {
        console.error("Failed to schedule SMS:", error);
        return {
          success: false,
          error: "Failed to schedule SMS",
          shouldContinue: false,
        };
      }
      
      return {
        success: true,
        output: "",
        scheduledSMSId: scheduledSMS.id,
        nextStepId: await this.getNextStepInScenario(step.id),
        shouldContinue: true,
      };
    } else {
      // Send immediately
      const sent = await this.sendSMS(normalizedPhone, message);
      if (!sent) {
        return {
          success: false,
          error: "Failed to send SMS",
          shouldContinue: false,
        };
      }
      
      return {
        success: true,
        output: "",
        nextStepId: await this.getNextStepInScenario(step.id),
        shouldContinue: true,
      };
    }
  }

  /**
   * Execute a "Transfer" step - Route to specialist agent
   */
  private async executeTransferStep(step: any, userInput: string): Promise<StepResult> {
    const config = step.transfer_config;
    if (!config) {
      return {
        success: false,
        error: "Transfer step missing transfer_config",
        shouldContinue: false,
      };
    }
    
    let targetAgentId: string | null = null;
    
    // Determine target agent based on transfer method
    if (config.transfer_method === "direct" && config.target_agent_id) {
      targetAgentId = config.target_agent_id;
    } else if (config.transfer_method === "keyword") {
      targetAgentId = await this.findAgentByKeywords(userInput, config.target_role);
    } else if (config.transfer_method === "ai_classification") {
      const specialistRole = await this.classifySpecialistNeeded(userInput, config);
      targetAgentId = await this.findSpecialistAgent(specialistRole);
    } else if (config.transfer_method === "gathered_data") {
      const need = this.context.gatheredData.customer_need || 
                   this.context.gatheredData.service_type ||
                   this.context.gatheredData.request_type;
      targetAgentId = await this.findSpecialistByNeed(need);
    }
    
    // Fallback to specified fallback agent or current agent
    if (!targetAgentId) {
      targetAgentId = config.fallback_agent_id || this.context.agentId;
    }
    
    // Verify agent exists and is deployed
    const { data: targetAgent } = await this.supabase
      .from("agents")
      .select("id, status, workspace_id")
      .eq("id", targetAgentId)
      .eq("status", "deployed")
      .single();
    
    if (!targetAgent) {
      console.error("[Transfer] Target agent not found or not deployed:", targetAgentId);
      // Fallback to current agent
      return {
        success: true,
        output: config.transfer_message || "I'll continue helping you with that.",
        shouldContinue: true,
      };
    }
    
    // Transfer conversation
    await this.transferConversation(targetAgentId, config.transfer_message);
    
    return {
      success: true,
      output: config.transfer_message || "Let me connect you with a specialist...",
      transferToAgentId: targetAgentId,
      shouldContinue: true,
    };
  }

  /**
   * Check if current step is the end of a loop
   */
  private async checkLoopContinuation(currentStepId: string | null): Promise<string | null> {
    if (!currentStepId) return null;
    
    // Find all loop steps
    const { data: loops } = await this.supabase
      .from("steps")
      .select("id, loop_config")
      .eq("type", "loop")
      .eq("scenario_id", this.context.scenarioId);
    
    if (!loops) return null;
    
    for (const loop of loops) {
      if (loop.loop_config?.end_step_id === currentStepId) {
        // We're at the end of a loop, return to loop step to re-evaluate
        return loop.id;
      }
    }
    
    return null;
  }

  /**
   * Get the step that comes after a loop
   */
  private async getStepAfterLoop(loopStepId: string): Promise<string | null> {
    return await this.getNextStepInScenario(loopStepId);
  }

  /**
   * Send SMS via Twilio
   */
  private async sendSMS(phoneNumber: string, message: string): Promise<boolean> {
    try {
      // Get Twilio credentials
      const { data: agent } = await this.supabase
        .from("agents")
        .select("workspace_id, phone_number")
        .eq("id", this.context.agentId)
        .single();
      
      if (!agent) {
        console.error("[SMS] Agent not found");
        return false;
      }
      
      const { data: twilioCreds } = await this.supabase
        .from("twilio_credentials")
        .select("account_sid, auth_token")
        .eq("workspace_id", agent.workspace_id)
        .maybeSingle();
      
      let accountSid: string | null = null;
      let authToken: string | null = null;
      
      if (twilioCreds?.account_sid && twilioCreds?.auth_token) {
        accountSid = twilioCreds.account_sid;
        authToken = twilioCreds.auth_token;
      } else {
        // Fallback to environment variables
        accountSid = process.env.TWILIO_ACCOUNT_SID || null;
        authToken = process.env.TWILIO_AUTH_TOKEN || null;
      }
      
      if (!accountSid || !authToken) {
        console.error("[SMS] Twilio credentials not found");
        return false;
      }
      
      const twilio = (await import("twilio")).default;
      const client = twilio(accountSid, authToken);
      
      await client.messages.create({
        body: message,
        from: agent.phone_number || process.env.TWILIO_PHONE_NUMBER || "",
        to: phoneNumber,
      });
      
      return true;
    } catch (error) {
      console.error("[SMS] Error sending SMS:", error);
      return false;
    }
  }

  /**
   * Classify which specialist is needed using AI
   */
  private async classifySpecialistNeeded(
    userInput: string,
    config: any
  ): Promise<string | null> {
    const prompt = config.classification_prompt || `
      Based on this customer request, determine which specialist they need:
      - "mechanic": Car repairs, engine issues, maintenance, vehicle problems
      - "seller": Purchasing, pricing, product information, buying decisions
      - "support": General questions, account issues, billing
      
      Customer request: "${userInput}"
      Conversation context: ${JSON.stringify(this.context.gatheredData)}
      
      Return only the specialist role name, or "none" if no specialist needed.
    `;
    
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return null;
    }
    
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
            { role: "system", content: "You are a routing assistant. Return only the specialist role name." },
            { role: "user", content: prompt }
          ],
          temperature: 0.3,
          max_tokens: 20,
        }),
      });
      
      if (!response.ok) {
        return null;
      }
      
      const data = await response.json();
      const role = data.choices[0]?.message?.content?.toLowerCase().trim();
      
      return role === "none" ? null : role;
    } catch (error) {
      console.error("Error classifying specialist:", error);
      return null;
    }
  }

  /**
   * Find specialist agent by role
   */
  private async findSpecialistAgent(role: string | null): Promise<string | null> {
    if (!role) return null;
    
    // Get workspace_id from agent
    const { data: agent } = await this.supabase
      .from("agents")
      .select("workspace_id")
      .eq("id", this.context.agentId)
      .single();
    
    if (!agent) return null;
    
    const { data: agents } = await this.supabase
      .from("agents")
      .select("id, agent_role, is_specialist")
      .eq("workspace_id", agent.workspace_id)
      .eq("is_specialist", true)
      .eq("agent_role", role)
      .eq("status", "deployed")
      .limit(1);
    
    return agents && agents.length > 0 ? agents[0].id : null;
  }

  /**
   * Find agent by keywords
   */
  private async findAgentByKeywords(userInput: string, targetRole?: string): Promise<string | null> {
    // Get workspace_id from agent
    const { data: agent } = await this.supabase
      .from("agents")
      .select("workspace_id")
      .eq("id", this.context.agentId)
      .single();
    
    if (!agent) return null;
    
    // Search for agents with matching keywords
    const { data: agents } = await this.supabase
      .from("agents")
      .select("id, routing_keywords, agent_role")
      .eq("workspace_id", agent.workspace_id)
      .eq("status", "deployed");
    
    if (!agents) return null;
    
    const lowerInput = userInput.toLowerCase();
    
    for (const candidate of agents) {
      if (targetRole && candidate.agent_role !== targetRole) continue;
      
      if (candidate.routing_keywords && Array.isArray(candidate.routing_keywords)) {
        for (const keyword of candidate.routing_keywords) {
          if (lowerInput.includes(keyword.toLowerCase())) {
            return candidate.id;
          }
        }
      }
    }
    
    return null;
  }

  /**
   * Find specialist by customer need
   */
  private async findSpecialistByNeed(need: string): Promise<string | null> {
    if (!need) return null;
    
    // Use AI to map need to specialist role, then find agent
    const role = await this.classifySpecialistNeeded(need, {});
    if (!role) return null;
    
    return await this.findSpecialistAgent(role);
  }

  /**
   * Transfer conversation to new agent
   */
  private async transferConversation(targetAgentId: string, message: string): Promise<void> {
    // Get target agent's first scenario/step
    const { data: scenarios } = await this.supabase
      .from("scenarios")
      .select("id")
      .eq("agent_id", targetAgentId)
      .order("created_at", { ascending: true })
      .limit(1);
    
    let currentStepId = null;
    if (scenarios && scenarios.length > 0) {
      const { data: steps } = await this.supabase
        .from("steps")
        .select("id")
        .eq("scenario_id", scenarios[0].id)
        .order("sort_order", { ascending: true })
        .limit(1);
      
      currentStepId = steps && steps.length > 0 ? steps[0].id : null;
    }
    
    // Update conversation
    const transferRecord = {
      from: this.context.agentId,
      to: targetAgentId,
      timestamp: new Date().toISOString(),
      reason: "Specialist routing",
      step_id: this.context.currentStepId,
    };
    
    const { data: conversation } = await this.supabase
      .from("conversations")
      .select("transfer_history")
      .eq("id", this.context.conversationId)
      .single();
    
    const transferHistory = conversation?.transfer_history || [];
    transferHistory.push(transferRecord);
    
    await this.supabase
      .from("conversations")
      .update({
        agent_id: targetAgentId,
        transferred_from_agent_id: this.context.agentId,
        transferred_to_agent_id: targetAgentId,
        transfer_history: transferHistory,
        current_scenario_id: scenarios?.[0]?.id || null,
        current_step_id: currentStepId,
      })
      .eq("id", this.context.conversationId);
    
    // Update context
    this.context.agentId = targetAgentId;
    this.context.scenarioId = scenarios?.[0]?.id || null;
    this.context.currentStepId = currentStepId;
  }

  /**
   * Fetch data from live data source (calendar, sheet, API)
   */
  private async fetchLiveDataSource(dataSource: any): Promise<string> {
    const integrationType = dataSource.integration_type;
    const config = dataSource.integration_config;
    
    if (!integrationType || integrationType === 'static') {
      // Static data source, return stored content
      return dataSource.content || '';
    }
    
    // Get adapter for integration type
    const adapter = this.getIntegrationAdapter(integrationType);
    if (!adapter) {
      console.error(`No adapter found for integration type: ${integrationType}`);
      return dataSource.content || '';  // Fallback to cached content
    }
    
    try {
      // Fetch live data
      const liveData = await adapter.fetchData(config, dataSource);
      return liveData;
    } catch (error) {
      console.error(`Error fetching live data source ${dataSource.name}:`, error);
      // Fallback to cached content if available
      return dataSource.content || '';
    }
  }

  /**
   * Get integration adapter for type
   */
  private getIntegrationAdapter(integrationType: string): any {
    switch (integrationType) {
      case 'google_calendar': {
        const { GoogleCalendarAdapter } = require("@/lib/integrations/adapters/google-calendar");
        return new GoogleCalendarAdapter();
      }
      case 'google_sheet': {
        const { GoogleSheetAdapter } = require("@/lib/integrations/adapters/google-sheet");
        return new GoogleSheetAdapter();
      }
      case 'microsoft_calendar':
      case 'airtable':
      default:
        // Adapters not yet implemented
        return null;
    }
  }
}

