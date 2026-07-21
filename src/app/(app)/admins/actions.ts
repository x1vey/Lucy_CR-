"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  archiveAdmin,
  createAdmin,
  getAdmin,
  liveAdminCount,
  updateAdmin,
} from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { getCurrentAdmin, requireAdmin } from "@/lib/auth";

// All admin management requires being logged in. (Everyone who can log in is an
// admin/owner in this simple model, so any admin can manage the team.)

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["owner", "admin"]).default("admin"),
});

export async function createAdminAction(input: {
  name: string;
  email: string;
  password: string;
  role: "owner" | "admin";
}) {
  await requireAdmin();
  const data = createSchema.parse(input);
  const a = await createAdmin({
    name: data.name,
    email: data.email,
    password_hash: hashPassword(data.password),
    role: data.role,
  });
  revalidatePath("/admins");
  return { id: a.id };
}

const updateSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Enter a valid email"),
  role: z.enum(["owner", "admin"]),
  // Optional — only set when the admin is changing the password.
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .optional()
    .or(z.literal("")),
});

export async function updateAdminAction(
  id: string,
  input: {
    name: string;
    email: string;
    role: "owner" | "admin";
    password?: string;
  },
) {
  await requireAdmin();
  const data = updateSchema.parse(input);
  await updateAdmin(id, {
    name: data.name,
    email: data.email,
    role: data.role,
    ...(data.password ? { password_hash: hashPassword(data.password) } : {}),
  });
  revalidatePath("/admins");
}

export async function archiveAdminAction(id: string) {
  const me = await requireAdmin();
  // Guards: can't remove yourself, and can't remove the last admin.
  if (me.id === id) {
    throw new Error("You can't remove your own account while signed in.");
  }
  const target = await getAdmin(id);
  if (!target) return;
  if ((await liveAdminCount()) <= 1) {
    throw new Error("You can't remove the last remaining admin.");
  }
  await archiveAdmin(id);
  revalidatePath("/admins");
}

// Exposed so the page can highlight "you".
export async function currentAdminId(): Promise<string | null> {
  return (await getCurrentAdmin())?.id ?? null;
}
