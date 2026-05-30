-- RLS policy for dante_approval_tokens.
--
-- The table was created with RLS enabled but no policies, which means
-- any non-service-role query returns zero rows. Today nothing breaks
-- because the approve endpoint uses supabaseAdmin (which bypasses RLS),
-- but the moment a future code path switches to the user client the
-- approvals silently stop working. This policy makes the intent
-- explicit: workspace members can see / use tokens scoped to their
-- workspace; nobody else can.

drop policy if exists dante_approval_tokens_workspace on public.dante_approval_tokens;

create policy dante_approval_tokens_workspace
  on public.dante_approval_tokens
  for all
  to authenticated
  using (
    workspace_id in (
      select workspace_id from public.profiles where id = auth.uid()
    )
  )
  with check (
    workspace_id in (
      select workspace_id from public.profiles where id = auth.uid()
    )
  );

comment on policy dante_approval_tokens_workspace on public.dante_approval_tokens is
  'Workspace members can read / write approval tokens for runs in their workspace. Service role still bypasses RLS for the approve webhook path.';
