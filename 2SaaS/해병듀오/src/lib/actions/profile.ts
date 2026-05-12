"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";
import type { ActionResult } from "@/lib/actions/quest";

type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];
type UserRole = Database["public"]["Enums"]["user_role"];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES = new Set<UserRole>(["sales", "marketer", "admin"]);

export async function updateProfile(input: {
  id: string;
  name: string;
  role: UserRole;
  email?: string | null;
  phone?: string | null;
}): Promise<ActionResult> {
  if (!UUID_RE.test(input.id)) {
    return { ok: false, error: "프로필 ID 형식이 올바르지 않습니다." };
  }
  const name = input.name.trim();
  if (!name) return { ok: false, error: "이름을 입력해주세요." };
  if (!ROLES.has(input.role)) {
    return { ok: false, error: "역할이 올바르지 않습니다." };
  }

  const patch: ProfileUpdate = {
    name,
    role: input.role,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
  };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/app");
  revalidatePath("/app/settings");
  return { ok: true };
}
