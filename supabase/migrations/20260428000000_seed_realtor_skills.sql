-- Backfill realtor-specific Dante/Vergil skills into existing
-- real_estate workspaces, and disable the advisor-flavored skills
-- that the prior seed migration (20260425040000) overreached into
-- realtor workspaces.
--
-- New workspaces get the right vertical's defaults at onboarding
-- completion via /api/onboarding/complete (no trigger needed).
--
-- Three realtor skills:
--
--   draft_listing_prep_recap
--     After a listing-prep walkthrough, draft a recap email to the
--     seller. Cites vault docs (comps, prep checklists) and ends
--     with split next-steps. simulate=true — agent reviews + sends.
--
--   summarize_recent_buyer_emails
--     Roll up the last 14 days of correspondence with a buyer or
--     seller into a 4-bullet brief the agent can read before a
--     showing or call. Read-only; auto_approve=true.
--
--   prep_briefing_for_showing
--     Surface what the agent needs to know before a showing:
--     stated must-haves, deal-breakers, prior properties seen, open
--     commitments. Read-only; auto_approve=true.

-- 1. Disable the advisor-flavored skills that landed in realtor
--    workspaces from the prior seed migration. We disable rather
--    than delete so any historical skill_runs rows still resolve.
update dante_skills
set enabled = false
where enabled = true
  and name in (
    'draft_review_meeting_recap',
    'summarize_recent_emails',
    'prep_briefing_for_meeting'
  )
  and workspace_id in (
    select id from workspaces where industry = 'real_estate'
  );

-- 2. Seed draft_listing_prep_recap into all real_estate workspaces.
insert into dante_skills (workspace_id, name, version, description, config, input_schema, auto_approve)
select
  w.id,
  'draft_listing_prep_recap',
  1,
  'Draft a recap email after a listing-prep walkthrough, grounded in memory + property details.',
  jsonb_build_object(
    'objective', 'Draft a follow-up email to {{input.contact_name}} recapping today''s walkthrough at {{input.property_address}}. Pull recent context from memory, cite any vault documents (comps, prep checklists) that support recommendations, and end with a clear list of what we''re each doing before the listing goes live. Walkthrough notes: {{input.walkthrough_notes}}',
    'system', 'You are drafting on behalf of a real-estate agent. Warm, specific, and free of jargon. Ground concrete claims (comps, repair costs, pricing) in vault citations using the [v1] [v2] markers from vault.cite.',
    'tools', jsonb_build_array('memory.search', 'vault.cite'),
    'max_steps', 6
  ),
  jsonb_build_object(
    'type', 'object',
    'required', jsonb_build_array('contact_id', 'contact_name', 'property_address', 'walkthrough_notes'),
    'properties', jsonb_build_object(
      'contact_id', jsonb_build_object('type', 'string'),
      'contact_name', jsonb_build_object('type', 'string'),
      'property_address', jsonb_build_object('type', 'string'),
      'walkthrough_notes', jsonb_build_object('type', 'string')
    )
  ),
  false                                                  -- client-facing; requires agent approval
from workspaces w
where w.industry = 'real_estate'
on conflict (workspace_id, name, version) do nothing;

-- 3. Seed summarize_recent_buyer_emails into all real_estate workspaces.
insert into dante_skills (workspace_id, name, version, description, config, input_schema, auto_approve)
select
  w.id,
  'summarize_recent_buyer_emails',
  1,
  'Roll up the last 14 days of correspondence with a buyer or seller into a 4-bullet brief the agent can read before a showing or call.',
  jsonb_build_object(
    'objective', 'Search memory for episode-kind entries with source_kind="email" about contact {{input.contact_id}} from the last 14 days. Summarize them as 4 bullets focusing on: (1) what they''re looking for or willing to compromise on, (2) any commitments either side made (showings booked, docs sent), (3) the emotional tone (excited, hesitant, frustrated), (4) anything still open. Be concise.',
    'system', 'You are summarizing for a real-estate agent about to call this contact or walk into a showing with them. They have 90 seconds to read this. No fluff.',
    'tools', jsonb_build_array('memory.search'),
    'max_steps', 4
  ),
  jsonb_build_object(
    'type', 'object',
    'required', jsonb_build_array('contact_id'),
    'properties', jsonb_build_object(
      'contact_id', jsonb_build_object('type', 'string')
    )
  ),
  true                                                   -- read-only; safe to auto-run
from workspaces w
where w.industry = 'real_estate'
on conflict (workspace_id, name, version) do nothing;

-- 4. Seed prep_briefing_for_showing into all real_estate workspaces.
insert into dante_skills (workspace_id, name, version, description, config, input_schema, auto_approve)
select
  w.id,
  'prep_briefing_for_showing',
  1,
  'Surface what the agent needs to know before a showing: stated must-haves, deal-breakers, prior properties seen, open commitments.',
  jsonb_build_object(
    'objective', 'Prepare a showing brief for contact {{input.contact_id}}. Pull facts and summaries from memory. Surface: (a) what they''ve said is non-negotiable vs. nice-to-have, (b) properties they''ve already seen and what they liked/disliked, (c) anything the agent previously promised that hasn''t been closed out, (d) one personal detail (family, hobby, motivation) the agent can lead with. Output as markdown with headers.',
    'system', 'You are briefing a real-estate agent 5 minutes before a showing. They want to feel prepared, not buried in detail.',
    'tools', jsonb_build_array('memory.search', 'archive.search'),
    'max_steps', 5
  ),
  jsonb_build_object(
    'type', 'object',
    'required', jsonb_build_array('contact_id'),
    'properties', jsonb_build_object(
      'contact_id', jsonb_build_object('type', 'string'),
      'property_address', jsonb_build_object('type', 'string')
    )
  ),
  true
from workspaces w
where w.industry = 'real_estate'
on conflict (workspace_id, name, version) do nothing;
