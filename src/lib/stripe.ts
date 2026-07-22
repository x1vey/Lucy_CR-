import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { env, isStripeConfigured } from "@/lib/env";

// ---------------------------------------------------------------------------
// Stripe integration — payment only. Uses Stripe's REST API via fetch (no SDK
// dependency), matching the dependency-free style of the Google client.
//
// DEMO FALLBACK: when Stripe isn't configured, createCheckoutSession returns an
// internal confirm URL that walks the exact same confirm-and-book path the real
// webhook would — so the paid flow is fully exercisable with zero keys.
// ---------------------------------------------------------------------------

export interface CheckoutInput {
  calendarId: string;
  bookingId: string;
  slug: string;
  productName: string;
  amount: number; // major units (e.g. dollars)
  currency: string;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutResult {
  url: string;
  sessionId: string;
  demo: boolean;
}

export async function createCheckoutSession(
  input: CheckoutInput,
): Promise<CheckoutResult> {
  if (!isStripeConfigured()) {
    // Demo: skip Stripe entirely; hand back an internal confirm URL that flips
    // the pending hold to confirmed. sessionId is synthetic but unique so the
    // booking can still be looked up by it.
    const sessionId = `demo_cs_${input.bookingId}`;
    const url = `${env.appUrl()}/c/${input.slug}/confirm?demo=1&cal=${input.calendarId}&booking=${input.bookingId}`;
    return { url, sessionId, demo: true };
  }

  // Stripe expects amounts in the smallest currency unit (cents).
  const unitAmount = Math.round(input.amount * 100);
  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("success_url", input.successUrl);
  body.set("cancel_url", input.cancelUrl);
  body.set("line_items[0][quantity]", "1");
  body.set("line_items[0][price_data][currency]", input.currency.toLowerCase());
  body.set("line_items[0][price_data][unit_amount]", String(unitAmount));
  body.set("line_items[0][price_data][product_data][name]", input.productName);
  body.set("metadata[calendar_id]", input.calendarId);
  body.set("metadata[booking_id]", input.bookingId);
  if (input.customerEmail) body.set("customer_email", input.customerEmail);

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.stripeSecretKey()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) throw new Error(`Stripe checkout failed: ${await res.text()}`);
  const data = (await res.json()) as { id: string; url: string };
  return { url: data.url, sessionId: data.id, demo: false };
}

// ---------------------------------------------------------------------------
// Webhook signature verification (Stripe's scheme: HMAC-SHA256 over
// "<timestamp>.<raw body>" keyed by the webhook secret). Done manually to avoid
// the SDK. Returns the parsed event on success, or null on a bad signature.
// ---------------------------------------------------------------------------

export interface StripeEvent {
  type: string;
  data: { object: Record<string, unknown> };
}

export function verifyWebhook(
  rawBody: string,
  signatureHeader: string | null,
): StripeEvent | null {
  if (!signatureHeader) return null;
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((kv) => kv.split("=") as [string, string]),
  );
  const timestamp = parts["t"];
  const provided = parts["v1"];
  if (!timestamp || !provided) return null;

  const expected = createHmac("sha256", env.stripeWebhookSecret())
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    return JSON.parse(rawBody) as StripeEvent;
  } catch {
    return null;
  }
}
