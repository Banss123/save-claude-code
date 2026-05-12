"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Loader2, Star, Calendar } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { storeStatusLabel, storeStatusTone, todayStr, type StoreStatus } from "@/lib/mock-data";

type Store = {
  id: string;
  name: string;
  type_code: string;
  status: StoreStatus;
  start_date: string | null;
};

type Quest = {
  id: string;
  store_id: string;
  due_date: string | null;
  process_step: string | null;
  status: "pending" | "blocked" | "completed" | "cancelled";
  priority: "urgent" | "normal" | "low";
  title: string;
};

type CalEvent = {
  id: string;
  store_id: string | null;
  start_at: string;
  event_type: "meeting" | "visit" | "report_due" | "milestone" | "other";
  title: string;
};

type ActivityRow = {
  store_id: string | null;
  category: "work" | "communication" | "system";
  occurred_at: string;
};

// 활동 강도(0~4+) → tailwind class
function workIntensity(n: number): string {
  if (n === 0) return "";
  if (n === 1) return "bg-emerald-100";
  if (n === 2) return "bg-emerald-200";
  if (n === 3) return "bg-emerald-300";
  return "bg-emerald-500";
}
function commIntensity(n: number): string {
  if (n === 0) return "";
  if (n === 1) return "bg-violet-100";
  if (n === 2) return "bg-violet-200";
  if (n === 3) return "bg-violet-300";
  return "bg-violet-500";
}

const statusOrder: Record<StoreStatus, number> = {
  active: 1,
  ready_to_start: 2,
  contract_signed: 3,
  contract_pending: 4,
  paused: 5,
  churned: 6,
  archived: 7,
};


function pad(n: number) {
  return String(n).padStart(2, "0");
}

function isoDate(year: number, month: number, day: number) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

export function GanttChart() {
  const supabase = useMemo(() => createClient(), []);
  const today = useMemo(() => new Date(todayStr), []);
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [stores, setStores] = useState<Store[] | null>(null);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [activities, setActivities] = useState<ActivityRow[]>([]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const firstDay = isoDate(year, month, 1);
  const lastDay = isoDate(year, month, daysInMonth);

  useEffect(() => {
    setStores(null);
    Promise.all([
      supabase
        .from("stores")
        .select("id, name, type_code, status, start_date")
        .is("archived_at", null),
      supabase
        .from("quests")
        .select("id, store_id, due_date, process_step, status, priority, title")
        .gte("due_date", firstDay)
        .lte("due_date", lastDay)
        .neq("status", "completed"),
      supabase
        .from("calendar_events")
        .select("id, store_id, start_at, event_type, title")
        .gte("start_at", `${firstDay}T00:00:00`)
        .lte("start_at", `${lastDay}T23:59:59`),
      supabase
        .from("activity_log")
        .select("store_id, category, occurred_at")
        .gte("occurred_at", `${firstDay}T00:00:00`)
        .lte("occurred_at", `${lastDay}T23:59:59`)
        .in("category", ["work", "communication"]),
    ]).then(([s, q, e, a]) => {
      setStores((s.data ?? []) as Store[]);
      setQuests((q.data ?? []) as Quest[]);
      setEvents((e.data ?? []) as CalEvent[]);
      setActivities((a.data ?? []) as ActivityRow[]);
    });
  }, [supabase, firstDay, lastDay]);

  const sortedStores = useMemo(() => {
    if (!stores) return [];
    return [...stores].sort(
      (a, b) => statusOrder[a.status] - statusOrder[b.status] || a.name.localeCompare(b.name),
    );
  }, [stores]);

  // 매장 × 일자 매트릭스 인덱스 (퀘스트/이벤트/시작일 + 활동 카운트)
  type Cell = {
    quests: Quest[];
    events: CalEvent[];
    isStartDay: boolean;
    workCount: number;
    commCount: number;
  };
  const matrix = useMemo(() => {
    const m = new Map<string, Cell>();
    for (const s of sortedStores) {
      for (const d of days) {
        const k = `${s.id}|${isoDate(year, month, d)}`;
        m.set(k, {
          quests: [],
          events: [],
          isStartDay: s.start_date === isoDate(year, month, d),
          workCount: 0,
          commCount: 0,
        });
      }
    }
    for (const q of quests) {
      if (!q.due_date) continue;
      const k = `${q.store_id}|${q.due_date}`;
      const cell = m.get(k);
      if (cell) cell.quests.push(q);
    }
    for (const e of events) {
      if (!e.store_id) continue;
      const day = e.start_at.slice(0, 10);
      const k = `${e.store_id}|${day}`;
      const cell = m.get(k);
      if (cell) cell.events.push(e);
    }
    for (const a of activities) {
      if (!a.store_id) continue;
      const day = a.occurred_at.slice(0, 10);
      const k = `${a.store_id}|${day}`;
      const cell = m.get(k);
      if (!cell) continue;
      if (a.category === "work") cell.workCount++;
      else if (a.category === "communication") cell.commCount++;
    }
    return m;
  }, [sortedStores, days, year, month, quests, events, activities]);

  const todayDayNum = useMemo(() => {
    if (today.getFullYear() === year && today.getMonth() === month) return today.getDate();
    return null;
  }, [today, year, month]);

  const monthLabel = `${year}년 ${month + 1}월`;
  const weekendIdx = (day: number) => new Date(year, month, day).getDay();
  const isToday = (day: number) => day === todayDayNum;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <div>
          <h3 className="text-base font-semibold">매장 진행 (간트)</h3>
          <p className="text-xs text-muted-foreground">한 달치 매장×일자 매트릭스 · 메인 뷰</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="text-sm font-medium tabular-nums">{monthLabel}</span>
          <button
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
          >
            <ChevronRight className="size-4" />
          </button>
          <button
            onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
            className="ml-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
          >
            오늘
          </button>
        </div>
      </div>

      {stores == null ? (
        <div className="flex justify-center p-12">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full border-separate border-spacing-0 text-xs">
            <thead className="sticky top-0 z-10 bg-muted/50">
              <tr>
                <th className="sticky left-0 z-20 w-44 border-r bg-muted/50 px-3 py-2 text-left">
                  매장
                </th>
                {days.map((d) => {
                  const wd = weekendIdx(d);
                  return (
                    <th
                      key={d}
                      className={cn(
                        "min-w-[28px] border-r px-1 py-2 text-center font-normal tabular-nums",
                        wd === 0 && "text-rose-500",
                        wd === 6 && "text-blue-500",
                        isToday(d) && "bg-amber-100 font-semibold text-foreground",
                      )}
                    >
                      {d}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sortedStores.length === 0 ? (
                <tr>
                  <td
                    colSpan={daysInMonth + 1}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    매장 없음
                  </td>
                </tr>
              ) : (
                sortedStores.map((s) => (
                  <tr key={s.id} className="hover:bg-muted/20">
                    <td className="sticky left-0 z-10 w-44 border-r border-t bg-card px-3 py-2">
                      <Link
                        href={`/app/stores/${s.id}`}
                        className="block"
                      >
                        <div className="truncate text-sm font-medium hover:text-foreground/70">
                          {s.name}
                        </div>
                        <span
                          className={cn(
                            "mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px]",
                            storeStatusTone[s.status],
                          )}
                        >
                          {storeStatusLabel[s.status]}
                        </span>
                      </Link>
                    </td>
                    {days.map((d) => {
                      const k = `${s.id}|${isoDate(year, month, d)}`;
                      const cell = matrix.get(k);
                      const qs = cell?.quests ?? [];
                      const evs = cell?.events ?? [];
                      const work = cell?.workCount ?? 0;
                      const comm = cell?.commCount ?? 0;
                      const blocked = qs.some((q) => q.status === "blocked");
                      const tooltip = [
                        work > 0 ? `내 작업 ${work}건` : null,
                        comm > 0 ? `업주 소통 ${comm}건` : null,
                        ...qs.map((q) => `[${q.process_step ?? "?"}] ${q.title}`),
                        ...evs.map((e) => `📅 ${e.title}`),
                        cell?.isStartDay ? "⭐ 시작일" : null,
                      ]
                        .filter(Boolean)
                        .join("\n");
                      return (
                        <td
                          key={d}
                          title={tooltip || undefined}
                          className={cn(
                            "min-w-[24px] border-r border-t p-0 align-top",
                            isToday(d) && "ring-1 ring-amber-400",
                          )}
                        >
                          <div className="flex flex-col">
                            {/* 위 칸: 내 작업 */}
                            <div
                              className={cn(
                                "flex h-3 items-center justify-center text-[8px] leading-none",
                                workIntensity(work),
                              )}
                            >
                              {cell?.isStartDay && (
                                <Star className="size-2 fill-amber-500 text-amber-500" />
                              )}
                            </div>
                            {/* 아래 칸: 업주 소통 */}
                            <div
                              className={cn(
                                "flex h-3 items-center justify-center text-[8px] leading-none border-t border-zinc-100",
                                commIntensity(comm),
                              )}
                            >
                              {(qs.length > 0 || evs.length > 0) && (
                                <span
                                  className={cn(
                                    "size-1.5 rounded-full",
                                    blocked
                                      ? "bg-amber-500"
                                      : qs.length > 0
                                        ? "bg-rose-500"
                                        : "bg-violet-500",
                                  )}
                                />
                              )}
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 범례: 위(내 작업) + 아래(업주 소통) 2단 셀 + 활동 강도 */}
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="flex flex-col">
            <span className="block h-2 w-3 bg-emerald-300" />
            <span className="block h-2 w-3 bg-violet-300" />
          </span>
          위=내 작업 / 아래=업주 소통
        </span>
        <span className="flex items-center gap-1">
          강도:
          <span className="inline-flex">
            {[0, 1, 2, 3, 4].map((n) => (
              <span key={n} className={cn("size-2.5 border-r border-white", workIntensity(n))} />
            ))}
          </span>
        </span>
        <span className="flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-rose-500" /> 퀘스트
        </span>
        <span className="flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-amber-500" /> 차단
        </span>
        <span className="flex items-center gap-1">
          <Calendar className="size-2.5 text-violet-500" /> 이벤트
        </span>
        <span className="flex items-center gap-1">
          <Star className="size-2.5 fill-amber-500 text-amber-500" /> 시작일
        </span>
      </div>
    </div>
  );
}
