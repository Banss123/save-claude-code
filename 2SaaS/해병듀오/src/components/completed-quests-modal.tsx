/**
 * CompletedQuestsModal — 완료된 퀘스트 전체보기 (사용자 요구)
 * 날짜 필터: 오늘 / 이번주 / 지난 한달
 *
 * 데이터 소스: quest_completions + quest + store join
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, X, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { reopenQuest as reopenQuestAction } from "@/lib/actions/quest";
import { Button } from "@/components/ui/button";
import { stepLabel } from "@/components/status-badge";
import { cn } from "@/lib/utils";

type CompletionDetail = {
  id: number;
  completed_at: string;
  note: string | null;
  quest: {
    id: string;
    title: string;
    process_step: string | null;
    status: string;
    store: { id: string; name: string } | null;
  } | null;
  completed_by_profile: { id: string; name: string } | null;
};

const FILTERS = [
  { key: "today", label: "오늘" },
  { key: "week", label: "이번주" },
  { key: "lastMonth", label: "지난 한달" },
  { key: "all", label: "전체" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

export function CompletedQuestsModal({
  onClose,
  onChanged,
}: {
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [filter, setFilter] = useState<FilterKey>("today");
  const [items, setItems] = useState<CompletionDetail[] | null>(null);
  const [reopeningId, setReopeningId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    setItems(null);

    // 필터별 from_at 계산 (all = 제한 없음)
    const now = new Date();
    let fromAt: Date | null = null;
    if (filter === "today") {
      fromAt = new Date(now);
      fromAt.setHours(0, 0, 0, 0);
    } else if (filter === "week") {
      fromAt = new Date(now);
      const day = fromAt.getDay() || 7; // 일=0 → 7
      fromAt.setDate(fromAt.getDate() - (day - 1));
      fromAt.setHours(0, 0, 0, 0);
    } else if (filter === "lastMonth") {
      fromAt = new Date(now);
      fromAt.setDate(fromAt.getDate() - 30);
    }
    // filter === "all" → fromAt = null (전체)

    let query = supabase
      .from("quest_completions")
      .select(
        "id, completed_at, note, quest:quests(id, title, process_step, status, store:stores(id, name)), completed_by_profile:profiles!quest_completions_completed_by_fkey(id, name)",
      )
      .order("completed_at", { ascending: false })
      .limit(filter === "all" ? 500 : 200);

    if (fromAt) {
      query = query.gte("completed_at", fromAt.toISOString());
    }

    query.then(({ data, error }) => {
      if (error) {
        console.error("[CompletedQuestsModal] error", error);
        setItems([]);
        return;
      }
      setItems(
        ((data ?? []) as unknown as CompletionDetail[]).filter(
          (item) => item.quest?.status === "completed",
        ),
      );
    });
  }, [filter]);

  async function reopen(c: CompletionDetail) {
    if (!c.quest?.id) return;
    const reason = window.prompt(
      `[되돌리기] 사유를 입력하세요\n${c.quest.title}`,
      "",
    );
    if (reason === null) return;
    setReopeningId(c.quest.id);
    const result = await reopenQuestAction(c.quest.id, reason);
    setReopeningId(null);
    if (!result.ok) {
      alert("되돌리기 실패: " + result.error);
      return;
    }
    setItems((prev) => prev?.filter((item) => item.quest?.id !== c.quest?.id) ?? prev);
    onChanged?.();
  }

  // 일자별 그룹화
  const grouped = useMemo(() => {
    if (!items) return [];
    const map = new Map<string, CompletionDetail[]>();
    items.forEach((c) => {
      const day = c.completed_at.slice(0, 10);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(c);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [items]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <header className="flex items-center justify-between border-b bg-gradient-to-r from-card to-emerald-50/50 px-5 py-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-emerald-600" />
            <h2 className="text-base font-semibold">완료된 퀘스트</h2>
            {items && (
              <span className="text-xs text-muted-foreground">
                {items.length}건
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="닫기"
          >
            <X className="size-4" />
          </button>
        </header>

        {/* 필터 */}
        <div className="border-b px-5 py-2.5">
          <div className="inline-flex items-center gap-1 rounded-md bg-muted/60 p-0.5 text-xs">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "rounded px-2.5 py-1 transition-colors",
                  filter === f.key
                    ? "bg-background font-semibold shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {items == null ? (
            <div className="flex flex-col items-center gap-2 p-8 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              <span className="text-xs">불러오는 중…</span>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-12 text-center">
              <CheckCircle2 className="size-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                해당 기간 완료 기록이 없습니다.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {grouped.map(([day, list]) => (
                <div key={day}>
                  <h3 className="sticky top-0 -mx-5 border-b border-muted bg-card px-5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {formatDay(day)} · {list.length}건
                  </h3>
                  <ul className="mt-2 space-y-1.5">
                    {list.map((c) => (
                      <li
                        key={c.id}
                        className="flex items-start gap-2 rounded-md border bg-card p-2.5"
                      >
                        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">
                            {c.quest?.title ?? "(제목 없음)"}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                            {c.quest?.store?.name && (
                              <span>{c.quest.store.name}</span>
                            )}
                            {c.quest?.process_step && (
                              <>
                                <span>·</span>
                                <span>{stepLabel(c.quest.process_step)}</span>
                              </>
                            )}
                            {c.completed_by_profile?.name && (
                              <>
                                <span>·</span>
                                <span>{c.completed_by_profile.name}</span>
                              </>
                            )}
                            <span>·</span>
                            <span className="font-mono">
                              {c.completed_at.slice(11, 16)}
                            </span>
                          </div>
                          {c.note && (
                            <p className="mt-1 rounded bg-muted/40 px-2 py-1 text-xs text-foreground">
                              {c.note}
                            </p>
                          )}
                        </div>
                        {c.quest?.id && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 shrink-0 px-2 text-[11px]"
                            onClick={() => reopen(c)}
                            disabled={reopeningId === c.quest?.id}
                          >
                            {reopeningId === c.quest.id && (
                              <Loader2 className="size-3 animate-spin" />
                            )}
                            되돌리기
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDay(day: string): string {
  const d = new Date(day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor(
    (today.getTime() - d.getTime()) / 86400000,
  );
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  const wd = days[d.getDay()];
  if (diffDays === 0) return `오늘 (${day} ${wd})`;
  if (diffDays === 1) return `어제 (${day} ${wd})`;
  return `${day} (${wd})`;
}
