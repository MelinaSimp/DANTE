// lib/billing/invoices.ts
//
// Stripe Invoicing for Drift's own billing — create a draft invoice for a
// company, review it, then finalize + send. The company pays the Stripe-hosted
// invoice (card or ACH bank debit); Stripe pays out to the connected bank
// account (Chase) on the account's payout schedule.
//
// Draft-first by design: createDraftInvoice() never emails anyone. Sending is
// a separate, explicit action (sendInvoice).

import { getStripeAsync } from "@/lib/stripe";

export interface InvoiceLineInput {
  description: string;
  quantity: number;
  /** Unit price in dollars (converted to integer cents for Stripe). */
  unit_amount: number;
}

export interface CreateInvoiceInput {
  company_name: string;
  email: string;
  line_items: InvoiceLineInput[];
  /** Net terms in days (e.g. 30 = Net 30). */
  due_days?: number;
  currency?: string;
  memo?: string;
}

export interface InvoiceSummary {
  id: string;
  number: string | null;
  company: string;
  email: string | null;
  status: string; // draft | open | paid | void | uncollectible
  total: number; // dollars
  currency: string;
  created: number;
  due_date: number | null;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
}

const PAYMENT_METHOD_TYPES = ["card", "us_bank_account"] as const; // card + ACH

function toSummary(inv: import("stripe").Stripe.Invoice): InvoiceSummary {
  return {
    id: inv.id,
    number: inv.number ?? null,
    company: inv.customer_name || "—",
    email: inv.customer_email ?? null,
    status: inv.status ?? "draft",
    total: (inv.total ?? 0) / 100,
    currency: (inv.currency ?? "usd").toUpperCase(),
    created: inv.created,
    due_date: inv.due_date ?? null,
    hosted_invoice_url: inv.hosted_invoice_url ?? null,
    invoice_pdf: inv.invoice_pdf ?? null,
  };
}

/** Find an existing customer by email, or create one. */
async function resolveCustomer(companyName: string, email: string): Promise<string> {
  const stripe = await getStripeAsync();
  const existing = await stripe.customers.list({ email, limit: 1 });
  if (existing.data[0]) {
    // Keep the company name current.
    if (existing.data[0].name !== companyName) {
      await stripe.customers.update(existing.data[0].id, { name: companyName });
    }
    return existing.data[0].id;
  }
  const created = await stripe.customers.create({ name: companyName, email });
  return created.id;
}

/**
 * Create a DRAFT invoice with line items. Does not finalize or email — that's
 * sendInvoice(). Returns the draft summary for review in the admin UI.
 */
export async function createDraftInvoice(input: CreateInvoiceInput): Promise<InvoiceSummary> {
  const stripe = await getStripeAsync();
  const currency = (input.currency || "usd").toLowerCase();
  const customer = await resolveCustomer(input.company_name.trim(), input.email.trim());

  // Draft invoice, send-mode collection (Stripe emails a hosted invoice the
  // company pays). auto_advance:false keeps it a draft until we explicitly send.
  const invoice = await stripe.invoices.create({
    customer,
    collection_method: "send_invoice",
    days_until_due: input.due_days ?? 30,
    auto_advance: false,
    currency,
    ...(input.memo ? { description: input.memo } : {}),
    payment_settings: { payment_method_types: [...PAYMENT_METHOD_TYPES] },
  });

  // Attach each line to this specific draft invoice.
  for (const line of input.line_items) {
    const qty = Math.max(1, Math.round(line.quantity || 1));
    await stripe.invoiceItems.create({
      customer,
      invoice: invoice.id,
      currency,
      description: line.description,
      quantity: qty,
      // amount is the integer-cents total for the line (unit price x quantity).
      amount: Math.round((line.unit_amount || 0) * 100) * qty,
    });
  }

  const refreshed = await stripe.invoices.retrieve(invoice.id);
  return toSummary(refreshed);
}

/** Finalize a draft and email it to the company. Returns the open invoice. */
export async function sendInvoice(invoiceId: string): Promise<InvoiceSummary> {
  const stripe = await getStripeAsync();
  await stripe.invoices.finalizeInvoice(invoiceId);
  const sent = await stripe.invoices.sendInvoice(invoiceId);
  return toSummary(sent);
}

/** Delete a draft, or void an already-finalized (open) invoice. */
export async function voidInvoice(invoiceId: string): Promise<{ id: string; status: string }> {
  const stripe = await getStripeAsync();
  const inv = await stripe.invoices.retrieve(invoiceId);
  if (inv.status === "draft") {
    await stripe.invoices.del(invoiceId);
    return { id: invoiceId, status: "deleted" };
  }
  const voided = await stripe.invoices.voidInvoice(invoiceId);
  return { id: invoiceId, status: voided.status ?? "void" };
}

/** Recent invoices, newest first, with live status pulled from Stripe. */
export async function listInvoices(limit = 50): Promise<InvoiceSummary[]> {
  const stripe = await getStripeAsync();
  const res = await stripe.invoices.list({ limit });
  return res.data.map(toSummary);
}

export interface InvoiceDetail extends InvoiceSummary {
  memo: string | null;
  payment_method_types: string[];
  lines: Array<{ description: string; quantity: number | null; amount: number }>;
}

/** Full invoice incl. line items — backs the in-app preview ("what gets sent"). */
export async function getInvoiceDetail(invoiceId: string): Promise<InvoiceDetail> {
  const stripe = await getStripeAsync();
  const inv = await stripe.invoices.retrieve(invoiceId, { expand: ["lines"] });
  return {
    ...toSummary(inv),
    memo: inv.description ?? null,
    payment_method_types: (inv.payment_settings?.payment_method_types ?? []) as string[],
    lines: (inv.lines?.data ?? []).map((l) => ({
      description: l.description ?? "—",
      quantity: l.quantity ?? null,
      amount: (l.amount ?? 0) / 100,
    })),
  };
}
