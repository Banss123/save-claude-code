"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Circle, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { completeRecurringCheck as completeRecurringCheckAction } from "@/lib/actions/metrics";
import { cn } from "@/lib/utils";

type Template = {
  id: string;
  category: "store" | "review";
  name: string;
  frequency: "weekly" | "biweekly" | "monthly" | "on_demand";
};

type CheckRow = {
  id: string;
  store_id: string;
  template_id: string;
  scheduled_for: string;
  performed_at: string | null;
  store: { name: string; status: string } | null;
  template: { name: string; category: "store" | "review"; frequency: string } | null;
};

const freqLabel: Record<Template["frequency"], string> = {
  weekly: "매주",
  biweekly: "격주",
  monthly: "매월",
  on_demand: "필요시",
};

const categoryLabel = { store: "매장 체크리스트", review: "리뷰 체크리스트" } as const;

export default function ChecksPage() {
  const supabase = useMemo(() => createClient(), []);
  const [checks, setChecks] = useState<CheckRow[] | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [tab, setTab] = useState<"due" | "all" | "store" | "review">("due");

  const reload = useMemo(
    () => async () => {
      const { data } = await supabase
        .from("recurring_checks")
        .select(
          "id, store_id, template_id, scheduled_for, performed_at, store:stores(name, status), template:check_templates(name, category, frequency)",
        )
        .order("scheduled_for");
      setChecks((data ?? []) as unknown as CheckRow[]);
    },
    [supabase],
  );

  useEffect(() => {
    reload();
  }, [reload]);

  const today = new Date().toISOString().slice(0, 10);

  const performCheck = async (checkId: string) => {
    setSubmitting(checkId);
    const result = await completeRecurringCheckAction(checkId);
    setSubmitting(null);
    if (!result.ok) {
      alert("저장 실패: " + result.error);
      return;
    }
    reload();
  };

  const filtered = useMemo(() => {
    if (!checks) return [];
    return checks.filter((c) => {
      if (tab === "due") return !c.performed_at && c.scheduled_for <= today;
      if (tab === "store") return c.template?.category === "store";
      if (tab === "review") return c.template?.category === "review";
      return true;
    });
  }, [checks, tab, today]);

  const dueCount = checks?.filter((c) => !c.performed_at && c.scheduled_for <= today).length ?? 0;
  const totalUnperformed = checks?.filter((c) => !c.performed_at).length ?? 0;

  return (
    <main className="flex flex-1 flex-col gap-5 overflow-y-auto p-6 lg:p-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">정기 체크</h1>
        <p className="text-sm text-muted-foreground">
          매장·리뷰 체크리스트 통합 관리 ·
          <span className={cn("ml-1", dueCount > 0 && "font-semibold text-rose-600")}>
            오늘까지 마감 {dueCount}건
          </span>
          {" · "}
          미수행 {totalUnperformed}건
        </p>
      </header>

      {/* 탭 */}
      <div className="flex gap-1 border-b">
        {[
          { key: "due", label: `이번 주 마감 (${dueCount})` },
          { key: "store", label: "매장 체크리스트" },
          { key: "review", label: "리뷰 체크리스트" },
          { key: "all", label: "전체" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as typeof tab)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm",
              tab === t.key
                ? "border-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {checks == null ? (
        <div className="flex justify-center p-12">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-12 text-center text-sm text-muted-foreground">
          {tab === "due" ? "오늘까지 마감된 체크가 없습니다 — 다 끝냈네요!" : "조건에 맞는 항목이 없습니다"}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">상태</th>
                <th className="px-4 py-3 text-left font-medium">매장</th>
                <th className="px-4 py-3 text-left font-medium">카테고리</th>
                <th className="px-4 py-3 text-left font-medium">체크 항목</th>
                <th className="px-4 py-3 text-left font-medium">주기</th>
                <th className="px-4 py-3 text-left font-medium">예정일</th>
                <th className="px-4 py-3 text-left font-medium">수행일</th>
                <th className="px-4 py-3 text-right font-medium">액션</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const overdue = !c.performed_at && c.scheduled_for < today;
                const dueToday = !c.performed_at && c.scheduled_for === today;
                return (
                  <tr key={c.id} className="border-t hover:bg-muted/20">
                    <td className="px-4 py-3">
                      {c.performed_at ? (
                        <CheckCircle2 className="size-4 text-emerald-500" />
                      ) : (
                        <Circle
                          className={cn(
                            "size-4",
                            overdue ? "text-rose-500" : dueToday ? "text-amber-500" : "text-muted-foreground",
                          )}
                        />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/app/stores/${c.store_id}`}
                        className="font-medium hover:underline"
                      >
                        {c.store?.name ?? "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {c.template ? categoryLabel[c.template.category] : "—"}
                    </td>
                    <td className="px-4 py-3">{c.template?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {c.template ? freqLabel[c.template.frequency as Template["frequency"]] : "—"}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-xs",
                        overdue && "font-semibold text-rose-600",
                        dueToday && "font-semibold text-amber-700",
                      )}
                    >
                      {c.scheduled_for}
                      {overdue && (
                        <span className="ml-1 inline-flex items-center gap-0.5 text-[10px]">
                          <AlertCircle className="size-3" />
                          연체
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {c.performed_at ? c.performed_at.slice(0, 10) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {c.performed_at ? (
                        <span className="text-xs text-muted-foreground">완료</span>
                      ) : (
                        <Button
                          size="sm"
                          variant={overdue ? "default" : "outline"}
                          onClick={() => performCheck(c.id)}
                          disabled={submitting === c.id}
                        >
                          {submitting === c.id && <Loader2 className="size-3 animate-spin" />}
                          수행
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
