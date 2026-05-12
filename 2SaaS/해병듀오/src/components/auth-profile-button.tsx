"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";

export function AuthProfileButton() {
  const { profile, loading } = useCurrentProfile();
  const initial = profile?.name?.slice(0, 1) ?? "?";

  return (
    <Link
      href="/app/settings"
      className="flex h-8 items-center gap-1.5 rounded-full bg-primary/10 px-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 sm:gap-2 sm:pl-2 sm:pr-3"
      aria-label="내 정보"
      title={profile?.email ?? "내 정보"}
    >
      <span className="flex size-6 items-center justify-center rounded-full bg-background/80">
        {loading ? <Loader2 className="size-3 animate-spin" /> : initial}
      </span>
      <span className="hidden max-w-16 truncate sm:inline">{profile?.name ?? "계정"}</span>
    </Link>
  );
}
