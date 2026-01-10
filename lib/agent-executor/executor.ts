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
                    ...this.context.transcript.slice(-3).map((msg: any) => ({
                      role: msg.role,
                      content: msg.content.substring(0, 200), // Limit each message to 200 chars
                    })),
                    { role: "user", content: userInput },
                  ],
                  temperature: 0.2, // Lower temperature = faster responses
                  max_tokens: 80, // Further reduced for faster generation
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
      console.log(`[AgentExecutor] 🔍 Executing step:`, {
        stepId: step.id,
        stepName: step.name || '(unnamed)',
        stepType: step.type,
        hasUserInput: !!userInput && userInput.trim().length > 0,
        userInputPreview: userInput?.substring(0, 100) || '(no input)',
        scenarioId: this.context.scenarioId,
        agentId: this.context.agentId,
        currentStepId: this.context.currentStepId,
      });
      
      let result: StepResult;
      switch (step.type) {
        case "say":
          console.log(`[AgentExecutor] 📢 Executing SAY step - Will use AI generation with data sources if user input provided`);
          result = await this.executeSayStep(step, userInput);
          break;
        case "gather":
          console.log(`[AgentExecutor] 📝 Executing GATHER step - Extracts information, doesn't use data sources for answering`);
          result = await this.executeGatherStep(step, userInput);
          break;
        case "qa":
          console.log(`[AgentExecutor] ❓ Executing Q/A step - Uses data sources for answering questions`);
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
        case "check_schedule":
          result = await this.executeCheckScheduleStep(step, userInput);
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
      console.error("[AgentExecutor] ❌ CRITICAL ERROR:", error);
      console.error("[AgentExecutor] Error stack:", error.stack);
      console.error("[AgentExecutor] Error details:", {
        message: error.message,
        name: error.name,
        context: {
          agentId: this.context.agentId,
          scenarioId: this.context.scenarioId,
          currentStepId: this.context.currentStepId,
          conversationId: this.context.conversationId,
        },
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
   * CRITICAL: If there's user input, always use AI generation with data sources to answer questions
   */
  private async executeSayStep(step: any, userInput: string): Promise<StepResult> {
    let output: string;
    
    // CRITICAL: If user provided input, ALWAYS use AI generation with data sources
    // This ensures all questions are answered using the knowledge base
    // The static ai_message is only used when there's NO user input (e.g., greeting)
    if (userInput && userInput.trim().length > 0) {
      // User provided input - always use AI generation with agent context (includes data sources)
      console.log(`[Say] User input detected: "${userInput.substring(0, 100)}" - Using AI generation with data sources`);
      output = await this.generateAIResponse(step, userInput);
    } else if (step.ai_message && step.ai_message.trim().length > 0) {
      // No user input yet - use the configured static message (e.g., greeting)
      console.log(`[Say] No user input - Using static message from step: "${step.ai_message.substring(0, 100)}"`);
      output = this.substituteVariables(step.ai_message.trim(), this.context.gatheredData);
    } else {
      // No user input and no message configured - generate AI response anyway
      console.log(`[Say] No user input and no static message - Using AI generation`);
      output = await this.generateAIResponse(step, userInput || "");
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
   * CRITICAL: If user asks a question, use AI generation with data sources to answer it
   */
  private async executeGatherStep(step: any, userInput: string): Promise<StepResult> {
    // If this is the first time hitting this Gather step (no userInput yet), 
    // return the prompt message to be spoken/displayed
    if (!userInput || userInput.trim().length === 0) {
      const promptMessage = step.ai_message || step.name || "Please tell me what you need.";
      return {
        success: true,
        output: promptMessage, // This will be spoken/displayed, then system will listen for input
        nextStepId: step.id, // Stay on this step to gather input
        shouldContinue: true,
      };
    }

    // Check if user wants to end conversation (NEW: Also check in Gather step)
    const wantsToEnd = await this.checkIfConversationEnd(userInput);
    if (wantsToEnd) {
      return {
        success: true,
        output: "Thank you for calling. Have a great day!",
        shouldContinue: false,
      };
    }

    // CRITICAL: If user input looks like a question, use AI generation with data sources to answer it
    // Don't just extract it - actually answer the question!
    const looksLikeQuestion = userInput && (
      userInput.trim().match(/\?$/) || // Ends with ?
      userInput.toLowerCase().match(/\b(what|who|where|when|why|how|which|company|work|service|policy|do you|are you|tell me|about)\b/i)
    );
    
    if (looksLikeQuestion) {
      console.log(`[Gather] User input looks like a question: "${userInput.substring(0, 100)}" - Using AI generation with data sources to answer`);
      // Treat this as a Say step - use AI generation with data sources
      const output = await this.generateAIResponse(step, userInput);
      
      // Stay on this step (don't move forward) so we can handle follow-up questions
      return {
        success: true,
        output: output,
        nextStepId: step.id, // Stay on Gather step for potential follow-up questions
        shouldContinue: true,
      };
    }

    // User has provided input (not a question) - extract the information
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

    // After gathering, move to next step
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
      
      // OPTIMIZATION: Pre-fetch gather step ID in parallel with data sources
      const gatherStepIdPromise = this.findGatherStepInScenario(step.id);
      
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
        console.log(`[Q/A] Found ${dataSources.length} selected data sources for step ${step.id}:`, 
          dataSources.map((ds: any) => ({ id: ds.id, name: ds.name, type: ds.type, hasContent: !!ds.content }))
        );
      } else {
        // No specific data sources selected - fall back to ALL agent data sources
        console.log("Q/A step has no selected data sources - loading ALL agent data sources");
        const { data, error: dsError } = await this.supabase
          .from("agent_data_sources")
          .select("id, name, type, content, file_url, file_type, integration_type, integration_config, last_synced_at")
          .eq("agent_id", this.context.agentId);
        
        if (dsError) {
          console.error("Error fetching all agent data sources:", dsError);
          // Continue without data sources - will use AI-only
        } else {
          dataSources = data || [];
          console.log(`[Q/A] Loaded ${dataSources.length} total agent data sources (no specific selection):`, 
            dataSources.map((ds: any) => ({ id: ds.id, name: ds.name, type: ds.type, hasContent: !!ds.content }))
          );
        }
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

      // OPTIMIZATION: Reduce content size per source for faster processing
      // Extract content from all data sources (limit to first 1000 chars per source for speed)
      const dataSourceContents = await Promise.all(
        allDataSources.map(async (ds: any) => {
          // Handle any data source that has content (text or file with extracted content)
          if (ds.content && ds.content.trim().length > 0) {
            return { name: ds.name, content: ds.content.substring(0, 1000) }; // Further reduced for speed
          }
          
          // Handle file data sources without extracted content
          if (ds.type === "file" && ds.file_url) {
            // For PDFs and other files, try to extract text using OpenAI
            // Check if it's a PDF
            const isPDF = ds.file_url.toLowerCase().endsWith('.pdf') || 
                         ds.file_type === 'application/pdf';
            
            if (isPDF) {
              try {
                // PDFs should have content extracted during upload, but if not, skip
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
          
          // For text data sources without content, skip
          if (ds.type === "text" && (!ds.content || ds.content.trim().length === 0)) {
            console.warn(`Text data source ${ds.name} has no content. Skipping.`);
            return null;
          }
          
          return null;
        })
      );
      
      // Filter out nulls
      const validContents = dataSourceContents.filter(Boolean);
      
      console.log(`[Q/A] Extracted content from ${validContents.length} of ${allDataSources.length} data sources`);
      if (validContents.length === 0) {
        console.warn(`[Q/A] No valid content found. Data sources:`, 
          allDataSources.map((ds: any) => ({ 
            name: ds.name, 
            type: ds.type, 
            hasContent: !!ds.content,
            contentLength: ds.content?.length || 0,
            fileUrl: ds.file_url 
          }))
        );
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

      // OPTIMIZATION: Reduce context size for faster processing
      // Build context from data sources (limit total context size for speed)
      const context = validContents
        .slice(0, 2) // Limit to first 2 data sources
        .map((ds: any) => `[${ds.name}]\n${ds.content.substring(0, 800)}`) // Limit each source to 800 chars (further reduced for speed)
        .join("\n\n---\n\n")
        .substring(0, 1500); // Limit total context to 1500 chars (further reduced for speed)

      // OPTIMIZATION 1: Check response cache first (gather step already being fetched in parallel)
      const cacheKey = this.generateCacheKey(question, context, selectedDataSourceIds);
      const cachedResponse = await this.getCachedResponse(cacheKey, this.context.agentId);
      
      if (cachedResponse) {
        console.log(`[Q/A] Cache HIT for question: "${question.substring(0, 50)}..."`);
        const gatherStepId = await gatherStepIdPromise;
        return {
          success: true,
          output: cachedResponse,
          nextStepId: gatherStepId,
          shouldContinue: gatherStepId !== null,
        };
      }
      console.log(`[Q/A] Cache MISS for question: "${question.substring(0, 50)}..."`);

      // Use OpenAI to generate answer and check if question is answerable
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return {
          success: false,
          error: "OpenAI API key not configured",
          shouldContinue: false,
        };
      }

      // OPTIMIZATION 2: Parallelize answerability check and answer generation
      // Combine both checks into a single, more efficient prompt
      // Include natural follow-up question in the response for better grammar
      // Allow inference and general logic while staying grounded in knowledge base
      const combinedPrompt = `Answer this question using the knowledge base and general logic/inference. End with a natural follow-up question.

RULES:
- Use the knowledge base as your primary source, but you can also use general logic and inference to answer questions
- If you can infer or reason about the answer based on the knowledge base, do so (e.g., if knowledge base says "we're open 9-5", you can infer "we're closed at 8pm")
- If unrelated to the company, say: "I can only help with customer support questions. What else can I help you with?"
- If asked if you're AI, be honest.
- If truly no information available (even with inference), say: "I don't have that specific information. Is there anything else I can help with?"
- Otherwise, answer in 1-2 sentences using knowledge base + inference, then ask: "Is there anything else I can help you with?"

KNOWLEDGE BASE:
${context}

QUESTION: ${question}

Answer:`;

      // OPTIMIZATION: Use streaming for faster response times
      // Stream response and start TTS generation as soon as we have enough text
      const startTime = Date.now();
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
              content: "You are a helpful customer support assistant. Use the knowledge base and general logic/inference to answer questions. You can make reasonable inferences and connections. Answer concisely and always end with a natural follow-up question.",
            },
            { role: "user", content: combinedPrompt },
          ],
          temperature: 0.1,
          max_tokens: 60, // Reduced for faster generation
          stream: true, // Enable streaming
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

      // Stream the response
      let answer = "";
      let firstSentence = "";
      let hasFirstSentence = false;
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        // Fallback to non-streaming if reader not available
        const fallbackResponse = await fetch("https://api.openai.com/v1/chat/completions", {
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
                content: "You are a helpful customer support assistant. Use the knowledge base and general logic/inference to answer questions. You can make reasonable inferences and connections. Answer concisely and always end with a natural follow-up question.",
              },
              { role: "user", content: combinedPrompt },
            ],
            temperature: 0.1,
            max_tokens: 60, // Reduced for faster generation
          }),
        });
        const fallbackData = await fallbackResponse.json();
        answer = fallbackData.choices[0]?.message?.content?.trim() || "I'm sorry, I couldn't find an answer to that question. Is there anything else I can help with?";
      } else {
        // Stream processing
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(line => line.trim() !== '');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') break;

              try {
                const json = JSON.parse(data);
                const delta = json.choices[0]?.delta?.content || '';
                if (delta) {
                  answer += delta;
                  
                  // Extract first sentence for early TTS generation
                  if (!hasFirstSentence && answer.length >= 30) {
                    // Find first complete sentence (ending with . ! ?)
                    const sentenceMatch = answer.match(/^[^.!?]*[.!?]/);
                    if (sentenceMatch) {
                      firstSentence = sentenceMatch[0].trim();
                      hasFirstSentence = true;
                      console.log(`[Q/A] First sentence ready (${firstSentence.length} chars) after ${Date.now() - startTime}ms`);
                    }
                  }
                }
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        }
      }

      answer = answer.trim() || "I'm sorry, I couldn't find an answer to that question. Is there anything else I can help with?";
      const apiTime = Date.now() - startTime;
      console.log(`[Q/A] OpenAI streaming completed in ${apiTime}ms, total length: ${answer.length} chars`);
      
      // Ensure answer ends with a question (AI should include it, but add fallback if needed)
      if (!answer.match(/[?！？]$/)) {
        // Check if it already has a follow-up question
        const hasFollowUp = /\b(what|how|can|is|are|would|do|does|anything else|something else|help)\b/i.test(answer.slice(-30));
        if (!hasFollowUp) {
          answer = `${answer} Is there anything else I can help you with?`;
        }
      }
      
      // Check if answer indicates question is not answerable
      const isNotAnswerable = answer.toLowerCase().includes("only help with") || 
                             answer.toLowerCase().includes("doesn't fall into that basis");
      
      if (isNotAnswerable) {
        // Loop back to Gather step for next question (already fetched in parallel)
        const gatherStepId = await gatherStepIdPromise;
        // Cache this response too (don't await - fire and forget for speed)
        this.cacheResponse(cacheKey, this.context.agentId, answer).catch(err => 
          console.error("[Cache] Background cache error:", err)
        );
        return {
          success: true,
          output: answer,
          nextStepId: gatherStepId,
          shouldContinue: gatherStepId !== null,
        };
      }

      // Answer already includes natural follow-up question from AI
      const finalOutput = answer;
      
      // OPTIMIZATION: Cache in background (don't await - fire and forget for speed)
      this.cacheResponse(cacheKey, this.context.agentId, finalOutput).catch(err => 
        console.error("[Cache] Background cache error:", err)
      );

      // NEW: Check for branches (like Gather step)
      // OPTIMIZATION: Evaluate branches in parallel with getting gather step (already fetched)
      const [branchResult, gatherStepId] = await Promise.all([
        this.evaluateBranches(step.id, userInput, {
          ...this.context.gatheredData,
          answer: finalOutput  // Include answer in branch evaluation context
        }),
        gatherStepIdPromise // Already fetched in parallel, just await it
      ]);
      
      // Use branch result or default to next step
      let nextStepId = branchResult?.next_step_id || null;
      if (!nextStepId && !branchResult?.next_scenario_id) {
        // Try to loop back to Gather step for next question
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

      // Get base URL for API call - use custom domain as fallback
      const baseUrl = process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL || "https://driftai.studio";

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
   * Execute a "Check Schedule" step - Check available appointment slots
   */
  private async executeCheckScheduleStep(step: any, userInput: string): Promise<StepResult> {
    try {
      const gatheredData = this.context.gatheredData || {};
      
      // Get date from gathered data or use today's date
      let checkDate: string;
      if (gatheredData.appointment_date || gatheredData.desired_date) {
        const dateValue = gatheredData.appointment_date || gatheredData.desired_date;
        // If it's already a date string, use it; otherwise try to parse it
        try {
          const date = new Date(dateValue);
          checkDate = date.toISOString().split("T")[0];
        } catch {
          checkDate = new Date().toISOString().split("T")[0];
        }
      } else {
        checkDate = new Date().toISOString().split("T")[0];
      }
      
      // Get duration from gathered data or use default 60 minutes
      const duration = gatheredData.appointment_duration || gatheredData.duration_minutes || 60;

      // Get base URL for API call - use custom domain as fallback
      const baseUrl = process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL || "https://driftai.studio";

      // Call schedule availability API
      const response = await fetch(
        `${baseUrl}/api/agents/${this.context.agentId}/schedule?date=${checkDate}&duration=${duration}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        return {
          success: false,
          output: errorData.error || "I couldn't check the schedule availability. Please try again.",
          shouldContinue: true,
        };
      }

      const data = await response.json();
      const availableSlots = data.availableSlots || [];
      const existingAppointments = data.existingAppointments || [];

      // Format available slots for display
      const formattedSlots = availableSlots.map((slot: string) => {
        const slotDate = new Date(slot);
        return slotDate.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });
      });

      // Create response message
      let outputMessage = step.ai_message || "";
      
      if (availableSlots.length === 0) {
        outputMessage = `I checked the schedule for ${new Date(checkDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} and there are no available slots for a ${duration}-minute appointment. Would you like to check a different date?`;
      } else {
        const slotsList = formattedSlots.slice(0, 10).join(", "); // Show first 10 slots
        const moreSlots = availableSlots.length > 10 ? ` and ${availableSlots.length - 10} more` : "";
        
        if (!outputMessage) {
          outputMessage = `Here are the available appointment times for ${new Date(checkDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}: ${slotsList}${moreSlots}. Which time works best for you?`;
        } else {
          // Replace variables in custom message
          outputMessage = outputMessage
            .replace("{{available_slots}}", slotsList)
            .replace("{{date}}", new Date(checkDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }))
            .replace("{{slot_count}}", availableSlots.length.toString());
        }
      }

      // Store available slots in gathered data for use in Schedule step
      const updatedGatheredData = {
        ...gatheredData,
        available_slots: availableSlots,
        checked_date: checkDate,
        available_slots_formatted: formattedSlots,
      };

      return {
        success: true,
        output: outputMessage,
        gatheredData: updatedGatheredData,
        shouldContinue: true,
      };
    } catch (error: any) {
      console.error("Check Schedule step error:", error);
      return {
        success: false,
        error: error.message || "Failed to check schedule",
        shouldContinue: true,
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
          temperature: 0.2, // Lower temperature = faster responses
          max_tokens: 200, // Reduced from 500 for faster generation
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

    // OPTIMIZATION: Check cache first for Say step responses
    const normalizedInput = userInput.toLowerCase().trim();
    const contextHash = Buffer.from(JSON.stringify(this.context.gatheredData)).toString('base64').substring(0, 30);
    const cacheKey = `say_${this.context.agentId}_${step.id}_${Buffer.from(normalizedInput).toString('base64').substring(0, 50)}_${contextHash}`;
    
    const cachedResponse = await this.getCachedResponse(cacheKey, this.context.agentId);
    if (cachedResponse) {
      console.log(`[Say] Cache HIT for step ${step.id}`);
      return cachedResponse;
    }
    console.log(`[Say] Cache MISS for step ${step.id}`);

    // Load agent context (policies, data sources, personalization)
    console.log(`[Say] generateAIResponse - Loading agent context for agent: ${this.context.agentId}`);
    const agentContext = await this.loadAgentContext();
    
    console.log(`[Say] ✅ Agent context loaded:`, {
      agentId: this.context.agentId,
      dataSourcesCount: agentContext.dataSources?.length || 0,
      policiesCount: agentContext.policies?.length || 0,
      hasPersonalization: !!agentContext.personalization,
      dataSourceNames: agentContext.dataSources?.map((ds: any) => ({
        id: ds.id,
        name: ds.name,
        type: ds.type,
        hasContent: !!ds.content,
        contentLength: ds.content?.length || 0,
      })) || [],
    });
    
    if (!agentContext.dataSources || agentContext.dataSources.length === 0) {
      console.warn(`[Say] ⚠️  NO DATA SOURCES FOUND for agent ${this.context.agentId}!`);
      console.warn(`[Say] This means the AI won't have access to your knowledge base.`);
      console.warn(`[Say] Make sure data sources are configured for this agent.`);
    }

    // Build prompt
    console.log(`[Say] Building system prompt with agent context...`);
    const systemPrompt = this.buildSystemPrompt(agentContext);
    console.log(`[Say] ✅ System prompt built:`, {
      promptLength: systemPrompt.length,
      includesKnowledgeBase: systemPrompt.includes('Knowledge Base'),
      includesDataSources: systemPrompt.includes('[Data Source]') || systemPrompt.includes('[File]'),
      knowledgeBaseStartIndex: systemPrompt.indexOf('Knowledge Base'),
      knowledgeBaseContent: systemPrompt.includes('Knowledge Base') 
        ? systemPrompt.substring(systemPrompt.indexOf('Knowledge Base'), systemPrompt.indexOf('Knowledge Base') + 500)
        : 'NOT FOUND',
    });
    
    const userPrompt = this.buildUserPrompt(step, userInput, agentContext);
    console.log(`[Say] User prompt: "${userPrompt.substring(0, 200)}"`);
    
    // Log the FULL prompt being sent to OpenAI (truncated for logs)
    const fullPrompt = `SYSTEM: ${systemPrompt.substring(0, 500)}...\nUSER: ${userPrompt.substring(0, 200)}`;
    console.log(`[Say] 📤 Full prompt being sent to OpenAI (truncated):`, fullPrompt);

    // OPTIMIZATION: Reduce tokens and temperature for faster responses
    // Also reduce transcript history to minimize context size
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
          ...this.context.transcript.slice(-3).map((msg: any) => ({
            role: msg.role,
            content: msg.content.substring(0, 200), // Limit each message to 200 chars
          })),
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2, // Lower temperature = faster, more deterministic responses
        max_tokens: 100, // Further reduced for faster generation
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json();
    const aiResponse = data.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response.";
    
    console.log(`[Say] ✅ AI response generated:`, {
      responseLength: aiResponse.length,
      responsePreview: aiResponse.substring(0, 300),
      tokensUsed: data.usage?.total_tokens || 'unknown',
      promptTokens: data.usage?.prompt_tokens || 'unknown',
      completionTokens: data.usage?.completion_tokens || 'unknown',
    });
    
    // Check if response looks like it's ignoring Knowledge Base (generic responses like "24/7")
    const genericResponses = ['24/7', 'always available', 'all the time', 'round the clock'];
    const looksGeneric = genericResponses.some(phrase => aiResponse.toLowerCase().includes(phrase.toLowerCase()));
    if (looksGeneric && (agentContext.dataSources?.length || 0) > 0) {
      console.warn(`[Say] ⚠️  WARNING: AI response contains generic phrases but data sources exist!`);
      console.warn(`[Say] Response: "${aiResponse}"`);
      console.warn(`[Say] This suggests the AI might be ignoring the Knowledge Base.`);
      console.warn(`[Say] Data sources count: ${agentContext.dataSources.length}`);
      console.warn(`[Say] Check if Knowledge Base was included in the system prompt.`);
    }
    
    // OPTIMIZATION: Cache response in background (don't block)
    this.cacheResponse(cacheKey, this.context.agentId, aiResponse).catch(err => {
      console.error("[Say] Failed to cache response (non-blocking):", err);
    });
    
    return aiResponse;
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
    if (!stepId) {
      console.log("[AgentExecutor] loadStep called with null stepId - will use AI fallback");
      return null;
    }

    console.log("[AgentExecutor] Loading step:", {
      stepId: stepId,
      scenarioId: this.context.scenarioId,
      agentId: this.context.agentId,
    });

    const { data, error } = await this.supabase
      .from("steps")
      .select("*")
      .eq("id", stepId)
      .single();

    if (error) {
      console.error("[AgentExecutor] Failed to load step:", {
        stepId: stepId,
        error: error.message,
        scenarioId: this.context.scenarioId,
      });
      return null;
    }

    if (!data) {
      console.warn("[AgentExecutor] Step not found:", {
        stepId: stepId,
        scenarioId: this.context.scenarioId,
      });
      return null;
    }

    console.log("[AgentExecutor] Step loaded successfully:", {
      stepId: data.id,
      stepName: data.name,
      stepType: data.type,
      scenarioId: data.scenario_id,
      sortOrder: data.sort_order,
    });

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

    const lowerInput = userInput.toLowerCase().trim();
    
    // Expanded list of end phrases - more natural variations
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
      "i'm good",
      "im good",
      "i am good",
      "i'm all good",
      "im all good",
      "i am all good",
      "i'm fine",
      "im fine",
      "i am fine",
      "i'm all set",
      "im all set",
      "i am all set",
      "we're good",
      "were good",
      "we are good",
      "we're all set",
      "were all set",
      "we are all set",
      "that's everything",
      "thats everything",
      "that is everything",
      "nothing more",
      "all done",
      "we're done",
      "were done",
      "we are done",
    ];

    // Check for exact matches or phrases contained in input
    for (const phrase of endPhrases) {
      if (lowerInput === phrase || lowerInput.includes(phrase)) {
        // More lenient matching - if the phrase appears and the input is relatively short,
        // or if it's at the start/end, treat it as an end signal
        const phraseIndex = lowerInput.indexOf(phrase);
        const phraseLength = phrase.length;
        const inputLength = lowerInput.length;
        
        // If exact match, definitely end
        if (lowerInput === phrase) {
          return true;
        }
        
        // If phrase at start and input is short (phrase + small buffer)
        if (phraseIndex === 0 && inputLength <= phraseLength + 15) {
          return true;
        }
        
        // If phrase at end and input is short
        if (phraseIndex === inputLength - phraseLength && inputLength <= phraseLength + 15) {
          return true;
        }
        
        // If phrase in middle but input is very short (likely just the phrase with filler words)
        if (inputLength <= phraseLength + 20) {
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
    console.log(`[AgentExecutor] Loading agent context for agent: ${this.context.agentId}`);
    
    const [policies, dataSources, personalization] = await Promise.all([
      this.supabase.from("agent_policies").select("*").eq("agent_id", this.context.agentId),
      this.supabase.from("agent_data_sources").select("*").eq("agent_id", this.context.agentId),
      this.supabase.from("agent_personalization").select("*").eq("agent_id", this.context.agentId).maybeSingle(),
    ]);

    console.log("[AgentExecutor] ✅ Context loaded:", {
      agentId: this.context.agentId,
      policiesCount: policies.data?.length || 0,
      policiesError: policies.error?.message || null,
      dataSourcesCount: dataSources.data?.length || 0,
      dataSourcesError: dataSources.error?.message || null,
      hasPersonalization: !!personalization.data,
      personalizationError: personalization.error?.message || null,
    });
    
    if (dataSources.error) {
      console.error(`[AgentExecutor] ❌ Error loading data sources:`, dataSources.error);
    }
    
    if (!dataSources.data || dataSources.data.length === 0) {
      console.warn(`[AgentExecutor] ⚠️  NO DATA SOURCES found for agent ${this.context.agentId}!`);
      console.warn(`[AgentExecutor] This means the AI won't have access to your knowledge base.`);
      console.warn(`[AgentExecutor] Check that data sources are properly configured for this agent.`);
    } else {
      console.log(`[AgentExecutor] ✅ Found ${dataSources.data.length} data source(s):`, 
        dataSources.data.map((ds: any) => ({
          id: ds.id,
          name: ds.name,
          type: ds.type,
          hasContent: !!ds.content,
          contentLength: ds.content?.length || 0,
          hasFile: !!ds.file_url,
        }))
      );
    }

    return {
      policies: policies.data || [],
      dataSources: dataSources.data || [],
      personalization: personalization.data || null,
    };
  }

  /**
   * Build system prompt from agent context
   * OPTIMIZATION: Truncate long content to reduce prompt size and speed up API calls
   */
  private buildSystemPrompt(agentContext: any): string {
    const parts = [
      "You are a helpful, friendly AI assistant. You can have natural conversations and answer questions while maintaining compliance with security and privacy standards.",
      "",
      "IMPORTANT: You should engage in normal conversation. SOC2 compliance and security policies apply to data handling, privacy, and system security - they do NOT prevent you from having friendly conversations or answering general questions. You can discuss topics, answer questions, and be conversational while still protecting sensitive information and following security protocols.",
      "",
      "CRITICAL RULES FOR ANSWERING QUESTIONS:",
      "1. You MUST use ONLY the information provided in the Knowledge Base section below.",
      "2. Do NOT make up information, use generic responses, or infer information not in the Knowledge Base.",
      "3. If the Knowledge Base does NOT contain the answer, say 'I don't have that information in my knowledge base.'",
      "4. Do NOT say things like 'available 24/7' unless it's explicitly stated in the Knowledge Base.",
      "5. If asked about hours, availability, services, or company info, check the Knowledge Base first.",
      "6. If the Knowledge Base is empty or doesn't have the answer, be honest: 'I don't have that specific information.'",
      "",
    ];

    // Add personalization (keep concise)
    if (agentContext.personalization) {
      const p = agentContext.personalization;
      if (p.personality) parts.push(`Personality: ${p.personality.substring(0, 200)}`);
      if (p.response_style) parts.push(`Response style: ${p.response_style.substring(0, 100)}`);
      if (p.formality) parts.push(`Formality: ${p.formality}`);
      parts.push(""); // Add spacing
    }

    // Add policies (truncate each to 300 chars max)
    // Add context that policies are about data security, not conversation restrictions
    if (agentContext.policies.length > 0) {
      parts.push("Security and Compliance Policies (these apply to data handling and privacy, not to general conversation):");
      agentContext.policies.slice(0, 5).forEach((policy: any) => { // Limit to 5 policies
        if (policy.content) {
          const truncated = policy.content.length > 300 ? policy.content.substring(0, 300) + "..." : policy.content;
          parts.push(`- ${truncated}`);
        }
      });
      parts.push(""); // Add spacing
    }

    // Add data sources (increase limit and truncation for better context)
    if (agentContext.dataSources.length > 0) {
      parts.push("Knowledge Base (use this information to answer questions about the company, services, policies, etc.):");
      parts.push("KNOWLEDGE BASE - USE THIS FOR ALL ANSWERS:");
      parts.push("CRITICAL: You MUST use ONLY information from the Knowledge Base below. Do NOT make up or infer information.");
      parts.push("CRITICAL: If the Knowledge Base doesn't have an answer, say 'I don't have that information.'");
      parts.push("CRITICAL: Do NOT say things like '24/7', 'always available', or generic responses unless explicitly in the Knowledge Base.");
      parts.push("");
      agentContext.dataSources.slice(0, 10).forEach((source: any) => { // Increased to 10 sources
        if (source.content) {
          // Increased truncation to 1000 chars to preserve more context
          const truncated = source.content.length > 1000 ? source.content.substring(0, 1000) + "..." : source.content;
          parts.push(`\n[${source.name || "Data Source"}]\n${truncated}`);
        } else if (source.file_url) {
          parts.push(`\n[${source.name || "File"}] - File available: ${source.file_url}`);
        }
      });
      parts.push(""); // Add spacing
      console.log(`[AgentExecutor] Added ${agentContext.dataSources.length} data sources to system prompt for agent ${this.context.agentId}`);
    } else {
      console.warn("[AgentExecutor] No data sources found for agent:", this.context.agentId);
      console.warn("[AgentExecutor] Agent will not have company/service information available");
    }

    return parts.join("\n");
  }

  /**
   * Build user prompt
   */
  private buildUserPrompt(step: any, userInput: string, agentContext: any): string {
    if (step.type === "say") {
      // For Say steps, allow natural conversation while following step context
      const context = step.ai_message || step.prompt || "";
      if (context) {
        return `User said: "${userInput}"\n\nRespond naturally and conversationally. You can engage in friendly conversation while staying relevant to: ${context.substring(0, 200)}`;
      }
      return `User said: "${userInput}"\n\nRespond naturally, helpfully, and conversationally. Engage with the user in a friendly way.`;
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

    // Handle scenario switching
    if (result.nextScenarioId) {
      updates.current_scenario_id = result.nextScenarioId;
      
      // Get the first step of the new scenario
      const { data: firstStep } = await this.supabase
        .from("steps")
        .select("id")
        .eq("scenario_id", result.nextScenarioId)
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle();
      
      if (firstStep) {
        updates.current_step_id = firstStep.id;
        // Update context to reflect the new scenario
        this.context.scenarioId = result.nextScenarioId;
        this.context.currentStepId = firstStep.id;
      }
    } else if (result.nextStepId !== undefined) {
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

    // OPTIMIZATION: Log step execution in background (non-blocking)
    this.supabase.from("conversation_steps").insert({
      conversation_id: this.context.conversationId,
      step_id: this.context.currentStepId,
      step_type: "executed",
      output_data: { output: result.output },
    }).catch((err: any) => {
      console.error("[Executor] Failed to log step execution (non-blocking):", err);
    });
  }

  /**
   * Execute a "Loop" step - Repeat a sequence of steps
   * The loop automatically includes all steps after it until the next loop step or end of scenario
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
    
    // Get the first step after this loop step (start of loop content)
    const firstStepInLoop = await this.getNextStepInScenario(step.id);
    if (!firstStepInLoop) {
      // No steps to loop, just continue
      const nextStepId = await this.getStepAfterLoop(step.id);
      return {
        success: true,
        output: "",
        nextStepId: nextStepId,
        shouldContinue: nextStepId !== null,
      };
    }
    
    // Get or initialize loop state
    const loopState = this.context.conversationState.loopState || {};
    const activeLoop = loopState[step.id] || {
      iteration: 0,
      firstStepId: firstStepInLoop,
      maxIterations: config.iterations === "infinity" ? Infinity : (config.iterations || 1),
    };
    
    // Check loop exit conditions
    const maxIterations = config.iterations === "infinity" ? Infinity : (config.iterations || 1);
    if (activeLoop.iteration >= maxIterations) {
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
    
    // Continue loop - increment iteration and jump to first step in loop
    activeLoop.iteration++;
    loopState[step.id] = activeLoop;
    this.context.conversationState.loopState = loopState;
    
    return {
      success: true,
      output: "",
      nextStepId: firstStepInLoop,
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
    
    // Get phone number from config or gathered data
    let phoneNumber = config.phone_number;
    if (phoneNumber && phoneNumber.startsWith("{{") && phoneNumber.endsWith("}}")) {
      const variableName = phoneNumber.slice(2, -2).trim();
      phoneNumber = this.context.gatheredData[variableName] || phoneNumber;
    }
    
    // Get phone number from conversation if not provided
    if (!phoneNumber) {
      const { data: conversation } = await this.supabase
        .from("conversations")
        .select("from_number")
        .eq("id", this.context.conversationId)
        .single();
      phoneNumber = conversation?.from_number || "";
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

    // If check_schedule is enabled, fetch appointments for this customer
    let appointmentData: any = {};
    if (config.check_schedule) {
      try {
        // Get workspace_id from agent
        const { data: agent } = await this.supabase
          .from("agents")
          .select("workspace_id")
          .eq("id", this.context.agentId)
          .single();

        if (agent?.workspace_id) {
          // Find contact by phone number
          const { data: contact } = await this.supabase
            .from("contacts")
            .select("id")
            .eq("workspace_id", agent.workspace_id)
            .eq("phone", normalizedPhone)
            .maybeSingle();

          if (contact?.id) {
            // Get upcoming appointments for this contact
            const now = new Date().toISOString();
            const { data: appointments } = await this.supabase
              .from("appointments")
              .select("scheduled_at, duration_minutes, service_type, notes")
              .eq("contact_id", contact.id)
              .eq("status", "scheduled")
              .gte("scheduled_at", now)
              .order("scheduled_at", { ascending: true })
              .limit(1); // Get the next appointment

            if (appointments && appointments.length > 0) {
              const appointment = appointments[0];
              const appointmentDate = new Date(appointment.scheduled_at);
              
              appointmentData = {
                appointment_date: appointmentDate.toLocaleDateString("en-US", { 
                  weekday: "long", 
                  year: "numeric", 
                  month: "long", 
                  day: "numeric" 
                }),
                appointment_time: appointmentDate.toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                }),
                appointment_datetime: appointmentDate.toLocaleString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                }),
                appointment_service: appointment.service_type || "",
                appointment_duration: appointment.duration_minutes || 60,
                appointment_notes: appointment.notes || "",
              };
            }
          }
        }
      } catch (error) {
        console.error("Error fetching appointment data:", error);
        // Continue without appointment data if fetch fails
      }
    }
    
    // Merge appointment data with gathered data for variable substitution
    const mergedData = {
      ...this.context.gatheredData,
      ...appointmentData,
    };
    
    // Substitute variables in message
    const message = this.substituteVariables(config.message, mergedData);
    
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
    } else if (config.transfer_method === "role" && config.target_role) {
      // NEW: Transfer by typed role name (supports custom roles like "customer agent")
      targetAgentId = await this.findSpecialistAgent(config.target_role);
    } else if (config.transfer_method === "ai_classification") {
      // Use AI to classify, but if target_role is specified, use that as fallback
      const specialistRole = await this.classifySpecialistNeeded(userInput, config);
      targetAgentId = await this.findSpecialistAgent(specialistRole || config.target_role);
    } else if (config.transfer_method === "keyword") {
      targetAgentId = await this.findAgentByKeywords(userInput, config.target_role);
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
    if (targetAgentId) {
      await this.transferConversation(targetAgentId, config.transfer_message || "");
    }
    
    return {
      success: true,
      output: config.transfer_message || "Let me connect you with a specialist...",
      transferToAgentId: targetAgentId,
      shouldContinue: true,
    };
  }

  /**
   * Check if current step is the end of a loop
   * A loop ends when we reach the next loop step or the end of the scenario
   */
  private async checkLoopContinuation(currentStepId: string | null): Promise<string | null> {
    if (!currentStepId) return null;
    
    // Get current step to find its sort_order
    const currentStep = await this.loadStep(currentStepId);
    if (!currentStep) return null;
    
    // Find all loop steps in this scenario
    const { data: loops } = await this.supabase
      .from("steps")
      .select("id, sort_order, loop_config")
      .eq("type", "loop")
      .eq("scenario_id", this.context.scenarioId)
      .order("sort_order", { ascending: true });
    
    if (!loops || loops.length === 0) return null;
    
    // Find the loop step that contains this step
    // A step is in a loop if it comes after the loop step and before the next loop step
    for (let i = 0; i < loops.length; i++) {
      const loop = loops[i];
      const loopSortOrder = loop.sort_order || 0;
      const currentSortOrder = currentStep.sort_order || 0;
      
      // Check if current step comes after this loop step
      if (currentSortOrder > loopSortOrder) {
        // Check if there's a next loop step
        const nextLoop = loops[i + 1];
        if (nextLoop) {
          const nextLoopSortOrder = nextLoop.sort_order || 0;
          // If current step is before the next loop, it's the end of this loop
          if (currentSortOrder < nextLoopSortOrder) {
            // Check if this is the last step before the next loop
            const { data: nextStep } = await this.supabase
              .from("steps")
              .select("id, sort_order")
              .eq("scenario_id", this.context.scenarioId)
              .gt("sort_order", currentSortOrder)
              .order("sort_order", { ascending: true })
              .limit(1)
              .maybeSingle();
            
            // If next step is the next loop step, we're at the end of this loop
            if (nextStep && nextStep.id === nextLoop.id) {
              return loop.id;
            }
          }
        } else {
          // This is the last loop, check if we're at the end of the scenario
          const { data: nextStep } = await this.supabase
            .from("steps")
            .select("id")
            .eq("scenario_id", this.context.scenarioId)
            .gt("sort_order", currentSortOrder)
            .order("sort_order", { ascending: true })
            .limit(1)
            .maybeSingle();
          
          // If there's no next step, we're at the end of the scenario (and end of loop)
          if (!nextStep) {
            return loop.id;
          }
        }
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
   * Find specialist agent by role (supports custom role names, case-insensitive)
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
    
    // Get all deployed agents in workspace (specialist or not - we'll filter by role)
    const { data: agents } = await this.supabase
      .from("agents")
      .select("id, agent_role, is_specialist")
      .eq("workspace_id", agent.workspace_id)
      .eq("status", "deployed");
    
    if (!agents) return null;
    
    // Case-insensitive role matching (supports custom roles like "customer agent")
    const roleLower = role.toLowerCase().trim();
    
    for (const candidate of agents) {
      if (candidate.agent_role) {
        const candidateRoleLower = candidate.agent_role.toLowerCase().trim();
        // Exact match or contains match (for roles like "customer agent" matching "customer")
        if (candidateRoleLower === roleLower || 
            candidateRoleLower.includes(roleLower) || 
            roleLower.includes(candidateRoleLower)) {
          return candidate.id;
        }
      }
    }
    
    // If no match found, return null (will use fallback)
    return null;
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
    
    // Find the first "Say" step for greeting, or first step if no Say step
    let currentStepId = null;
    if (scenarios && scenarios.length > 0) {
      const { data: steps } = await this.supabase
        .from("steps")
        .select("id, type")
        .eq("scenario_id", scenarios[0].id)
        .order("sort_order", { ascending: true });
      
      if (steps && steps.length > 0) {
        // Prefer first "Say" step for greeting, otherwise first step
        const firstSayStep = steps.find((s: any) => s.type === "say");
        currentStepId = firstSayStep ? firstSayStep.id : steps[0].id;
      }
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
  /**
   * Generate a cache key for Q/A responses
   */
  private generateCacheKey(question: string, context: string, dataSourceIds: string[]): string {
    // Create a hash from question + context hash + data source IDs
    // Use a simple hash function for speed
    const questionHash = Buffer.from(question.toLowerCase().trim()).toString('base64').substring(0, 50);
    const contextHash = Buffer.from(context.substring(0, 1000)).toString('base64').substring(0, 30);
    const dsHash = dataSourceIds.sort().join(',');
    return `qa_${this.context.agentId}_${questionHash}_${contextHash}_${Buffer.from(dsHash).toString('base64').substring(0, 20)}`;
  }

  /**
   * Get cached response if available and not expired
   */
  private async getCachedResponse(cacheKey: string, agentId: string): Promise<string | null> {
    try {
      const { data, error } = await this.supabase
        .from("response_cache")
        .select("response, expires_at")
        .eq("cache_key", cacheKey)
        .eq("agent_id", agentId)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (error) {
        console.error("[Cache] Error fetching cache:", error);
        return null;
      }

      if (data) {
        return data.response;
      }

      return null;
    } catch (error) {
      console.error("[Cache] Exception fetching cache:", error);
      return null;
    }
  }

  /**
   * Cache a response for future use (24 hour TTL)
   */
  private async cacheResponse(cacheKey: string, agentId: string, response: string): Promise<void> {
    try {
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24); // 24 hour TTL

      await this.supabase
        .from("response_cache")
        .upsert({
          cache_key: cacheKey,
          agent_id: agentId,
          response: response,
          expires_at: expiresAt.toISOString(),
        }, {
          onConflict: "cache_key"
        });
    } catch (error) {
      // Don't fail if caching fails, just log it
      console.error("[Cache] Error caching response:", error);
    }
  }

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

