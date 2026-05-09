-- workspaces.enabled_features default was frozen back in Feb 2026
-- as {voice_agent, calendar, client_details, meeting_planner, sales,
-- emailing} — a legacy set that pre-dates Dante / Vergil. Every new
-- workspace since then has inherited that set, which means the
-- /dante/* layout's requireFeature("dante") immediately redirects
-- new users to /dashboard. Customers can't reach Watched Files,
-- the workflow gallery, the chat, etc., without an admin manually
-- patching their flags first.
--
-- Two fixes:
--   1. Move the column default to the modern set so newly-created
--      workspaces light up correctly.
--   2. Backfill existing workspaces that are still on the legacy
--      set so the same patch covers prior signups too.

alter table public.workspaces
  alter column enabled_features set default array[
    'dante',
    'archive',
    'grounded_summaries',
    'compliance_scanner',
    'ai_receptionist',
    'custom_summary_template',
    'knowledge_base',
    'compliance_plus',
    'sms_outreach',
    'outbound_voice'
  ]::text[];

-- Backfill: any workspace whose enabled_features are STILL the
-- exact legacy set gets bumped to the modern one. Workspaces that
-- have been customized (extra flags, removed flags) are left alone.
update public.workspaces
set enabled_features = array[
  'dante',
  'archive',
  'grounded_summaries',
  'compliance_scanner',
  'ai_receptionist',
  'custom_summary_template',
  'knowledge_base',
  'compliance_plus',
  'sms_outreach',
  'outbound_voice'
]::text[]
where enabled_features = array[
  'voice_agent', 'calendar', 'client_details', 'meeting_planner', 'sales', 'emailing'
]::text[];
