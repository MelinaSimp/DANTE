-- Add market_context column to workspace_firm_prompts.
-- Stores per-workspace market intelligence (rent ranges, competitors,
-- demographics, local knowledge) that Dante uses during void analysis
-- and other CRE analysis tasks. Separate from custom_instructions
-- which are behavioral directives.

ALTER TABLE workspace_firm_prompts
  ADD COLUMN IF NOT EXISTS market_context text;

COMMENT ON COLUMN workspace_firm_prompts.market_context IS
  'Per-workspace market knowledge: rent ranges, competitors, demographics, local nuances. Injected into Dante during void analysis.';
