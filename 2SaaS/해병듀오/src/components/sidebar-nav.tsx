"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardPlus,
  Store,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: LucideIcon };

const items: Item[] = [
  { href: "/app", label: "대시보드", icon: LayoutDashboard },
  { href: "/app/stores/new", label: "매장등록", icon: ClipboardPlus },
  { href: "/app/stores", label: "매장관리", icon: Store },
  { href: "/app/leads", label: "DB 관리", icon: Users },
  { href: "/app/settings", label: "내 정보", icon: Settings },
];

// 비활성 (사용자 결정 2026-04-26: 본사 자료 받아 카톡 직송하면 SaaS 단계가 오히려 부담)
// 페이지·DB는 보존 — 추후 카톡 비즈 메시지 API·자동화 도입 시점에 부활 검토
// - { href: "/app/checks", label: "정기 체크", icon: ClipboardCheck }
// - { href: "/app/reports", label: "보고서", icon: FileText }

export function SidebarNav() {
  return <NavItems variant="sidebar" />;
}

export function MobileNav() {
  return <NavItems variant="mobile" />;
}

function NavItems({ variant }: { variant: "sidebar" | "mobile" }) {
  const pathname = usePathname();

  // 가장 긴 prefix 매칭만 active 처리.
  // /app/stores/new에서 /app/stores도 같이 활성화되는 버그 방지.
  const activeHref = (() => {
    const matches = items
      .filter((item) => {
        if (item.href === "/app") return pathname === "/app";
        return pathname === item.href || pathname.startsWith(item.href + "/");
      })
      .sort((a, b) => b.href.length - a.href.length); // 가장 긴 prefix 우선
    return matches[0]?.href ?? null;
  })();

  if (variant === "mobile") {
    return (
      <nav className="grid grid-cols-5 gap-1 text-[11px]">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === activeHref;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex min-w-0 flex-col items-center gap-1 rounded-md px-1 py-1.5 transition-colors",
                active
                  ? "bg-primary/10 text-primary font-semibold"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="w-full truncate text-center">{label}</span>
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="flex flex-col gap-0.5 text-sm">
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === activeHref;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "relative flex items-center gap-2.5 rounded-md px-3 py-2 transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                : "text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
            )}
          >
            {/* 활성 인디케이터 — Sky 4px 라인 (해병 액션 색) */}
            {active && (
              <span
                aria-hidden
                className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r bg-primary"
              />
            )}
            <Icon className={cn("size-4 shrink-0", active && "text-primary")} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
