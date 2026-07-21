import Box from "@mui/material/Box";
import { listAdmins } from "@/lib/db";
import { getCurrentAdmin } from "@/lib/auth";
import AdminsClient, { type AdminRow } from "./AdminsClient";

export const dynamic = "force-dynamic";

export default async function AdminsPage() {
  const [admins, me] = await Promise.all([listAdmins(), getCurrentAdmin()]);

  const rows: AdminRow[] = admins.map((a) => ({
    id: a.id,
    name: a.name,
    email: a.email,
    role: a.role,
    last_login_at: a.last_login_at,
    created_at: a.created_at,
    isYou: a.id === me?.id,
  }));

  return (
    <Box>
      <AdminsClient rows={rows} />
    </Box>
  );
}
