export const FEATURE_DEFINITIONS = {
  voice_agent: {
    id: "voice_agent",
    name: "Voice Agent",
    description: "AI-powered voice call handling and scheduling",
  },
  calendar: {
    id: "calendar",
    name: "Calendar",
    description: "Schedule management with availability slots",
  },
  client_details: {
    id: "client_details",
    name: "Client Details",
    description: "Client management, document upload, annotations, and AI summaries",
  },
  meeting_planner: {
    id: "meeting_planner",
    name: "Meeting Planner",
    description: "AI meeting analysis, next steps extraction, and reminders",
  },
  sales: {
    id: "sales",
    name: "Sales",
    description: "Outbound sales calling with script management",
  },
  emailing: {
    id: "emailing",
    name: "Emailing",
    description: "AI-assisted email composition with templates",
  },
  inbox: {
    id: "inbox",
    name: "Inbox",
    description: "Conversation inbox for managing voice and chat interactions",
  },
} as const;

export type FeatureId = keyof typeof FEATURE_DEFINITIONS;

export const ALL_FEATURE_IDS: FeatureId[] = Object.keys(FEATURE_DEFINITIONS) as FeatureId[];

export function getEnabledFeatures(enabledFeatures?: string[] | null): FeatureId[] {
  if (!enabledFeatures || enabledFeatures.length === 0) return ALL_FEATURE_IDS;
  return enabledFeatures.filter((f) => f in FEATURE_DEFINITIONS) as FeatureId[];
}
