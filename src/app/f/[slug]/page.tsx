import { notFound } from "next/navigation";
import { getFormBySlug } from "@/lib/db";
import PublicForm from "./PublicForm";

// Hosted public form. Lives outside the (app) route group so it renders with
// no CRM chrome — this is the page you link to directly OR embed via <iframe>.
export const dynamic = "force-dynamic";

export default async function PublicFormPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const form = await getFormBySlug(slug);
  if (!form) notFound();

  return (
    <PublicForm
      token={form.token}
      name={form.name}
      fields={form.fields}
    />
  );
}
