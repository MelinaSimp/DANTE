-- 20260502_realtor_schema_parity.sql
--
-- Phase 2 W2.4 — Polymorphic contacts + re_* heavy entities.
--
-- ADR 0002 commits Drift to dual-vertical at parity. The wm_*
-- schema (wm_clients, wm_intelligence_profiles, wm_opportunities,
-- wm_tax_insights, wm_agent_definitions) is deep for advisors. The
-- realtor side has no symmetric tables — that's the parity gap
-- closed here.
--
-- Design choice (per ADR 0002 architecture diagram):
--   - contacts stays the canonical person identity, polymorphic via
--     contact_extensions(contact_id, industry, data jsonb) for
--     vertical-specific fields that don't deserve their own column.
--   - re_listings, re_tours, re_offers, re_transactions are the
--     heavy realtor entities — these are genuinely different
--     concepts from wm_opportunities, not different views of the
--     same person, so they get their own tables.

-- ── Polymorphic contact extensions ───────────────────────────────

CREATE TABLE IF NOT EXISTS contact_extensions (
  contact_id uuid PRIMARY KEY REFERENCES contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  industry text NOT NULL CHECK (industry IN ('financial_advisor', 'real_estate')),

  -- Vertical-specific fields stored as JSONB. The shape is enforced
  -- in app code via lib/industry/contact-schema.ts. Both verticals
  -- benefit from the JSON path — RIAs use it for risk_profile,
  -- aum_band, retention_score; realtors use it for stage,
  -- price_range, property_focus, lender_pre_approval.
  data jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_ext_workspace
  ON contact_extensions (workspace_id, industry);

-- A few common JSONB lookups warrant expression indexes. Realtor
-- "stage" is the highest-frequency one — every dashboard pipeline
-- query filters by it.
CREATE INDEX IF NOT EXISTS idx_contact_ext_stage
  ON contact_extensions ((data->>'stage'))
  WHERE industry = 'real_estate' AND data->>'stage' IS NOT NULL;

ALTER TABLE contact_extensions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contact_ext_select ON contact_extensions;
CREATE POLICY contact_ext_select ON contact_extensions
  FOR SELECT
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS contact_ext_modify ON contact_extensions;
CREATE POLICY contact_ext_modify ON contact_extensions
  FOR ALL
  USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

-- ── re_listings ──────────────────────────────────────────────────
--
-- A property currently being represented by the workspace. The
-- existing `properties` table tracks any property the workspace
-- knows about (including a buyer's wish-list); re_listings adds the
-- representation lifecycle on top: list_date, expires_on, agency
-- type, commission terms.

CREATE TABLE IF NOT EXISTS re_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE SET NULL,
  seller_contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,

  list_price_cents bigint,
  list_date date NOT NULL,
  expires_on date,
  agency_type text CHECK (agency_type IN ('exclusive_right', 'exclusive_agency', 'open')),
  commission_pct numeric(5,3),

  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'pending', 'sold', 'withdrawn', 'expired')),
  -- Days on market — computed on read; not stored to avoid drift.
  -- (UI calls AGE(now(), list_date) when surfacing.)

  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_re_listings_active
  ON re_listings (workspace_id, status) WHERE deleted_at IS NULL;

-- ── re_tours ─────────────────────────────────────────────────────
--
-- A scheduled or completed showing. One tour can have multiple
-- attendees (rare but valid — co-buyers); kept as a JSON array of
-- contact_ids on the row rather than a join table because tours
-- typically have 1-2 attendees and join overhead isn't worth it.

CREATE TABLE IF NOT EXISTS re_tours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE SET NULL,
  listing_id uuid REFERENCES re_listings(id) ON DELETE SET NULL,

  scheduled_at timestamptz NOT NULL,
  duration_minutes int NOT NULL DEFAULT 30,
  attendee_contact_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],

  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
  outcome text,                                       -- "interested", "not a fit", etc.
  recap text,                                         -- post-tour notes / drafted recap
  recap_generated_by_agent boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_re_tours_upcoming
  ON re_tours (workspace_id, scheduled_at)
  WHERE status = 'scheduled' AND deleted_at IS NULL;

-- ── re_offers ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS re_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE SET NULL,
  listing_id uuid REFERENCES re_listings(id) ON DELETE SET NULL,

  -- Whose offer this is — could be our buyer-client or an external
  -- buyer making an offer on our listing.
  buyer_contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  is_external boolean NOT NULL DEFAULT false,         -- true when buyer is not a contact

  offer_price_cents bigint NOT NULL,
  earnest_money_cents bigint,
  contingencies text[],                               -- ["financing","inspection","appraisal","sale_of_home"]
  expires_at timestamptz,
  closing_target date,

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'countered', 'rejected', 'withdrawn', 'closed')),
  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_re_offers_listing
  ON re_offers (workspace_id, listing_id)
  WHERE deleted_at IS NULL;

-- ── re_transactions ──────────────────────────────────────────────
--
-- A closed (or pending close) transaction. State the workspace cares
-- about for retention + GCI tracking. One transaction is the
-- consummation of one accepted offer.

CREATE TABLE IF NOT EXISTS re_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  offer_id uuid REFERENCES re_offers(id) ON DELETE SET NULL,
  property_id uuid REFERENCES properties(id) ON DELETE SET NULL,

  -- Side the workspace represented.
  side text NOT NULL CHECK (side IN ('buyer', 'seller', 'dual')),

  -- Money
  sale_price_cents bigint NOT NULL,
  commission_cents bigint,                            -- workspace's gross commission
  closing_date date,
  closing_status text NOT NULL DEFAULT 'pending'
    CHECK (closing_status IN ('pending', 'closed', 'cancelled', 'failed')),

  -- Compliance — retention clock starts at closing_date for state
  -- recordkeeping rules. The retention worker uses this column to
  -- gate hard-delete of related transaction documents.
  retention_clock_starts_at date,                     -- usually = closing_date

  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_re_transactions_closing
  ON re_transactions (workspace_id, closing_date DESC)
  WHERE deleted_at IS NULL;

-- ── RLS for the re_* tables ──────────────────────────────────────

ALTER TABLE re_listings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE re_tours       ENABLE ROW LEVEL SECURITY;
ALTER TABLE re_offers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE re_transactions ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['re_listings','re_tours','re_offers','re_transactions'] LOOP
    EXECUTE format('
      DROP POLICY IF EXISTS %1$s_select ON %1$s;
      CREATE POLICY %1$s_select ON %1$s
        FOR SELECT
        USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));
      DROP POLICY IF EXISTS %1$s_modify ON %1$s;
      CREATE POLICY %1$s_modify ON %1$s
        FOR ALL
        USING (workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid()));
    ', t);
  END LOOP;
END $$;

-- ── Updated_at triggers ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION re_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['re_listings','re_tours','re_offers','re_transactions','contact_extensions'] LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON %1$s;
      CREATE TRIGGER trg_%1$s_updated_at
        BEFORE UPDATE ON %1$s
        FOR EACH ROW EXECUTE FUNCTION re_set_updated_at();
    ', t);
  END LOOP;
END $$;

COMMENT ON TABLE re_listings     IS 'Phase 2 W2.4 — realtor listing lifecycle. Parity counterpart to wm_opportunities.';
COMMENT ON TABLE re_tours        IS 'Phase 2 W2.4 — realtor showings / tours.';
COMMENT ON TABLE re_offers       IS 'Phase 2 W2.4 — realtor offers (in-progress + historical).';
COMMENT ON TABLE re_transactions IS 'Phase 2 W2.4 — realtor closed transactions; retention clock anchor.';
COMMENT ON TABLE contact_extensions IS 'Polymorphic vertical-specific contact data (RIA: AUM, risk; realtor: stage, price range).';
