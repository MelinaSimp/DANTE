-- Seed Dante's default skill set into every existing workspace.
-- New workspaces get these via a workspace-creation trigger that
-- the application layer will install separately; this migration
-- backfills.
--
-- Three skills shipped at GA:
--
--   draft_review_meeting_recap
--     After a quarterly review meeting, draft a follow-up email to
--     the client recapping what was discussed and what they're
--     committing to. Reads memory + archive for context, returns
--     citation-grounded markdown. simulate=true by default —
--     advisor reviews + sends from their inbox.
--
--   summarize_recent_emails
--     Roll up the last 14 days of correspondence with a contact
--     into a tight 4-bullet summary the advisor can read before
--     a call. Always safe to auto-run.
--
--   prep_briefing_for_meeting
--     Given a contact id + meeting time, surface anything the
--     advisor should know going in: open promises, recent concerns,
--     pending action items pulled from memory.

insert into dante_skills (workspace_id, name, version, description, config, input_schema, auto_approve)
select
  w.id,
  'draft_review_meeting_recap',
  1,
  'Draft a follow-up email recapping a client review meeting, grounded in memory + vault citations.',
  jsonb_build_object(
    'objective', 'Draft a follow-up email to {{input.contact_name}} recapping our meeting today. Pull recent context from memory, cite any vault documents that support advice you reference, and end with a clear list of next steps each side committed to. Meeting notes: {{input.meeting_notes}}',
    'system', 'You are drafting on behalf of a financial advisor. Keep it warm but professional. Always ground specific recommendations in vault citations using the [v1] [v2] markers from vault.cite.',
    'tools', jsonb_build_array('memory.search', 'vault.cite'),
    'max_steps', 6
  ),
  jsonb_build_object(
    'type', 'object',
    'required', jsonb_build_array('contact_id', 'contact_name', 'meeting_notes'),
    'properties', jsonb_build_object(
      'contact_id', jsonb_build_object('type', 'string'),
      'contact_name', jsonb_build_object('type', 'string'),
      'meeting_notes', jsonb_build_object('type', 'string')
    )
  ),
  false                                                  -- compliance: requires advisor approval
from workspaces w
on conflict (workspace_id, name, version) do nothing;

insert into dante_skills (workspace_id, name, version, description, config, input_schema, auto_approve)
select
  w.id,
  'summarize_recent_emails',
  1,
  'Roll up the last 14 days of correspondence with a contact into a 4-bullet brief the advisor can read before a call.',
  jsonb_build_object(
    'objective', 'Search memory for episode-kind entries with source_kind="email" about contact {{input.contact_id}} from the last 14 days. Summarize them as 4 bullets focusing on: (1) any concerns raised, (2) any commitments either side made, (3) the emotional tone of recent exchanges, (4) anything still open. Be concise.',
    'system', 'You are summarizing for a financial advisor about to call this client. They have 90 seconds to read this. No fluff.',
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
on conflict (workspace_id, name, version) do nothing;

insert into dante_skills (workspace_id, name, version, description, config, input_schema, auto_approve)
select
  w.id,
  'prep_briefing_for_meeting',
  1,
  'Surface what the advisor needs to know before a meeting: open promises, recent concerns, pending action items.',
  jsonb_build_object(
    'objective', 'Prepare a meeting brief for contact {{input.contact_id}}. Pull facts and summaries from memory. Surface: (a) anything the advisor previously promised this client and hasn''t closed out, (b) any concerns raised in recent correspondence or calls, (c) one suggested opener that references a personal detail (family, hobby) if memory has one. Output as markdown with headers.',
    'system', 'You are briefing a financial advisor 5 minutes before they walk into a meeting. They want to feel prepared, not buried in detail.',
    'tools', jsonb_build_array('memory.search', 'archive.search'),
    'max_steps', 5
  ),
  jsonb_build_object(
    'type', 'object',
    'required', jsonb_build_array('contact_id'),
    'properties', jsonb_build_object(
      'contact_id', jsonb_build_object('type', 'string')
    )
  ),
  true
from workspaces w
on conflict (workspace_id, name, version) do nothing;
