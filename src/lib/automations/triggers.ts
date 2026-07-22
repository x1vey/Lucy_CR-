import "server-only";

import { enrollContact, listAutomations } from "@/lib/db";
import { runDueEnrollments } from "@/lib/automations/runner";
import type { Automation } from "@/lib/types";

// ---------------------------------------------------------------------------
// Trigger helpers — turn CRM events (form submit, tag added) into automation
// enrollments, then immediately advance them so the first non-wait steps fire
// right away. Called from the ingest pipeline and the tag write actions.
//
// These are best-effort and never throw: an automation problem must not break
// the form submission or tag write that triggered it.
// ---------------------------------------------------------------------------

async function activeAutomations(): Promise<Automation[]> {
  try {
    return (await listAutomations()).filter((a) => a.active);
  } catch {
    return [];
  }
}

async function enrollAndRun(automationId: string, customerId: string) {
  try {
    const enrollment = await enrollContact(automationId, customerId);
    if (enrollment && enrollment.status === "active") {
      // Advance immediately so the first email/tag steps run at trigger time
      // (waits still schedule the next tick).
      await runDueEnrollments();
    }
  } catch {
    // swallow — triggering is best-effort
  }
}

/** Enroll a contact into every active automation triggered by this form. */
export async function enrollFromForm(
  formId: string,
  customerId: string,
): Promise<void> {
  const autos = await activeAutomations();
  for (const a of autos) {
    if (a.trigger.kind === "form_submission" && a.trigger.form_id === formId) {
      await enrollAndRun(a.id, customerId);
    }
  }
}

/**
 * Enroll contacts into every active automation triggered by any of these tags.
 * `customerIds` is the set of contacts the tag(s) were just applied to.
 */
export async function enrollFromTag(
  tagIds: string[],
  customerIds: string[],
): Promise<void> {
  if (!tagIds.length || !customerIds.length) return;
  const autos = await activeAutomations();
  const tagSet = new Set(tagIds);
  for (const a of autos) {
    if (a.trigger.kind === "tag_added" && a.trigger.tag_id && tagSet.has(a.trigger.tag_id)) {
      for (const cid of customerIds) await enrollAndRun(a.id, cid);
    }
  }
}
