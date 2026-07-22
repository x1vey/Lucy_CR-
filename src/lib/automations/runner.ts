import "server-only";

import {
  addTagToCustomers,
  claimDueEnrollments,
  getAutomation,
  recordActivity,
  recordEmail,
  recordStepRun,
  setCustomerTag,
  updateEnrollment,
} from "@/lib/db";
import { sendEmail } from "@/lib/leadconnector";
import type { AutomationEnrollment, AutomationStep } from "@/lib/types";

// ---------------------------------------------------------------------------
// The automation runner — Lucy's timing engine. Advances each due enrollment
// through its automation's steps until it hits a `wait` (which schedules the
// next tick) or runs out of steps (completed). Called by /api/automations/tick
// (wire to Vercel Cron in prod) and the manual "Run now" action in demo mode.
//
// Per-step execution is logged to the automation_step_runs table (recordStepRun)
// rather than a JSON array on the enrollment.
// ---------------------------------------------------------------------------

export interface TickSummary {
  claimed: number;
  advanced: number;
  completed: number;
  failed: number;
  emailsSent: number;
}

// Substitute {{name}}, {{email}} and {{custom.<key>}} merge fields from the
// enrollment context. Unknown fields collapse to empty string.
function renderTemplate(tpl: string, context: Record<string, unknown>): string {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    if (key.startsWith("custom.")) {
      const custom = (context.custom ?? {}) as Record<string, unknown>;
      const v = custom[key.slice("custom.".length)];
      return v == null ? "" : String(v);
    }
    const v = context[key];
    return v == null ? "" : String(v);
  });
}

/**
 * Run one enrollment forward from its current step. Executes email/tag steps
 * immediately and stops at the first `wait` (scheduling next_run_at) or the end.
 * Returns which terminal/paused outcome happened for the tick summary.
 */
async function advanceEnrollment(
  enrollment: AutomationEnrollment,
): Promise<{ outcome: "waiting" | "completed" | "failed"; emails: number }> {
  const log = (
    stepIndex: number,
    step: AutomationStep,
    detail: string,
    extra?: { message_id?: string | null; error?: string | null },
  ) =>
    recordStepRun({
      enrollment_id: enrollment.id,
      step_index: stepIndex,
      step_type: step.type,
      detail,
      message_id: extra?.message_id ?? null,
      error: extra?.error ?? null,
    });

  const automation = await getAutomation(enrollment.automation_id);
  if (!automation) {
    await updateEnrollment(enrollment.id, { status: "failed", next_run_at: null });
    return { outcome: "failed", emails: 0 };
  }

  const steps = automation.steps;
  const context = enrollment.context;
  let i = enrollment.current_step;
  let emails = 0;

  while (i < steps.length) {
    const step = steps[i];
    try {
      if (step.type === "email") {
        const subject = renderTemplate(step.subject, context);
        const body = renderTemplate(step.body, context);
        const email = String(context.email ?? enrollment.customer_email ?? "");
        if (!email) {
          await log(i, step, "Skipped email — contact has no address", { error: "no_email" });
        } else {
          const result = await sendEmail({
            toEmail: email,
            toName: String(context.name ?? enrollment.customer_name),
            subject,
            html: body.replace(/\n/g, "<br>"),
            fromName: step.from_name ?? null,
          });
          emails += 1;
          await log(i, step, `${result.demo ? "Demo email" : "Email"} sent: "${subject}"`, {
            message_id: result.messageId,
          });
          // Record on the contact's email history + timeline.
          await recordEmail({
            customer_id: enrollment.customer_id,
            provider_id: result.messageId,
            subject,
            body,
            status: "sent",
          });
          await recordActivity({
            customer_id: enrollment.customer_id,
            type: "email_sent",
            payload: { subject, automation: automation.name },
          });
        }
        i += 1;
      } else if (step.type === "tag") {
        if (step.action === "add") {
          await addTagToCustomers(step.tag_id, [enrollment.customer_id]);
          await log(i, step, "Tag added");
        } else {
          await setCustomerTag(enrollment.customer_id, step.tag_id, false);
          await log(i, step, "Tag removed");
        }
        i += 1;
      } else {
        // wait — schedule the next tick and stop.
        const nextRun = new Date(Date.now() + step.minutes * 60 * 1000).toISOString();
        await log(i, step, `Waiting ${step.minutes} min`);
        await updateEnrollment(enrollment.id, {
          current_step: i + 1,
          next_run_at: nextRun,
          status: "active",
        });
        return { outcome: "waiting", emails };
      }
    } catch (e) {
      await log(i, step, "Step failed", {
        error: e instanceof Error ? e.message : "unknown_error",
      });
      await updateEnrollment(enrollment.id, {
        status: "failed",
        next_run_at: null,
        current_step: i,
      });
      return { outcome: "failed", emails };
    }
  }

  // Ran off the end — completed.
  await updateEnrollment(enrollment.id, {
    status: "completed",
    next_run_at: null,
    current_step: steps.length,
  });
  return { outcome: "completed", emails };
}

/** Claim and advance all currently-due enrollments. */
export async function runDueEnrollments(
  nowISO: string = new Date().toISOString(),
  limit = 100,
): Promise<TickSummary> {
  const due = await claimDueEnrollments(nowISO, limit);
  const summary: TickSummary = {
    claimed: due.length,
    advanced: 0,
    completed: 0,
    failed: 0,
    emailsSent: 0,
  };
  for (const enrollment of due) {
    const { outcome, emails } = await advanceEnrollment(enrollment);
    summary.emailsSent += emails;
    if (outcome === "completed") summary.completed += 1;
    else if (outcome === "failed") summary.failed += 1;
    else summary.advanced += 1;
  }
  return summary;
}
