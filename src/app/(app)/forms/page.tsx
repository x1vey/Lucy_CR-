import Box from "@mui/material/Box";
import { listForms, listSubmissions, listTags } from "@/lib/db";
import { env } from "@/lib/env";
import FormsClient, { type FormRow } from "./FormsClient";

export const dynamic = "force-dynamic";

export default async function FormsPage() {
  const [forms, tags, allSubmissions] = await Promise.all([
    listForms(),
    listTags(),
    listSubmissions(),
  ]);

  // Count submissions per form id in one pass.
  const subsByForm = new Map<string, number>();
  for (const sub of allSubmissions) {
    subsByForm.set(sub.form_id, (subsByForm.get(sub.form_id) ?? 0) + 1);
  }

  const rows: FormRow[] = forms.map((f) => ({
    id: f.id,
    name: f.name,
    slug: f.slug,
    token: f.token,
    fields: f.fields,
    mapping: f.mapping,
    create_customer: f.create_customer,
    active: f.active,
    submissions: subsByForm.get(f.id) ?? 0,
  }));

  return (
    <Box>
      <FormsClient
        rows={rows}
        allTags={tags.map((t) => ({ id: t.id, name: t.name, color: t.color }))}
        appUrl={env.appUrl()}
      />
    </Box>
  );
}
