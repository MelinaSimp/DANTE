// lib/agents/premade-scenarios.ts
// Premade scenarios that are automatically created when a new agent is created

import { supabaseAdmin } from "@/lib/supabase/admin";

export interface PremadeStep {
  name: string;
  type: "say" | "gather" | "code" | "api_call" | "condition";
  ai_message?: string;
  code?: string;
}

export interface PremadeScenario {
  name: string;
  description?: string;
  steps: PremadeStep[];
}

export const PREMADE_SCENARIOS: PremadeScenario[] = [
  {
    name: "Customer Support",
    description: "Handle customer support inquiries and collect information",
    steps: [
      {
        name: "Greeting",
        type: "say",
        ai_message: "Hello! Thanks for calling. I'm here to help with your inquiry. Let me gather a few quick details.",
      },
      {
        name: "Get Customer Name",
        type: "gather",
        ai_message: "What is your name?",
      },
      {
        name: "Get Issue Description",
        type: "gather",
        ai_message: "What issue or question can I help you with today?",
      },
      {
        name: "Get Contact Information",
        type: "gather",
        ai_message: "What's the best phone number or email to reach you?",
      },
      {
        name: "Get Preferred Contact Time",
        type: "gather",
        ai_message: "When would be the best time for someone from our team to follow up with you?",
      },
      {
        name: "Closing",
        type: "say",
        ai_message: "Thank you for providing that information. Someone from our team will reach out to you shortly. Is there anything else I can help you with today?",
      },
    ],
  },
  {
    name: "Appointment Booking",
    description: "Schedule appointments and collect booking details",
    steps: [
      {
        name: "Greeting",
        type: "say",
        ai_message: "Hello! Thanks for calling. I can help you schedule an appointment. Let me get some information from you.",
      },
      {
        name: "Get Customer Name",
        type: "gather",
        ai_message: "What is your name?",
      },
      {
        name: "Get Service Type",
        type: "gather",
        ai_message: "What type of service or appointment are you looking to schedule?",
      },
      {
        name: "Get Preferred Date",
        type: "gather",
        ai_message: "What date would work best for you?",
      },
      {
        name: "Get Preferred Time",
        type: "gather",
        ai_message: "What time of day would you prefer?",
      },
      {
        name: "Get Contact Information",
        type: "gather",
        ai_message: "What's the best phone number to confirm the appointment?",
      },
      {
        name: "Closing",
        type: "say",
        ai_message: "Perfect! I've noted your preferences. Someone from our team will confirm the appointment details with you shortly. Is there anything else I can help you with?",
      },
    ],
  },
  {
    name: "Information Request",
    description: "Answer questions and provide information about services",
    steps: [
      {
        name: "Greeting",
        type: "say",
        ai_message: "Hello! Thanks for calling. I'm here to help answer any questions you might have.",
      },
      {
        name: "Get Customer Name",
        type: "gather",
        ai_message: "What is your name?",
      },
      {
        name: "Get Question Type",
        type: "gather",
        ai_message: "What information are you looking for today? For example, are you asking about our services, pricing, hours, or something else?",
      },
      {
        name: "Get Contact Information",
        type: "gather",
        ai_message: "What's the best way to reach you if we need to follow up?",
      },
      {
        name: "Closing",
        type: "say",
        ai_message: "Thank you for your question. I've noted your information, and someone from our team will get back to you if needed. Is there anything else I can help you with?",
      },
    ],
  },
  {
    name: "Sales Inquiry",
    description: "Handle sales inquiries and qualify leads",
    steps: [
      {
        name: "Greeting",
        type: "say",
        ai_message: "Hello! Thanks for your interest in our services. I'd like to learn more about what you're looking for.",
      },
      {
        name: "Get Customer Name",
        type: "gather",
        ai_message: "What is your name?",
      },
      {
        name: "Get Company Name",
        type: "gather",
        ai_message: "What company do you represent?",
      },
      {
        name: "Get Interest Area",
        type: "gather",
        ai_message: "What services or solutions are you most interested in?",
      },
      {
        name: "Get Timeline",
        type: "gather",
        ai_message: "What's your timeline for making a decision?",
      },
      {
        name: "Get Contact Information",
        type: "gather",
        ai_message: "What's the best way for our sales team to reach you?",
      },
      {
        name: "Closing",
        type: "say",
        ai_message: "Thank you for the information. Our sales team will reach out to you soon to discuss how we can help. Is there anything else I can assist you with?",
      },
    ],
  },
];

/**
 * Creates premade scenarios and their steps for a new agent
 */
export async function createPremadeScenarios(agentId: string): Promise<void> {
  try {
    for (let i = 0; i < PREMADE_SCENARIOS.length; i++) {
      const scenarioTemplate = PREMADE_SCENARIOS[i];
      
      // Create scenario
      const { data: scenario, error: scenarioError } = await supabaseAdmin
        .from("scenarios")
        .insert({
          agent_id: agentId,
          name: scenarioTemplate.name,
          description: scenarioTemplate.description || null,
          sort_order: i + 1,
        })
        .select("*")
        .single();

      if (scenarioError || !scenario) {
        console.error(`Failed to create scenario ${scenarioTemplate.name}:`, scenarioError);
        continue;
      }

      // Create steps for this scenario
      for (let j = 0; j < scenarioTemplate.steps.length; j++) {
        const stepTemplate = scenarioTemplate.steps[j];
        
        const { error: stepError } = await supabaseAdmin
          .from("steps")
          .insert({
            scenario_id: scenario.id,
            name: stepTemplate.name,
            type: stepTemplate.type,
            ai_message: stepTemplate.ai_message || null,
            code: stepTemplate.code || null,
            sort_order: j + 1,
          });

        if (stepError) {
          console.error(`Failed to create step ${stepTemplate.name} for scenario ${scenarioTemplate.name}:`, stepError);
        }
      }
    }
  } catch (error) {
    console.error("Error creating premade scenarios:", error);
    // Don't throw - we don't want to fail agent creation if premade scenarios fail
  }
}











