ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS billing_amount INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_cycle TEXT DEFAULT 'monthly'
    CHECK (billing_cycle IN ('monthly', 'yearly')),
  ADD COLUMN IF NOT EXISTS invite_code TEXT UNIQUE;
