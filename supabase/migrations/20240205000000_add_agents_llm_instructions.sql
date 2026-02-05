-- Add optional rules/instructions for the LLM (replaces scenario-based flow when set).
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS llm_instructions TEXT;

COMMENT ON COLUMN agents.llm_instructions IS 'Optional rules and instructions for the LLM. When set, voice/chat uses this as the system prompt instead of scenario steps.';
