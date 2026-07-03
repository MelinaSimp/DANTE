-- Agent Builder — store the architect's selected skills/tools alongside
-- the agent. Persona/greeting/model already live in dedicated columns
-- (llm_instructions, first_message, llm_model); this jsonb holds the
-- rest of the blueprint the conversational builder produced.
--
-- Shape: { "skills": string[], "tools": string[], "source": "architect" }
--
-- NOTE: this is persisted config, not a runtime enforcement boundary.
-- Making the agent loop honor a per-agent tool allowlist is a follow-up.

alter table public.agents
  add column if not exists builder_config jsonb;
