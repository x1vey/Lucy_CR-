import Box from "@mui/material/Box";
import {
  listAutomations,
  listEnrollments,
  listForms,
  listTags,
} from "@/lib/db";
import { isLeadConnectorConfigured } from "@/lib/env";
import AutomationsClient, { type AutomationRow } from "./AutomationsClient";

export const dynamic = "force-dynamic";

export default async function AutomationsPage() {
  const [automations, forms, tags, enrollments] = await Promise.all([
    listAutomations(),
    listForms(),
    listTags(),
    listEnrollments(),
  ]);

  const activeByAuto = new Map<string, number>();
  for (const e of enrollments) {
    if (e.status === "active") {
      activeByAuto.set(e.automation_id, (activeByAuto.get(e.automation_id) ?? 0) + 1);
    }
  }

  const rows: AutomationRow[] = automations.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    trigger: a.trigger,
    steps: a.steps,
    active: a.active,
    stepCount: a.steps.length,
    emailCount: a.steps.filter((s) => s.type === "email").length,
    activeEnrollments: activeByAuto.get(a.id) ?? 0,
  }));

  return (
    <Box>
      <AutomationsClient
        rows={rows}
        forms={forms.map((f) => ({ id: f.id, name: f.name }))}
        tags={tags.map((t) => ({ id: t.id, name: t.name, color: t.color }))}
        leadConnectorLive={isLeadConnectorConfigured()}
      />
    </Box>
  );
}
