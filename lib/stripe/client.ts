/**
 * Stripe Client
 * Singleton instance for Stripe API
 */

import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set in environment variables');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia',
  typescript: true,
});

// Stripe product and price IDs (you'll create these in Stripe dashboard)
// For now, we'll use dynamic pricing with invoice items
export const STRIPE_CONFIG = {
  // These will be set when you create products in Stripe
  // For custom pricing, we'll use invoice items instead of fixed prices
};
