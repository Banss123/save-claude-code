import Link from "next/link";
import { MobileNav, SidebarNav } from "@/components/sidebar-nav";
import { GlobalSearch } from "@/components/global-search";
import { NotificationsBell } from "@/components/notifications-bell";
import { AuthProfileButton } from "@/components/auth-profile-button";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 bg-muted/30">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
        <div className="border-b px-5 py-5">
          <Link href="/app" className="block tracking-tight">
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-bold text-brand">BizHigh</span>
              <span className="text-sm font-medium text-sidebar-foreground/70">
                SalesOps
              </span>
            </div>
            <div className="mt-0.5 text-sm font-bold text-red-600">
              해병듀오
            </div>
          </Link>
          <p className="mt-1 text-xs text-sidebar-foreground/55">
            비즈하이 영업·관리
          </p>
        </div>
        <div className="flex-1 px-3 py-4">
          <SidebarNav />
        </div>
        <div className="border-t px-5 py-4 text-xs text-sidebar-foreground/60">
          © 비즈하이 · 김민재 · 김재원 · 반민성
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden pb-16 md:pb-0">
        <header className="sticky top-0 z-40 flex items-center justify-between gap-2 border-b bg-card/95 px-3 py-2 backdrop-blur md:px-6">
          <GlobalSearch />
          <div className="flex shrink-0 items-center gap-1.5 md:gap-2">
            <NotificationsBell />
            <AuthProfileButton />
          </div>
        </header>
        {children}
      </div>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.35rem)] pt-1.5 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
        <MobileNav />
      </div>
    </div>
  );
}
