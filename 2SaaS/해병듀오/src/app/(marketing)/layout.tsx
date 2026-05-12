import Link from "next/link";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <Link href="/" className="text-base font-semibold">
          BizHigh SalesOps
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <a href="#features" className="text-muted-foreground hover:text-foreground">
            기능
          </a>
          <a href="#process" className="text-muted-foreground hover:text-foreground">
            프로세스
          </a>
          <a href="#calendar" className="text-muted-foreground hover:text-foreground">
            캘린더
          </a>
          <Link
            href="/app"
            className="rounded-md bg-foreground px-3 py-1.5 text-background hover:opacity-90"
          >
            대시보드 열기 →
          </Link>
        </nav>
      </header>
      {children}
    </div>
  );
}
