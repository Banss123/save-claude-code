import Link from "next/link";
import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signInWithPassword } from "@/lib/actions/auth";

type LoginPageProps = {
  searchParams?: Promise<{
    error?: string | string[];
    next?: string | string[];
    signedOut?: string | string[];
  }>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function safeNext(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/app";
  return value.startsWith("/app") ? value : "/app";
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const error = firstParam(params?.error);
  const signedOut = firstParam(params?.signedOut);
  const next = safeNext(firstParam(params?.next));

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-muted/30 p-6">
      <section className="grid w-full max-w-4xl overflow-hidden rounded-xl border bg-card shadow-sm lg:grid-cols-[1fr_420px]">
        <div className="flex flex-col justify-between border-b bg-sidebar p-8 text-sidebar-foreground lg:border-b-0 lg:border-r">
          <div>
            <Link href="/" className="inline-flex items-baseline gap-1.5">
              <span className="text-lg font-bold text-brand">BizHigh</span>
              <span className="text-sm font-medium text-sidebar-foreground/70">
                SalesOps
              </span>
            </Link>
            <div className="mt-1 text-sm font-bold text-red-600">해병듀오</div>
          </div>

          <div className="my-16 max-w-sm">
            <div className="mb-4 flex size-10 items-center justify-center rounded-md bg-sidebar-accent">
              <ShieldCheck className="size-5 text-primary" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              내부 운영 도구 로그인
            </h1>
            <p className="mt-3 text-sm leading-6 text-sidebar-foreground/65">
              김민재, 김재원, 반민성 계정으로 접속하는 Email+PW 인증 화면입니다.
              현재 `/app` 화면은 로그인한 내부 계정만 접근할 수 있습니다.
            </p>
          </div>

          <p className="text-xs text-sidebar-foreground/50">
            테스트 계정으로 로그인하면 요청한 화면으로 자동 이동합니다.
          </p>
        </div>

        <div className="p-8">
          <div className="mb-6">
            <div className="mb-3 flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              <LockKeyhole className="size-4" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight">로그인</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Supabase Auth 계정이 만들어진 뒤 바로 사용할 수 있습니다.
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </div>
          )}
          {signedOut && (
            <div className="mb-4 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-700">
              로그아웃되었습니다.
            </div>
          )}

          <form action={signInWithPassword} className="space-y-4">
            <input type="hidden" name="next" value={next} />
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">이메일</span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                className="rounded-md border bg-background px-3 py-2 outline-none focus:border-foreground/30"
                placeholder="name@bizhigh.dev"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">비밀번호</span>
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="rounded-md border bg-background px-3 py-2 outline-none focus:border-foreground/30"
                placeholder="••••••••"
              />
            </label>
            <Button type="submit" className="w-full">
              로그인
              <ArrowRight className="size-4" />
            </Button>
          </form>

          <div className="mt-5 rounded-md border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
            계정은 Supabase Auth에 생성된 이메일과 비밀번호를 사용합니다.
            로그인 후 세션은 브라우저에 유지됩니다.
          </div>
        </div>
      </section>
    </main>
  );
}
