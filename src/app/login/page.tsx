import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Already logged in? Skip straight to the app.
  if (await getCurrentAdmin()) redirect("/dashboard");
  // Only advertise the demo credentials when running on the demo store.
  return <LoginForm showDemoHint={!isSupabaseConfigured()} />;
}
