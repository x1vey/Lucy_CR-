"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getAdminByEmailWithHash, setAdminLastLogin } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { createSession, destroySession } from "@/lib/auth";

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

export type LoginState = { error: string | null };

// useActionState-compatible login. Returns an error message on failure;
// redirects to /dashboard on success.
export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const admin = await getAdminByEmailWithHash(parsed.data.email);
  // Same message whether the email is unknown or the password is wrong, so we
  // don't leak which admin emails exist.
  if (!admin || !verifyPassword(parsed.data.password, admin.password_hash)) {
    return { error: "Incorrect email or password" };
  }

  await createSession(admin.id);
  await setAdminLastLogin(admin.id);
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
