-- Add billing_notes to workspaces for custom deal context.
-- White-glove pricing: every customer gets a negotiated rate.
-- This field stores the "why" behind the number.

alter table public.workspaces
  add column if not exists billing_notes text;

comment on column public.workspaces.billing_notes is
  'Free-text notes on this workspace''s pricing deal — why this rate, when to renegotiate, special terms. Admin-only.';
