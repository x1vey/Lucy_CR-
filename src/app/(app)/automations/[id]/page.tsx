import { notFound } from "next/navigation";
import Box from "@mui/material/Box";
import {
  getAutomation,
  listCustomers,
  listEnrollments,
  listStepRuns,
} from "@/lib/db";
import EnrollmentsClient, { type EnrollmentRow } from "./EnrollmentsClient";

export const dynamic = "force-dynamic";

export default async function AutomationEnrollmentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const automation = await getAutomation(id);
  if (!automation) notFound();

  const [enrollments, customers] = await Promise.all([
    listEnrollments({ automationId: id }),
    listCustomers(),
  ]);

  const rows: EnrollmentRow[] = await Promise.all(
    enrollments.map(async (e) => {
      const runs = await listStepRuns(e.id);
      return {
        id: e.id,
        customer_name: e.customer_name,
        customer_email: e.customer_email,
        status: e.status,
        current_step: e.current_step,
        step_count: automation.steps.length,
        next_run_at: e.next_run_at,
        history: runs.map((r) => ({
          at: r.ran_at,
          detail: r.detail,
          error: r.error,
        })),
      };
    }),
  );

  // Contacts not already actively enrolled (candidates for manual enroll).
  const activeIds = new Set(
    enrollments.filter((e) => e.status === "active").map((e) => e.customer_id),
  );
  const candidates = customers
    .filter((c) => !activeIds.has(c.id))
    .map((c) => ({ id: c.id, name: c.name, email: c.email }));

  return (
    <Box>
      <EnrollmentsClient
        automationId={id}
        automationName={automation.name}
        stepCount={automation.steps.length}
        rows={rows}
        candidates={candidates}
      />
    </Box>
  );
}
