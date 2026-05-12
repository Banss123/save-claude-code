"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function safeNext(value: FormDataEntryValue | string | null): string {
  const next = typeof value === "string" ? value : "";
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/app";
  return next.startsWith("/app") ? next : "/app";
}

function loginRedirectWithError(message: string, next: string): never {
  const params = new URLSearchParams({
    error: message,
    next,
  });
  redirect(`/login?${params.toString()}`);
}

export async function signInWithPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  if (!email || !password) {
    loginRedirectWithError("이메일과 비밀번호를 입력해주세요.", next);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    loginRedirectWithError("로그인 정보가 올바르지 않습니다.", next);
  }

  revalidatePath("/", "layout");
  redirect(next);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  revalidatePath("/", "layout");
  redirect("/login?signedOut=1");
}
