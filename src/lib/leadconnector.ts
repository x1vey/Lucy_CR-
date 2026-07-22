import "server-only";

import { env, isLeadConnectorConfigured } from "@/lib/env";

// ---------------------------------------------------------------------------
// LeadConnector (GoHighLevel) email send transport. Dependency-free fetch
// wrapper, same shape as src/lib/google.ts / stripe.ts.
//
// DEMO FALLBACK: when no API key is configured, "sends" resolve to a fake
// message id (demo-msg-…) so an automation runs end-to-end with no key. The
// runner records the demo send in the enrollment history either way.
//
// LeadConnector account shapes vary (v1 vs v2 / private integrations), so the
// base URL, API version and endpoint path are all env-configurable with sane
// v2 defaults — the user can point these at their exact setup with no code edit.
// ---------------------------------------------------------------------------

export interface SendEmailInput {
  toEmail: string;
  toName?: string;
  subject: string;
  html: string; // rendered body (merge fields already substituted)
  fromName?: string | null;
  contactId?: string | null; // LC contact id if known
}

export interface SendResult {
  messageId: string;
  demo: boolean;
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${env.leadConnectorApiKey()}`,
    Version: env.leadConnectorApiVersion(),
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

/** Send an email through LeadConnector, or a demo no-op when unconfigured. */
export async function sendEmail(input: SendEmailInput): Promise<SendResult> {
  if (!isLeadConnectorConfigured()) {
    return {
      messageId: `demo-msg-${Math.random().toString(36).slice(2, 12)}`,
      demo: true,
    };
  }

  const url = `${env.leadConnectorBaseUrl()}${env.leadConnectorEmailEndpoint()}`;
  // v2 conversations/messages shape. locationId is included when provided.
  const payload: Record<string, unknown> = {
    type: "Email",
    subject: input.subject,
    html: input.html,
    emailTo: input.toEmail,
  };
  const locationId = env.leadConnectorLocationId();
  if (locationId) payload.locationId = locationId;
  if (input.contactId) payload.contactId = input.contactId;
  if (input.fromName) payload.emailFrom = input.fromName;

  const res = await fetch(url, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(
      `LeadConnector send failed (${res.status}): ${await res.text()}`,
    );
  }
  const data = (await res.json().catch(() => ({}))) as {
    messageId?: string;
    id?: string;
    conversationId?: string;
  };
  return {
    messageId: data.messageId ?? data.id ?? data.conversationId ?? "sent",
    demo: false,
  };
}

/**
 * Best-effort upsert of a contact into LeadConnector. Returns the LC contact id
 * or null; never throws (a failed upsert must not break the automation — email
 * send can still target the raw address).
 */
export async function upsertContact(input: {
  name: string;
  email: string;
}): Promise<string | null> {
  if (!isLeadConnectorConfigured()) return null;
  try {
    const url = `${env.leadConnectorBaseUrl()}/contacts/`;
    const [firstName, ...rest] = input.name.trim().split(/\s+/);
    const payload: Record<string, unknown> = {
      email: input.email,
      firstName: firstName || input.email,
      lastName: rest.join(" ") || undefined,
    };
    const locationId = env.leadConnectorLocationId();
    if (locationId) payload.locationId = locationId;
    const res = await fetch(url, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as {
      contact?: { id?: string };
      id?: string;
    };
    return data.contact?.id ?? data.id ?? null;
  } catch {
    return null;
  }
}
