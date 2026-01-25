-- Billing System Migration
-- Supports Stripe integration, custom pricing, usage tracking, and invoices

-- ============================================
-- 1. STRIPE CUSTOMERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS stripe_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  stripe_customer_id TEXT NOT NULL UNIQUE, -- Stripe customer ID
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stripe_customers_workspace ON stripe_customers(workspace_id);
CREATE INDEX IF NOT EXISTS idx_stripe_customers_stripe_id ON stripe_customers(stripe_customer_id);

-- ============================================
-- 2. CUSTOM PRICING TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS custom_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  base_subscription_amount DECIMAL(10, 2) DEFAULT 1000.00, -- Base monthly subscription
  per_call_amount DECIMAL(10, 4) DEFAULT 0.001, -- Per call charge
  per_agent_amount DECIMAL(10, 2) DEFAULT 0.00, -- Per agent per month
  per_message_amount DECIMAL(10, 4) DEFAULT 0.00, -- Per message/SMS charge
  per_api_call_amount DECIMAL(10, 4) DEFAULT 0.00, -- Per API call charge
  storage_gb_amount DECIMAL(10, 2) DEFAULT 0.00, -- Per GB storage per month
  setup_fee DECIMAL(10, 2) DEFAULT 2000.00, -- One-time setup fee
  billing_frequency TEXT DEFAULT 'monthly' CHECK (billing_frequency IN ('monthly', 'yearly')),
  currency TEXT DEFAULT 'USD',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_custom_pricing_workspace ON custom_pricing(workspace_id);

-- ============================================
-- 3. SUBSCRIPTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE, -- Stripe subscription ID
  stripe_customer_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due', 'unpaid', 'trialing', 'paused')),
  billing_frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_frequency IN ('monthly', 'yearly')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  canceled_at TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_workspace ON subscriptions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_id ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- ============================================
-- 4. INVOICES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  stripe_invoice_id TEXT UNIQUE, -- Stripe invoice ID
  stripe_payment_intent_id TEXT,
  invoice_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'paid', 'void', 'uncollectible')),
  amount_due DECIMAL(10, 2) NOT NULL,
  amount_paid DECIMAL(10, 2) DEFAULT 0.00,
  subtotal DECIMAL(10, 2) NOT NULL,
  tax DECIMAL(10, 2) DEFAULT 0.00,
  total DECIMAL(10, 2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  billing_period_start TIMESTAMPTZ,
  billing_period_end TIMESTAMPTZ,
  due_date TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  invoice_pdf_url TEXT, -- Stripe invoice PDF URL
  line_items JSONB DEFAULT '[]'::jsonb, -- Breakdown of charges
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_workspace ON invoices(workspace_id);
CREATE INDEX IF NOT EXISTS idx_invoices_subscription ON invoices(subscription_id);
CREATE INDEX IF NOT EXISTS idx_invoices_stripe_id ON invoices(stripe_invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

-- ============================================
-- 5. USAGE METRICS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS usage_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  metric_date DATE NOT NULL, -- Date for the metric
  metric_type TEXT NOT NULL CHECK (metric_type IN ('calls', 'messages', 'agents', 'api_calls', 'storage_gb')),
  metric_value DECIMAL(12, 4) NOT NULL DEFAULT 0, -- Can be fractional (e.g., 0.5 GB)
  metadata JSONB DEFAULT '{}'::jsonb, -- Additional context (e.g., call duration, message type)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, metric_date, metric_type)
);

CREATE INDEX IF NOT EXISTS idx_usage_metrics_workspace ON usage_metrics(workspace_id);
CREATE INDEX IF NOT EXISTS idx_usage_metrics_date ON usage_metrics(metric_date);
CREATE INDEX IF NOT EXISTS idx_usage_metrics_type ON usage_metrics(metric_type);
CREATE INDEX IF NOT EXISTS idx_usage_metrics_workspace_date ON usage_metrics(workspace_id, metric_date);

-- ============================================
-- 6. PAYMENT METHODS TABLE (Optional - for storing card info)
-- ============================================
CREATE TABLE IF NOT EXISTS payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  stripe_payment_method_id TEXT UNIQUE, -- Stripe payment method ID
  type TEXT NOT NULL CHECK (type IN ('card', 'ach_debit', 'ach_credit')),
  is_default BOOLEAN DEFAULT false,
  last4 TEXT, -- Last 4 digits of card/account
  brand TEXT, -- Card brand (visa, mastercard, etc.)
  exp_month INT,
  exp_year INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_workspace ON payment_methods(workspace_id);

-- ============================================
-- 7. BILLING EVENTS TABLE (For webhook tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL, -- 'payment.succeeded', 'payment.failed', 'subscription.created', etc.
  stripe_event_id TEXT UNIQUE, -- Stripe event ID (to prevent duplicate processing)
  event_data JSONB NOT NULL, -- Full event payload from Stripe
  processed BOOLEAN DEFAULT false,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_events_workspace ON billing_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_stripe_id ON billing_events(stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_processed ON billing_events(processed);

-- ============================================
-- 8. RLS POLICIES
-- ============================================

-- Stripe Customers
ALTER TABLE stripe_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read stripe customers for their workspace" ON stripe_customers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workspaces w
      JOIN profiles p ON w.id = p.workspace_id
      WHERE w.id = stripe_customers.workspace_id
      AND p.id = auth.uid()
    )
  );

-- Custom Pricing (Admin only)
ALTER TABLE custom_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage custom pricing" ON custom_pricing
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.is_superadmin = true OR profiles.role IN ('owner', 'admin'))
    )
  );

-- Subscriptions
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read subscriptions for their workspace" ON subscriptions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workspaces w
      JOIN profiles p ON w.id = p.workspace_id
      WHERE w.id = subscriptions.workspace_id
      AND p.id = auth.uid()
    )
  );

-- Invoices
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read invoices for their workspace" ON invoices
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workspaces w
      JOIN profiles p ON w.id = p.workspace_id
      WHERE w.id = invoices.workspace_id
      AND p.id = auth.uid()
    )
  );

-- Usage Metrics
ALTER TABLE usage_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read usage metrics for their workspace" ON usage_metrics
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workspaces w
      JOIN profiles p ON w.id = p.workspace_id
      WHERE w.id = usage_metrics.workspace_id
      AND p.id = auth.uid()
    )
  );

-- Payment Methods
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read payment methods for their workspace" ON payment_methods
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workspaces w
      JOIN profiles p ON w.id = p.workspace_id
      WHERE w.id = payment_methods.workspace_id
      AND p.id = auth.uid()
    )
  );

-- Billing Events (Admin only)
ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read billing events" ON billing_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.is_superadmin = true OR profiles.role IN ('owner', 'admin'))
    )
  );

-- ============================================
-- 9. TRIGGERS
-- ============================================

-- Update updated_at timestamps
CREATE TRIGGER update_stripe_customers_updated_at
  BEFORE UPDATE ON stripe_customers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_custom_pricing_updated_at
  BEFORE UPDATE ON custom_pricing
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_methods_updated_at
  BEFORE UPDATE ON payment_methods
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 10. HELPER FUNCTIONS
-- ============================================

-- Function to get current usage for a workspace in a date range
CREATE OR REPLACE FUNCTION get_workspace_usage(
  p_workspace_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  metric_type TEXT,
  total_value DECIMAL(12, 4)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    um.metric_type,
    SUM(um.metric_value) as total_value
  FROM usage_metrics um
  WHERE um.workspace_id = p_workspace_id
    AND um.metric_date >= p_start_date
    AND um.metric_date <= p_end_date
  GROUP BY um.metric_type;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate invoice amount based on usage and pricing
CREATE OR REPLACE FUNCTION calculate_invoice_amount(
  p_workspace_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS DECIMAL(10, 2) AS $$
DECLARE
  v_base_amount DECIMAL(10, 2);
  v_per_call DECIMAL(10, 4);
  v_per_agent DECIMAL(10, 2);
  v_per_message DECIMAL(10, 4);
  v_per_api_call DECIMAL(10, 4);
  v_storage_gb DECIMAL(10, 2);
  v_calls DECIMAL(12, 4);
  v_messages DECIMAL(12, 4);
  v_agents DECIMAL(12, 4);
  v_api_calls DECIMAL(12, 4);
  v_storage DECIMAL(12, 4);
  v_total DECIMAL(10, 2);
BEGIN
  -- Get pricing
  SELECT 
    base_subscription_amount,
    per_call_amount,
    per_agent_amount,
    per_message_amount,
    per_api_call_amount,
    storage_gb_amount
  INTO 
    v_base_amount,
    v_per_call,
    v_per_agent,
    v_per_message,
    v_per_api_call,
    v_storage_gb
  FROM custom_pricing
  WHERE workspace_id = p_workspace_id
    AND is_active = true
  LIMIT 1;

  -- If no custom pricing, use defaults
  IF v_base_amount IS NULL THEN
    v_base_amount := 1000.00;
    v_per_call := 0.001;
    v_per_agent := 0.00;
    v_per_message := 0.00;
    v_per_api_call := 0.00;
    v_storage_gb := 0.00;
  END IF;

  -- Get usage totals
  SELECT COALESCE(SUM(metric_value), 0) INTO v_calls
  FROM usage_metrics
  WHERE workspace_id = p_workspace_id
    AND metric_type = 'calls'
    AND metric_date >= p_start_date
    AND metric_date <= p_end_date;

  SELECT COALESCE(SUM(metric_value), 0) INTO v_messages
  FROM usage_metrics
  WHERE workspace_id = p_workspace_id
    AND metric_type = 'messages'
    AND metric_date >= p_start_date
    AND metric_date <= p_end_date;

  SELECT COALESCE(SUM(metric_value), 0) INTO v_agents
  FROM usage_metrics
  WHERE workspace_id = p_workspace_id
    AND metric_type = 'agents'
    AND metric_date >= p_start_date
    AND metric_date <= p_end_date;

  SELECT COALESCE(SUM(metric_value), 0) INTO v_api_calls
  FROM usage_metrics
  WHERE workspace_id = p_workspace_id
    AND metric_type = 'api_calls'
    AND metric_date >= p_start_date
    AND metric_date <= p_end_date;

  SELECT COALESCE(SUM(metric_value), 0) INTO v_storage
  FROM usage_metrics
  WHERE workspace_id = p_workspace_id
    AND metric_type = 'storage_gb'
    AND metric_date >= p_start_date
    AND metric_date <= p_end_date;

  -- Calculate total
  v_total := v_base_amount
    + (v_calls * v_per_call)
    + (v_agents * v_per_agent)
    + (v_messages * v_per_message)
    + (v_api_calls * v_per_api_call)
    + (v_storage * v_storage_gb);

  RETURN v_total;
END;
$$ LANGUAGE plpgsql;
