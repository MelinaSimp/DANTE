/**
 * Step Executor
 * Handles execution of different step types during a conversation
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

export interface StepExecutionResult {
  twiml: string;
  nextStepId?: string;
  nextScenarioId?: string;
  gatheredData?: Record<string, any>;
  shouldEnd?: boolean;
}

export interface ExecutionContext {
  conversationId: string;
  agentId: string;
  scenarioId: string;
  currentStepId: string;
  gatheredData: Record<string, any>;
  conversationState: Record<string, any>;
  baseUrl: string;
}

/**
 * Execute a step and return TwiML response
 */
export async function executeStep(
  step: any,
  context: ExecutionContext
): Promise<StepExecutionResult> {
  console.log(`[StepExecutor] Executing step ${step.id} of type ${step.type}`);

  switch (step.type) {
    case "say":
      return executeSayStep(step, context);
    
    case "gather":
      return executeGatherStep(step, context);
    
    case "qa":
      return executeQAStep(step, context);
    
    case "code":
      return executeCodeStep(step, context);
    
    case "condition":
      return executeConditionStep(step, context);
    
    case "api_call":
      return executeApiCallStep(step, context);
    
    default:
      console.warn(`[StepExecutor] Unknown step type: ${step.type}`);
      return {
        twiml: generateTwiML([
          { type: "say", message: "I'm sorry, there was an error processing your request." },
          { type: "hangup" },
        ]),
        shouldEnd: true,
      };
  }
}

/**
 * Execute SAY step - speak a message to the customer
 */
async function executeSayStep(
  step: any,
  context: ExecutionContext
): Promise<StepExecutionResult> {
  const message = step.ai_message || "Hello! How can I help you?";
  
  // Get branches to determine next step
  const nextStepId = await getNextStepId(step.id, context);
  
  return {
    twiml: generateTwiML([
      { type: "say", message },
      ...(nextStepId ? [{ type: "redirect", url: `${context.baseUrl}/api/twilio/continue?conversationId=${context.conversationId}&stepId=${nextStepId}` }] : []),
    ]),
    nextStepId,
  };
}

/**
 * Execute GATHER step - collect input from customer
 */
async function executeGatherStep(
  step: any,
  context: ExecutionContext
): Promise<StepExecutionResult> {
  const prompt = step.ai_message || "Please provide your input.";
  const actionUrl = `${context.baseUrl}/api/twilio/gather?conversationId=${context.conversationId}&stepId=${step.id}`;
  
  return {
    twiml: generateTwiML([
      { type: "say", message: prompt },
      {
        type: "gather",
        action: actionUrl,
        method: "POST",
        input: "speech",
        speechTimeout: "auto",
        finishOnKey: "#",
      },
    ]),
  };
}

/**
 * Execute Q/A step - answer customer question using data sources
 */
async function executeQAStep(
  step: any,
  context: ExecutionContext
): Promise<StepExecutionResult> {
  // Get the query - either from previous GATHER or custom query
  let query = step.qa_query;
  
  // If no custom query, try to get from previous GATHER step
  if (!query) {
    // Look for the most recent GATHER input in conversation state
    query = context.conversationState.lastGatherInput || context.gatheredData.lastInput;
  }
  
  if (!query) {
    // No query available, use fallback
    const fallback = step.qa_fallback_message || "I don't have that information. Let me connect you with a human agent.";
    const nextStepId = await getNextStepId(step.id, context, "no_query");
    
    return {
      twiml: generateTwiML([
        { type: "say", message: fallback },
        ...(nextStepId ? [{ type: "redirect", url: `${context.baseUrl}/api/twilio/continue?conversationId=${context.conversationId}&stepId=${nextStepId}` }] : []),
      ]),
      nextStepId,
    };
  }
  
  // Call Q/A API
  try {
    // Use internal API call - we need to import the handler directly or use fetch
    // For now, use fetch with the full URL
    const qaUrl = `${context.baseUrl}/api/qa/answer`;
    console.log("[StepExecutor] Calling Q/A API:", qaUrl);
    console.log("[StepExecutor] Query:", query);
    console.log("[StepExecutor] Agent ID:", context.agentId);
    
    const qaResponse = await fetch(qaUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        agentId: context.agentId,
        dataSourceIds: step.qa_data_source_ids || [],
      }),
    });
    
    const qaData = await qaResponse.json();
    
    if (qaData.found && qaData.answer) {
      // Answer found - speak it
      const nextStepId = await getNextStepId(step.id, context, "answer_found");
      
      return {
        twiml: generateTwiML([
          { type: "say", message: qaData.answer },
          ...(nextStepId ? [{ type: "redirect", url: `${context.baseUrl}/api/twilio/continue?conversationId=${context.conversationId}&stepId=${nextStepId}` }] : []),
        ]),
        nextStepId,
      };
    } else {
      // No answer found - use fallback
      const fallback = step.qa_fallback_message || "I don't have that information. Let me connect you with a human agent.";
      const nextStepId = await getNextStepId(step.id, context, "no_answer");
      
      return {
        twiml: generateTwiML([
          { type: "say", message: fallback },
          ...(nextStepId ? [{ type: "redirect", url: `${context.baseUrl}/api/twilio/continue?conversationId=${context.conversationId}&stepId=${nextStepId}` }] : []),
        ]),
        nextStepId,
      };
    }
  } catch (error) {
    console.error("[StepExecutor] Q/A error:", error);
    const fallback = step.qa_fallback_message || "I'm sorry, I encountered an error. Let me connect you with a human agent.";
    const nextStepId = await getNextStepId(step.id, context, "error");
    
    return {
      twiml: generateTwiML([
        { type: "say", message: fallback },
        ...(nextStepId ? [{ type: "redirect", url: `${context.baseUrl}/api/twilio/continue?conversationId=${context.conversationId}&stepId=${nextStepId}` }] : []),
      ]),
      nextStepId,
    };
  }
}

/**
 * Execute CODE step - run custom code (placeholder for now)
 */
async function executeCodeStep(
  step: any,
  context: ExecutionContext
): Promise<StepExecutionResult> {
  // For now, just move to next step
  // In the future, this could execute Python/JavaScript code
  const nextStepId = await getNextStepId(step.id, context);
  
  return {
    twiml: generateTwiML([
      { type: "say", message: "Processing..." },
      ...(nextStepId ? [{ type: "redirect", url: `${context.baseUrl}/api/twilio/continue?conversationId=${context.conversationId}&stepId=${nextStepId}` }] : []),
    ]),
    nextStepId,
  };
}

/**
 * Execute CONDITION step - evaluate conditions and branch
 */
async function executeConditionStep(
  step: any,
  context: ExecutionContext
): Promise<StepExecutionResult> {
  // Get branches for this step
  const { data: branches } = await supabaseAdmin
    .from("step_branches")
    .select("*")
    .eq("step_id", step.id)
    .order("created_at", { ascending: true });
  
  // Evaluate conditions (simplified - in production, use a proper condition evaluator)
  // For now, we'll use the first matching branch or default to next step
  let nextStepId: string | undefined;
  let nextScenarioId: string | undefined;
  
  if (branches && branches.length > 0) {
    // Simple condition matching - check if condition tag matches gathered data
    for (const branch of branches) {
      if (evaluateCondition(branch, context)) {
        nextStepId = branch.next_step_id || undefined;
        nextScenarioId = branch.next_scenario_id || undefined;
        break;
      }
    }
  }
  
  // If no branch matched, get next step by sort_order
  if (!nextStepId && !nextScenarioId) {
    nextStepId = await getNextStepId(step.id, context);
  }
  
  return {
    twiml: generateTwiML([
      ...(nextStepId || nextScenarioId
        ? [{ type: "redirect", url: `${context.baseUrl}/api/twilio/continue?conversationId=${context.conversationId}${nextStepId ? `&stepId=${nextStepId}` : ""}${nextScenarioId ? `&scenarioId=${nextScenarioId}` : ""}` }]
        : [{ type: "say", message: "Thank you for calling. Goodbye." }, { type: "hangup" }]),
    ]),
    nextStepId,
    nextScenarioId,
  };
}

/**
 * Execute API_CALL step - make external API call (placeholder)
 */
async function executeApiCallStep(
  step: any,
  context: ExecutionContext
): Promise<StepExecutionResult> {
  // Placeholder - would make API call and process response
  const nextStepId = await getNextStepId(step.id, context);
  
  return {
    twiml: generateTwiML([
      { type: "say", message: "Processing your request..." },
      ...(nextStepId ? [{ type: "redirect", url: `${context.baseUrl}/api/twilio/continue?conversationId=${context.conversationId}&stepId=${nextStepId}` }] : []),
    ]),
    nextStepId,
  };
}

/**
 * Get the next step ID based on branches or sort_order
 */
async function getNextStepId(
  currentStepId: string,
  context: ExecutionContext,
  conditionTag?: string
): Promise<string | undefined> {
  // Get current step to find its sort_order
  const { data: currentStep } = await supabaseAdmin
    .from("steps")
    .select("sort_order, scenario_id")
    .eq("id", currentStepId)
    .single();
  
  if (!currentStep) return undefined;
  
  // Get branches for this step
  const { data: branches } = await supabaseAdmin
    .from("step_branches")
    .select("*")
    .eq("step_id", currentStepId)
    .order("created_at", { ascending: true });
  
  // If condition tag provided, try to match branch
  if (conditionTag && branches && branches.length > 0) {
    for (const branch of branches) {
      if (branch.condition_tag === conditionTag || 
          branch.condition_tag === `@${conditionTag}` ||
          evaluateCondition(branch, context)) {
        return branch.next_step_id || undefined;
      }
    }
  }
  
  // Get next step by sort_order
  const { data: nextStep } = await supabaseAdmin
    .from("steps")
    .select("id")
    .eq("scenario_id", currentStep.scenario_id)
    .gt("sort_order", currentStep.sort_order || 0)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  
  return nextStep?.id;
}

/**
 * Evaluate a condition branch
 */
function evaluateCondition(
  branch: any,
  context: ExecutionContext
): boolean {
  // Simple condition evaluation
  // Check if condition tag matches gathered data or conversation state
  if (branch.condition_tag) {
    const tag = branch.condition_tag.replace("@", "");
    
    // Check gathered data
    if (context.gatheredData[tag] !== undefined) {
      return true;
    }
    
    // Check conversation state
    if (context.conversationState[tag] !== undefined) {
      return true;
    }
    
    // Check if condition string matches
    if (branch.condition && context.gatheredData.lastInput) {
      const input = context.gatheredData.lastInput.toLowerCase();
      const condition = branch.condition.toLowerCase();
      if (input.includes(condition)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Generate TwiML XML
 */
function generateTwiML(actions: Array<{ type: string; [key: string]: any }>): string {
  let twiml = '<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n';
  
  for (const action of actions) {
    switch (action.type) {
      case "say":
        twiml += `  <Say voice="alice">${escapeXml(action.message)}</Say>\n`;
        break;
      
      case "gather":
        twiml += `  <Gather action="${escapeXml(action.action)}" method="${action.method || "POST"}" input="${action.input || "speech"}" speechTimeout="${action.speechTimeout || "auto"}"${action.finishOnKey ? ` finishOnKey="${action.finishOnKey}"` : ""}>\n`;
        if (action.prompt) {
          twiml += `    <Say voice="alice">${escapeXml(action.prompt)}</Say>\n`;
        }
        twiml += `  </Gather>\n`;
        break;
      
      case "redirect":
        twiml += `  <Redirect>${escapeXml(action.url)}</Redirect>\n`;
        break;
      
      case "hangup":
        twiml += `  <Hangup/>\n`;
        break;
    }
  }
  
  twiml += "</Response>";
  return twiml;
}

/**
 * Escape XML special characters
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

