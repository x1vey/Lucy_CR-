import AppShell from "@/components/AppShell";
import { activeBackend } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

// All authenticated CRM screens render inside the shell (sidebar + top bar).
// requireAdmin() enforces auth for every route in this group (and re-validates
// the session cookie the middleware only presence-checked). Public form pages
// live outside this group so they stay chrome-free and unauthenticated.
export default async function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdmin();
  return (
    <AppShell
      backend={activeBackend}
      admin={{ name: admin.name, email: admin.email, role: admin.role }}
    >
      {children}
    </AppShell>
  );
}
