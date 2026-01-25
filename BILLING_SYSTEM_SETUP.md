# Billing System Setup Guide

## Overview

This billing system integrates Stripe for payment processing with custom pricing per workspace, usage tracking, and automatic invoicing.

## Architecture

```
Customer Payment → Stripe → (Automatic Payout) → Mercury Bank Account
```

- **Stripe**: Handles all payment processing, subscriptions, and invoices
- **Mercury**: Receives automatic payouts from Stripe (no code needed)
- **Custom Pricing**: Each workspace can have different pricing
- **Usage Tracking**: Tracks calls, messages, agents, API calls, and storage

## Database Migration

Run this migration in Supabase SQL Editor:

**File:** `supabase/migrations/add_billing_system.sql`

This creates:
- `stripe_customers` - Links workspaces to Stripe customers
- `custom_pricing` - Custom pricing per workspace
- `subscriptions` - Active subscriptions
- `invoices` - Payment history
- `usage_metrics` - Usage tracking data
- `payment_methods` - Stored payment methods
- `billing_events` - Webhook event log

## Environment Variables

Add these to your Vercel environment variables:

```bash
STRIPE_SECRET_KEY=sk_live_... # or sk_test_... for testing
STRIPE_WEBHOOK_SECRET=whsec_... # Get from Stripe Dashboard → Webhooks
```

## Stripe Setup

### 1. Create Stripe Account
1. Go to [stripe.com](https://stripe.com)
2. Create account or sign in
3. Get your API keys from Dashboard → Developers → API keys

### 2. Connect Mercury Bank Account
1. In Stripe Dashboard → Settings → Bank accounts and scheduling
2. Add your Mercury bank account
3. Stripe will automatically send payouts (daily/weekly based on your settings)

### 3. Set Up Webhooks
1. Go to Stripe Dashboard → Developers → Webhooks
2. Click "Add endpoint"
3. URL: `https://your-domain.com/api/billing/webhooks`
4. Select events to listen to:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. Copy the webhook signing secret to `STRIPE_WEBHOOK_SECRET`

## Default Pricing Structure

- **Base Subscription**: $1,000/month
- **Per Call**: $0.001 per call
- **Per Agent**: $0/month (free)
- **Per Message**: $0 (configurable)
- **Per API Call**: $0 (configurable)
- **Storage**: $0/GB (configurable)
- **Setup Fee**: $2,000 one-time

All pricing can be customized per workspace by admin.

## API Endpoints

### Subscriptions
- `POST /api/billing/subscriptions` - Create subscription (admin only)
- `GET /api/billing/subscriptions?workspaceId=xxx` - Get subscription

### Pricing
- `POST /api/billing/pricing` - Set custom pricing (admin only)
- `GET /api/billing/pricing?workspaceId=xxx` - Get pricing

### Usage Tracking
- `POST /api/billing/usage` - Record usage metric
- `GET /api/billing/usage?workspaceId=xxx&startDate=xxx&endDate=xxx` - Get usage

### Invoices
- `GET /api/billing/invoices?workspaceId=xxx` - Get invoices
- `POST /api/billing/invoices/generate` - Generate invoice (admin only)

### Webhooks
- `POST /api/billing/webhooks` - Stripe webhook handler

## Usage Tracking

To track usage, call the usage API from your application:

```typescript
// Track a call
await fetch('/api/billing/usage', {
  method: 'POST',
  body: JSON.stringify({
    workspaceId: 'xxx',
    metricType: 'calls',
    metricValue: 1,
    metadata: { duration: 120, phoneNumber: '+1234567890' }
  })
});

// Track messages
await fetch('/api/billing/usage', {
  method: 'POST',
  body: JSON.stringify({
    workspaceId: 'xxx',
    metricType: 'messages',
    metricValue: 1
  })
});

// Track agents (count active agents)
await fetch('/api/billing/usage', {
  method: 'POST',
  body: JSON.stringify({
    workspaceId: 'xxx',
    metricType: 'agents',
    metricValue: 5 // number of active agents
  })
});
```

## Admin Workflow

### 1. Create Subscription for Workspace
```typescript
POST /api/billing/subscriptions
{
  workspaceId: "xxx",
  billingFrequency: "monthly", // or "yearly"
  email: "customer@example.com",
  paymentMethodId: "pm_xxx" // optional
}
```

### 2. Set Custom Pricing
```typescript
POST /api/billing/pricing
{
  workspaceId: "xxx",
  baseSubscriptionAmount: 500.00,
  perCallAmount: 0.002,
  setupFee: 1000.00,
  billingFrequency: "monthly"
}
```

### 3. Generate Invoice (Automatic or Manual)
Invoices are automatically generated when Stripe charges the subscription. You can also manually generate:

```typescript
POST /api/billing/invoices/generate
{
  workspaceId: "xxx",
  startDate: "2024-01-01",
  endDate: "2024-01-31"
}
```

## Automatic Renewals

Stripe automatically:
1. Charges the subscription at the end of each billing period
2. Calculates usage-based charges (if configured)
3. Sends invoice to customer
4. Transfers funds to your Mercury account

## Next Steps

1. ✅ Run database migration
2. ✅ Set environment variables
3. ✅ Set up Stripe webhook
4. ✅ Connect Mercury bank account in Stripe
5. ⏳ Create admin UI for subscription management (TODO)
6. ⏳ Create customer-facing invoice view (TODO)

## Admin UI TODO

The following UI components need to be created:
- Subscription management page (create, view, cancel subscriptions)
- Custom pricing editor
- Invoice list and detail view
- Usage metrics dashboard
- Payment method management
