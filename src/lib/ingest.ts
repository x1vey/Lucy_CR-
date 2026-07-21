import "server-only";

import {
  applyTags,
  recordSubmission,
  setCustomerUtm,
  updateCustomer,
  upsertCustomerByEmail,
} from "@/lib/db";
import { extractUtm, hasUtm } from "@/lib/utm";
import type { CrmForm } from "@/lib/types";

// Takes a raw form payload + the form definition, applies the field mapping to
// create/match a customer, applies configured tags, and logs the submission.
// Shared by the public ingest API route and the hosted form page.

export interface IngestResult {
  ok: boolean;
  customer_id: string | null;
  submission_id: string;
  created_customer: boolean;
  error?: string;
}

export async function ingestSubmission(
  form: CrmForm,
  payload: Record<string, unknown>,
  sourceIp?: string | null,
): Promise<IngestResult> {
  const mapped: Record<string, unknown> = {};
  const customerPatch: { name?: string; email?: string; notes?: string } = {};

  // UTM params ride along in the payload (the embed/snippet copies them off the
  // page URL). They're not form fields, so we pull them out separately.
  const utm = extractUtm(payload);

  for (const field of form.fields) {
    const raw = payload[field.key];
    const value =
      typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw);

    const target = form.mapping.fields[field.key] ?? { kind: "ignore" as const };
    if (target.kind === "customer_field") {
      mapped[target.field] = value;
      customerPatch[target.field] = value;
    } else if (target.kind === "custom_field") {
      mapped[`custom.${target.key}`] = value;
    }

    // Basic required-field validation.
    if (field.required && !value) {
      const sub = await recordSubmission({
        form_id: form.id,
        payload,
        mapped,
        customer_id: null,
        source_ip: sourceIp,
        utm,
        status: "error:missing_required",
      });
      return {
        ok: false,
        customer_id: null,
        submission_id: sub.id,
        created_customer: false,
        error: `Missing required field: ${field.label}`,
      };
    }
  }

  let customerId: string | null = null;
  let createdCustomer = false;

  if (form.create_customer) {
    const name = customerPatch.name || customerPatch.email || "Unnamed contact";
    const { customer, created } = await upsertCustomerByEmail({
      name,
      email: customerPatch.email ?? null,
      notes: customerPatch.notes ?? null,
    });
    customerId = customer.id;
    createdCustomer = created;

    // If matched an existing customer, still refresh the mapped notes/name.
    if (!created) {
      await updateCustomer(customer.id, {
        name: customerPatch.name || customer.name,
      });
    }

    if (form.mapping.apply_tag_ids.length) {
      await applyTags(customer.id, form.mapping.apply_tag_ids);
    }

    // Record first-touch attribution on the contact (doesn't overwrite an
    // earlier source).
    if (hasUtm(utm)) {
      await setCustomerUtm(customer.id, utm);
    }
  }

  const sub = await recordSubmission({
    form_id: form.id,
    payload,
    mapped,
    customer_id: customerId,
    source_ip: sourceIp,
    utm,
    status: "received",
  });

  return {
    ok: true,
    customer_id: customerId,
    submission_id: sub.id,
    created_customer: createdCustomer,
  };
}
