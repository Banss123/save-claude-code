"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ListChecks,
  Store,
  Loader2,
  Pin,
  PinOff,
  Lock,
  Plus,
  Sparkles,
  ClipboardPaste,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MiniCalendar } from "@/components/mini-calendar";
import { GanttChart } from "@/components/gantt-chart";
import { QuestContextCard } from "@/components/quest-context-card";
import { CompletedQuestsModal } from "@/components/completed-quests-modal";
import {
  PriorityBadge,
  StatusBadge,
  stepLabel,
} from "@/components/status-badge";
import { createClient } from "@/lib/supabase/client";
import {
  completeQuest as completeQuestAction,
  createQuest as createQuestAction,
  toggleQuestPin as toggleQuestPinAction,
} from "@/lib/actions/quest";
import {
  createCalendarEvent as createCalendarEventAction,
  deleteCalendarEvent as deleteCalendarEventAction,
} from "@/lib/actions/calendar";
import {
  approveProposedAction as approveProposedActionAction,
  createProposedActionFromText as createProposedActionFromTextAction,
  dismissProposedAction as dismissProposedActionAction,
} from "@/lib/actions/proposed-action";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";
import { cn } from "@/lib/utils";
import { todayStr, type CalendarEvent } from "@/lib/mock-data";
// (2026-05-05) ActivityHeatmap 폐기 → GanttChart 셀 안에 work/comm 활동 강도로 통합

type Stats = {
  managed_stores: number;
  pending_quests: number;
  due_today: number;
  overdue: number;
  stale_health_check: number;
};

type QuestRow = {
  id: string;
  store_id: string;
  store_name: string;
  type_code: string;
  title: string;
  process_step: string | null;
  status: "pending" | "blocked";
  priority: "urgent" | "normal" | "low";
  is_pinned: boolean;
  due_date: string | null;
  blocked_reason: string | null;
  due_bucket: "overdue" | "today" | "tomorrow" | "later";
  source: "auto" | "manual" | "sheet_missing";
  external_url: string | null;
};

// process_step 한글 매핑 → status-badge.tsx 의 STEP_LABELS / stepLabel / StepBadge 사용

type CompletionRow = {
  id: number;
  completed_at: string;
  quest: { title: string; process_step: string | null; store: { name: string } | null } | null;
};

type CalendarEventRow = {
  id: string;
  title: string;
  event_type: "meeting" | "visit" | "report_due" | "milestone" | "other";
  start_at: string;
  store: { name: string } | null;
  created_by: string | null;
};

type ProposedActionRow = {
  id: string;
  store_id: string | null;
  title: string;
  description: string | null;
  action_type: string;
  priority: "urgent" | "normal" | "low";
  due_date: string | null;
  source: string;
  confidence: number;
  reasoning: string | null;
  raw_input: string | null;
  created_at: string;
  store: { name: string } | null;
};

type ProposedActionDraft = {
  title: string;
  description: string;
  storeId: string;
  priority: ProposedActionRow["priority"];
  dueDate: string;
};

// stepColor / priorityTone / priorityLabel → status-badge 컴포넌트로 통일

const eventTypeToCalendarType: Record<CalendarEventRow["event_type"], CalendarEvent["type"]> = {
  meeting: "meeting",
  visit: "meeting",
  report_due: "report",
  milestone: "milestone",
  other: "milestone",
};

function StatPill({
  icon: Icon,
  label,
  value,
  tone,
  className,
}: {
  icon: typeof Store;
  label: string;
  value: number | string;
  tone: "default" | "warn" | "ok" | "today" | "miss";
  className?: string;
}) {
  // design-system.md §3 의미 색 (rose→red, zinc→slate 정착)
  const toneClass =
    tone === "miss"  ? "text-urgent" :
    tone === "today" ? "text-warning" :
    tone === "warn"  ? "text-urgent" :
    tone === "ok"    ? "text-success" :
    "text-foreground";
  const bgTone =
    tone === "miss"  ? "border-urgent/25 bg-urgent-bg" :
    tone === "today" ? "border-warning/25 bg-warning-bg" :
    tone === "warn"  ? "border-urgent/25 bg-urgent-bg" :
    tone === "ok"    ? "border-success/25 bg-success-bg" :
    "border bg-card";
  return (
    <div className={cn(`flex h-10 min-w-0 items-center gap-2 rounded-md ${bgTone} px-3 text-sm`, className)}>
      <Icon className={`size-4 ${toneClass}`} />
      <span className={cn("min-w-0 flex-1 truncate", tone === "default" ? "text-muted-foreground" : `${toneClass} opacity-80`)}>{label}</span>
      <span className={`shrink-0 font-semibold ${toneClass}`}>{value}</span>
    </div>
  );
}

/**
 * 마감일을 메인 강조 배지로 표시 (사용자 비전: step 라벨 대신 D-day가 첫 줄)
 *  - overdue   → 빨강 "연체 N일"
 *  - today     → 주황 "오늘 마감"
 *  - tomorrow  → 파랑 "내일"
 *  - 1~7일     → 파랑 "D-N"
 *  - 그 외     → 회색 "M월 D일"
 *  - 마감 없음 → 회색 "마감 미정"
 */
function dueDayDisplay(
  due: string | null,
  bucket: QuestRow["due_bucket"],
) {
  if (!due) {
    return <StatusBadge tone="neutral" size="sm">마감 미정</StatusBadge>;
  }
  if (bucket === "overdue") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(due);
    const overdueDays = Math.floor(
      (today.getTime() - dueDate.getTime()) / 86400000,
    );
    return <StatusBadge tone="urgent" size="sm">연체 {overdueDays}일</StatusBadge>;
  }
  if (bucket === "today") {
    return <StatusBadge tone="warning" size="sm">오늘 마감</StatusBadge>;
  }
  if (bucket === "tomorrow") {
    return <StatusBadge tone="info" size="sm">내일</StatusBadge>;
  }
  // 1주 안인지 확인
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(due);
  const diffDays = Math.floor(
    (dueDate.getTime() - today.getTime()) / 86400000,
  );
  if (diffDays > 0 && diffDays <= 7) {
    return <StatusBadge tone="info" size="sm">D-{diffDays}</StatusBadge>;
  }
  // 그 외 = 작은 회색 "M월 D일"
  const [, m, d] = due.split("-");
  return <StatusBadge tone="neutral" size="sm">{Number(m)}월 {Number(d)}일</StatusBadge>;
}

function todayLabel(date: string) {
  const d = new Date(date);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

function sourceLabel(source: string) {
  const labels: Record<string, string> = {
    manual_capture: "수동 입력",
    aip: "AIP",
    kakao: "카톡",
    google_keep: "Keep",
    google_calendar: "Calendar",
    google_tasks: "Tasks",
    sheet_sync: "시트",
    system: "시스템",
  };
  return labels[source] ?? source;
}

const TABS = [
  { key: "all", label: "전체" },
  { key: "pinned", label: "핀" },
  { key: "urgent", label: "긴급" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const DATE_FILTERS = [
  { key: "today", label: "오늘" },
  { key: "week", label: "이번주" },
  { key: "month", label: "한달" },
  { key: "all", label: "전체" },
] as const;

type DateFilterKey = (typeof DATE_FILTERS)[number]["key"];

type StaffRow = { id: string; name: string };
type StoreOption = { id: string; name: string; assigned_owner_id: string | null };
type StoreAssigneeRow = { store_id: string; profile_id: string };

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), []);
  const { profile: currentProfile } = useCurrentProfile();
  const [stats, setStats] = useState<Stats | null>(null);
  const [quests, setQuests] = useState<QuestRow[] | null>(null);
  const [completions, setCompletions] = useState<CompletionRow[] | null>(null);
  const [events, setEvents] = useState<CalendarEventRow[] | null>(null);
  const [proposedActions, setProposedActions] = useState<ProposedActionRow[] | null>(null);
  const [proposedActionCount, setProposedActionCount] = useState<number | null>(null);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [allStores, setAllStores] = useState<StoreOption[]>([]);
  const [storeAssignees, setStoreAssignees] = useState<StoreAssigneeRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("all");
  const [dateFilter, setDateFilter] = useState<DateFilterKey>("today");
  const [ownerFilter, setOwnerFilter] = useState<string>("all"); // 'all' | <userId>
  const [storeFilter, setStoreFilter] = useState<string>("all"); // 'all' | <storeId>
  const [showProposedActions, setShowProposedActions] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showCompletedAll, setShowCompletedAll] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [focusedQuestId, setFocusedQuestId] = useState<string | null>(null);
  const [focusedStoreId, setFocusedStoreId] = useState<string | null>(null);
  // Decision Brief: 가장 우선순위 quest를 자동 선택. 사용자가 다른 quest 클릭하면 변경.
  const [selectedQuestId, setSelectedQuestId] = useState<string | null>(null);

  useEffect(() => {
    const applyFocus = (questId: string | null, storeId: string | null) => {
      setFocusedQuestId(questId);
      setFocusedStoreId(questId ? null : storeId);
    };
    const readFocusFromUrl = () => {
      const url = new URL(window.location.href);
      const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
      applyFocus(
        url.searchParams.get("quest") ?? hashParams.get("quest"),
        url.searchParams.get("store") ?? hashParams.get("store"),
      );
    };
    const onFocusNotification = (event: Event) => {
      const detail = (event as CustomEvent<{
        questId?: string | null;
        storeId?: string | null;
      }>).detail;
      applyFocus(detail.questId ?? null, detail.storeId ?? null);
    };

    readFocusFromUrl();
    window.addEventListener("hashchange", readFocusFromUrl);
    window.addEventListener("banss:focus-notification", onFocusNotification);
    return () => {
      window.removeEventListener("hashchange", readFocusFromUrl);
      window.removeEventListener("banss:focus-notification", onFocusNotification);
    };
  }, []);

  useEffect(() => {
    if (!currentProfile?.id) return;
    setCurrentUserId(currentProfile.id);
    setOwnerFilter((prev) => (prev === "all" ? currentProfile.id : prev));
  }, [currentProfile?.id]);

  const reload = useMemo(
    () => async () => {
      const [s, q, c, e, st, ss, sa, pa] = await Promise.all([
        supabase.from("v_dashboard_stats").select("*").single(),
        supabase
          .from("v_quest_dashboard")
          .select("*")
          .order("is_pinned", { ascending: false })
          .order("priority")
          .order("due_date"),
        supabase
          .from("quest_completions")
          .select("id, completed_at, quest:quests(title, process_step, store:stores(name))")
          .order("completed_at", { ascending: false })
          .limit(5),
        supabase
          .from("calendar_events")
          .select("id, title, event_type, start_at, store:stores(name), created_by")
          .order("created_at"),
        supabase.from("profiles").select("id, name").order("name"),
        supabase
          .from("stores")
          .select("id, name, assigned_owner_id")
          .is("archived_at", null)
          .order("name"),
        supabase.from("store_assignees").select("store_id, profile_id"),
        supabase
          .from("proposed_actions")
          .select(
            "id, store_id, title, description, action_type, priority, due_date, source, confidence, reasoning, raw_input, created_at, store:stores(name)",
            { count: "exact" },
          )
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(8),
      ]);
      if (s.error || q.error || c.error || e.error || st.error || ss.error || sa.error || pa.error) {
        setError(
          s.error?.message ??
            q.error?.message ??
            c.error?.message ??
            e.error?.message ??
            st.error?.message ??
            ss.error?.message ??
            sa.error?.message ??
            pa.error?.message ??
            "",
        );
        return;
      }
      setStats(s.data as Stats);
      setQuests(q.data as unknown as QuestRow[]);
      setCompletions(c.data as unknown as CompletionRow[]);
      setEvents(e.data as unknown as CalendarEventRow[]);
      setStaff((st.data ?? []) as StaffRow[]);
      setAllStores((ss.data ?? []) as StoreOption[]);
      setStoreAssignees((sa.data ?? []) as StoreAssigneeRow[]);
      setProposedActions((pa.data ?? []) as unknown as ProposedActionRow[]);
      setProposedActionCount(pa.count ?? (pa.data ?? []).length);
    },
    [supabase],
  );

  useEffect(() => {
    reload();
  }, [reload]);

  // store_id → 다중 담당자 매핑. 기존 assigned_owner_id는 fallback.
  const ownerMap = useMemo(() => {
    const m = new Map<string, Set<string>>();
    storeAssignees.forEach((row) => {
      const set = m.get(row.store_id) ?? new Set<string>();
      set.add(row.profile_id);
      m.set(row.store_id, set);
    });
    allStores.forEach((s) => {
      if (!m.has(s.id) && s.assigned_owner_id) {
        m.set(s.id, new Set([s.assigned_owner_id]));
      }
    });
    return m;
  }, [allStores, storeAssignees]);

  const ownerFilteredStores = useMemo(() => {
    if (ownerFilter === "all") return allStores;
    return allStores.filter((store) =>
      (ownerMap.get(store.id) ?? new Set<string>()).has(ownerFilter),
    );
  }, [allStores, ownerFilter, ownerMap]);

  useEffect(() => {
    if (storeFilter === "all") return;
    if (!ownerFilteredStores.some((store) => store.id === storeFilter)) {
      setStoreFilter("all");
    }
  }, [ownerFilteredStores, storeFilter]);

  // 자동 선택: 가장 우선순위 quest (filteredQuests의 첫 번째)
  // 사용자 수동 선택이 살아있는 동안은 그 quest 유지 (filteredQuests 안에 있을 때만)
  // 첫 로드 또는 선택된 quest가 사라지면 첫 번째로 fallback

  const filteredQuests = useMemo(() => {
    if (!quests) return [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();
    return quests.filter((q) => {
      // 상태 탭 필터
      if (tab === "pinned" && !q.is_pinned) return false;
      if (tab === "urgent" && q.priority !== "urgent") return false;

      // 날짜 필터 (오늘/이번주/한달/전체) — 사용자 비전: 기본 오늘
      if (dateFilter !== "all") {
        // due 없는 quest는 모든 필터에 포함 (마감 미정 = 항상 보여야)
        if (q.due_date) {
          const due = new Date(q.due_date).getTime();
          const diffDays = Math.floor((due - todayMs) / 86400000);
          if (dateFilter === "today" && diffDays > 0) return false;
          if (dateFilter === "week" && diffDays > 7) return false;
          if (dateFilter === "month" && diffDays > 30) return false;
        }
      }

      // 담당자 필터 (전체 / 3명만)
      const owners = ownerMap.get(q.store_id) ?? new Set<string>();
      if (ownerFilter !== "all" && !owners.has(ownerFilter)) return false;
      if (storeFilter !== "all" && q.store_id !== storeFilter) return false;
      return true;
    });
  }, [quests, tab, dateFilter, ownerFilter, ownerMap, storeFilter]);

  useEffect(() => {
    if (!quests) return;
    const targetQuestId =
      focusedQuestId && quests.some((q) => q.id === focusedQuestId)
        ? focusedQuestId
        : focusedStoreId
          ? quests.find((q) => q.store_id === focusedStoreId)?.id
          : null;
    if (!targetQuestId) return;
    setTab("all");
    setDateFilter("all");
    setOwnerFilter("all");
    setStoreFilter(focusedStoreId ?? "all");
    setSelectedQuestId(targetQuestId);
  }, [focusedQuestId, focusedStoreId, quests]);

  // selectedQuestId 자동 보정 — filteredQuests 변동 시
  useEffect(() => {
    const hasFocusedQuest = Boolean(
      focusedQuestId && quests?.some((q) => q.id === focusedQuestId),
    );
    const hasFocusedStoreQuest = Boolean(
      focusedStoreId && quests?.some((q) => q.store_id === focusedStoreId),
    );
    if (hasFocusedQuest || hasFocusedStoreQuest) {
      return;
    }
    if (filteredQuests.length === 0) {
      setSelectedQuestId(null);
      return;
    }
    if (!selectedQuestId || !filteredQuests.find((q) => q.id === selectedQuestId)) {
      setSelectedQuestId(filteredQuests[0].id);
    }
  }, [filteredQuests, focusedQuestId, focusedStoreId, quests, selectedQuestId]);

  const handleComplete = async (questId: string) => {
    const result = await completeQuestAction(questId);
    if (!result.ok) {
      alert("완료 실패: " + result.error);
      return;
    }
    reload();
  };

  const handleTogglePin = async (questId: string, current: boolean) => {
    const result = await toggleQuestPinAction(questId, current);
    if (!result.ok) {
      alert("핀 토글 실패: " + result.error);
      return;
    }
    reload();
  };

  const calendarEventsForMini: CalendarEvent[] = useMemo(
    () =>
      (events ?? []).map((e) => ({
        date: e.start_at.slice(0, 10),
        storeName: e.store?.name ?? "—",
        type: eventTypeToCalendarType[e.event_type],
        title: e.title,
      })),
    [events],
  );

  // 헤더/보드 카운트 — 담당자 + 매장 필터를 같이 반영
  const scopedQuests = useMemo(() => {
    if (!quests) return [];
    return quests.filter((q) => {
      const owners = ownerMap.get(q.store_id) ?? new Set<string>();
      if (ownerFilter !== "all" && !owners.has(ownerFilter)) return false;
      if (storeFilter !== "all" && q.store_id !== storeFilter) return false;
      return true;
    });
  }, [quests, ownerFilter, ownerMap, storeFilter]);
  const pendingCount = scopedQuests.filter((q) => q.status === "pending").length;
  const blockedCount = scopedQuests.filter((q) => q.status === "blocked").length;
  // 헤더 인사 — ownerFilter='all'이면 이름 X, 특정 담당자 매장 필터일 때만 이름
  const headerName =
    ownerFilter !== "all" ? staff.find((s) => s.id === ownerFilter)?.name : null;
  const selectedStoreName =
    storeFilter !== "all" ? allStores.find((store) => store.id === storeFilter)?.name : null;

  // 매장 수 = 담당자 필터에 따라 동적
  const filteredStoreCount = useMemo(() => {
    if (ownerFilter === "all") return allStores.length;
    return allStores.filter((s) => (ownerMap.get(s.id) ?? new Set<string>()).has(ownerFilter)).length;
  }, [allStores, ownerFilter, ownerMap]);

  // 누락 = 연체 + stale (사용자 결정 2026-05-05: 두 위젯 합산)
  const missCount = (stats?.overdue ?? 0) + (stats?.stale_health_check ?? 0);
  const pendingProposalCount = proposedActionCount ?? proposedActions?.length ?? 0;

  return (
    <main className="flex flex-1 flex-col gap-4 overflow-y-auto p-3 sm:p-5 lg:gap-5 lg:p-8">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {selectedStoreName
              ? `${selectedStoreName} · `
              : headerName
                ? `${headerName}님, `
                : ""}
            퀘스트 {pendingCount}건 남았습니다
          </h1>
          <p className="text-sm text-muted-foreground">
            오늘 {todayLabel(todayStr)} · 우선순위 순으로 처리하세요
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
          <Button
            type="button"
            onClick={() => setShowProposedActions((v) => !v)}
            className="relative h-10 min-w-0 justify-center gap-1.5 rounded-md px-3 text-sm sm:min-w-[150px] sm:shrink-0"
            aria-expanded={showProposedActions}
          >
            <Sparkles className="size-4" />
            퀘스트 제안함
            {pendingProposalCount > 0 && (
              <span className="absolute -right-2 -top-2 flex min-w-5 items-center justify-center rounded-full bg-urgent px-1.5 py-0.5 text-[11px] font-bold leading-none text-white shadow-sm ring-2 ring-background">
                {pendingProposalCount > 99 ? "99+" : pendingProposalCount}
              </span>
            )}
          </Button>
          {/* 관리 매장 — 담당자 필터 통합 */}
          <div className="flex h-10 min-w-0 items-center gap-2 rounded-md border bg-card px-3 text-sm sm:min-w-[150px] sm:shrink-0">
            <Store className="size-4" />
            <select
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              className="min-w-0 flex-1 cursor-pointer bg-transparent text-muted-foreground outline-none"
            >
              <option value="all">전체 매장</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>{s.name} 매장</option>
              ))}
            </select>
            <span className="font-semibold">{filteredStoreCount}</span>
          </div>
          <StatPill
            icon={ListChecks}
            label="진행 중"
            value={stats?.pending_quests ?? "—"}
            tone="default"
            className="sm:min-w-[112px]"
          />
          <StatPill
            icon={ListChecks}
            label="오늘 마감"
            value={stats?.due_today ?? "—"}
            tone={(stats?.due_today ?? 0) > 0 ? "today" : "ok"}
            className="sm:min-w-[112px]"
          />
          <StatPill
            icon={AlertTriangle}
            label="누락"
            value={missCount}
            tone={missCount > 0 ? "miss" : "ok"}
            className="col-span-2 sm:col-span-1 sm:min-w-[96px]"
          />
        </div>
      </header>

      {showProposedActions && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/35 p-2 pt-4 backdrop-blur-[2px] sm:p-6 sm:pt-24"
          role="dialog"
          aria-modal="true"
          aria-label="퀘스트 제안함"
          onClick={() => setShowProposedActions(false)}
        >
          <div
            className="relative max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-xl sm:max-h-[calc(100dvh-7rem)]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowProposedActions(false)}
              className="absolute right-2 top-2 z-10 flex size-8 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground sm:-right-2 sm:-top-2"
              aria-label="퀘스트 제안함 닫기"
            >
              <X className="size-4" />
            </button>
            <ProposedActionsPanel
              items={proposedActions}
              totalCount={proposedActionCount}
              stores={allStores}
              storeAssignees={storeAssignees}
              staff={staff}
              onChanged={reload}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-urgent/30 bg-urgent-bg p-3 text-sm text-urgent">
          DB 조회 에러: {error}
        </div>
      )}

      {/* ─── Decision Brief — "지금 가장 급한 퀘스트 1건" ───────────────────
           palantir-patterns.md §3. 퀘스트 클릭 → 매장 360 컨텍스트 자동 표시 */}
      {selectedQuestId ? (
        <section className="space-y-2">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-2">
            <h2 className="text-base font-semibold tracking-tight">
              <span className="mr-1 text-primary">◎</span>
              지금 가장 급한 퀘스트 1건
            </h2>
            <span className="text-xs text-muted-foreground">
              아래 퀘스트 보드에서 다른 항목을 클릭하면 전환됩니다
            </span>
          </div>
          <QuestContextCard
            questId={selectedQuestId}
            staff={staff}
            onActionDone={reload}
          />
        </section>
      ) : null}

      <div className="grid gap-5 md:grid-cols-12 md:items-start">
        <div className="flex flex-col gap-5 md:col-span-7">
          {/* 좌: 진행 중 퀘스트 — 내부 스크롤 */}
          <section className="flex flex-col rounded-xl border bg-card p-3 shadow-sm sm:p-4 md:max-h-[720px]">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-baseline gap-2">
                <h2 className="text-base font-semibold">퀘스트 보드</h2>
                <span className="text-xs text-muted-foreground">
                  {pendingCount}건 · 차단 {blockedCount}건
                </span>
              </div>
              <Button size="sm" onClick={() => setShowAdd(true)} className="w-full sm:w-auto">
                <Plus className="size-3.5" />새 퀘스트
              </Button>
            </div>
            {/* 담당자 + 매장 필터 */}
            <div className="mb-2 grid gap-2 text-xs sm:grid-cols-2">
              <label className="flex items-center gap-2">
                <span className="shrink-0 text-muted-foreground">담당자</span>
                <select
                  value={ownerFilter}
                  onChange={(e) => setOwnerFilter(e.target.value)}
                  className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1 outline-none"
                >
                  <option value="all">전체</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2">
                <span className="shrink-0 text-muted-foreground">매장</span>
                <select
                  value={storeFilter}
                  onChange={(e) => setStoreFilter(e.target.value)}
                  className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1 outline-none"
                >
                  <option value="all">전체 매장</option>
                  {ownerFilteredStores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {/* 상태 탭 + 날짜 필터 — 사용자 비전: 기본 '오늘' */}
            <div className="mb-3 flex flex-col gap-2 border-b pb-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-1 overflow-x-auto">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs transition-colors",
                      tab === t.key
                        ? "bg-primary/10 text-primary font-semibold"
                        : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="flex w-full items-center gap-1 rounded-md bg-muted/60 p-0.5 text-[11px] sm:w-max">
                {DATE_FILTERS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setDateFilter(f.key)}
                    className={cn(
                      "flex-1 whitespace-nowrap rounded px-2 py-0.5 transition-colors sm:flex-none",
                      dateFilter === f.key
                        ? "bg-background font-semibold shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-1 min-h-0 flex-col gap-2 overflow-y-auto pr-1">
              {quests == null ? (
                <div className="flex flex-col items-center gap-2 p-12 text-muted-foreground">
                  <Loader2 className="size-5 animate-spin" />
                  <span className="text-xs">불러오는 중…</span>
                </div>
              ) : filteredQuests.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-12 text-center">
                  <CheckCircle2 className="size-8 text-success" />
                  <p className="text-sm font-medium">조건에 맞는 퀘스트가 없습니다</p>
                </div>
              ) : (
                filteredQuests.map((q) => {
                  const blocked = q.status === "blocked";
                  const active = q.id === selectedQuestId;
                  return (
                    <div
                      key={q.id}
                      onClick={() => !blocked && setSelectedQuestId(q.id)}
                      role="button"
                      tabIndex={blocked ? -1 : 0}
                      onKeyDown={(e) => {
                        if (!blocked && (e.key === "Enter" || e.key === " ")) {
                          e.preventDefault();
                          setSelectedQuestId(q.id);
                        }
                      }}
                      className={cn(
                        "group relative flex flex-col gap-3 rounded-lg border bg-card p-3 shadow-sm transition-all sm:flex-row sm:items-start",
                        q.is_pinned && "border-warning/35 bg-warning-bg/45",
                        active && "ring-2 ring-primary border-primary",
                        blocked
                          ? "opacity-60 cursor-not-allowed"
                          : "cursor-pointer hover:border-primary/40 hover:shadow",
                      )}
                    >
                      {/* urgent 좌측 strip */}
                      {q.priority === "urgent" && (
                        <span
                          aria-hidden
                          className="absolute left-0 top-0 h-full w-0.5 rounded-l bg-urgent"
                        />
                      )}
                      <div className="flex flex-1 flex-col gap-1 min-w-0">
                        {/* 1줄: D-day/마감 강조 + (urgent시) 긴급 — step badge 제거 (사용자 결정) */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          {dueDayDisplay(q.due_date, q.due_bucket)}
                          {q.priority === "urgent" && (
                            <PriorityBadge priority="urgent" size="sm" />
                          )}
                          {q.is_pinned && (
                            <span className="text-xs text-warning" title="핀 고정">
                              📌
                            </span>
                          )}
                        </div>
                        {/* 2줄: 메인 제목 */}
                        <div className="text-sm font-medium leading-snug">{q.title}</div>
                        {/* 3줄: 매장 회색 */}
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="truncate">{q.store_name}</span>
                          {blocked && (
                            <span className="flex items-center gap-1 text-warning">
                              <Lock className="size-3" />
                              {q.blocked_reason}
                            </span>
                          )}
                        </div>
                      </div>
                      <div
                        className="flex shrink-0 items-center justify-end gap-1 sm:flex-col sm:items-end"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTogglePin(q.id, q.is_pinned);
                          }}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                          title={q.is_pinned ? "핀 해제" : "핀 고정"}
                        >
                        {q.is_pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                        </button>
                        {q.source === "sheet_missing" ? (
                          <Button size="sm" variant="outline" className="flex-1 sm:flex-none" asChild>
                            <a
                              href={q.external_url ?? "#"}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="시트에서 처리하면 자동 사라집니다"
                              onClick={(e) => e.stopPropagation()}
                            >
                              체크리스트 ↗
                            </a>
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant={blocked ? "ghost" : "outline"}
                            className="flex-1 sm:flex-none"
                            disabled={blocked}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleComplete(q.id);
                            }}
                          >
                            완료
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>

        {/* 우: 캘린더 + 완료 */}
        <aside className="flex flex-col gap-5 md:col-span-5">
          <section className="rounded-xl border bg-card p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-base font-semibold">캘린더</h2>
              <span className="text-xs text-muted-foreground">월간</span>
            </div>
            <MiniCalendar
              events={calendarEventsForMini}
              today={todayStr}
              onDayClick={(d) => setSelectedDate(d)}
              labelMode
            />
          </section>

          <section className="rounded-xl border bg-card p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-base font-semibold">완료된 퀘스트</h2>
              <button
                onClick={() => setShowCompletedAll(true)}
                className="text-xs text-primary underline-offset-2 hover:underline"
              >
                전체보기 →
              </button>
            </div>
            {completions == null ? (
              <div className="flex justify-center p-6">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            ) : completions.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
                완료된 퀘스트가 없습니다
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {completions.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs"
                  >
                    <CheckCircle2 className="size-3.5 shrink-0 text-success" />
                    {c.quest?.process_step && (
                      <span
                        className="text-[10px] text-muted-foreground"
                        title={c.quest.process_step}
                      >
                        {stepLabel(c.quest.process_step)}
                      </span>
                    )}
                    <span className="truncate font-medium text-foreground/80">
                      {c.quest?.store?.name ?? "—"}
                    </span>
                    <span className="truncate text-muted-foreground">
                      {c.quest?.title ?? ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      {/* 매장 간트차트 (활동 히트맵 통합 — 2026-05-05) */}
      <section className="hidden rounded-xl border bg-card p-4 xl:block">
        <GanttChart />
      </section>

      {showAdd && (
        <AddQuestModal
          stores={allStores}
          storeAssignees={storeAssignees}
          staff={staff}
          currentUserId={currentUserId}
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            reload();
          }}
        />
      )}

      {showCompletedAll && (
        <CompletedQuestsModal
          onClose={() => setShowCompletedAll(false)}
          onChanged={reload}
        />
      )}

      {selectedDate && (
        <CalendarDayModal
          date={selectedDate}
          events={(events ?? []).filter((e) => e.start_at.slice(0, 10) === selectedDate)}
          stores={allStores}
          staff={staff}
          currentUserId={currentUserId}
          onClose={() => setSelectedDate(null)}
          onChanged={reload}
        />
      )}
    </main>
  );
}

function CalendarDayModal({
  date,
  events,
  stores,
  staff,
  currentUserId,
  onClose,
  onChanged,
}: {
  date: string;
  events: CalendarEventRow[];
  stores: StoreOption[];
  staff: StaffRow[];
  currentUserId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [showForm, setShowForm] = useState(events.length === 0);
  const [title, setTitle] = useState("");
  const [eventType, setEventType] = useState<CalendarEventRow["event_type"]>("meeting");
  const [storeId, setStoreId] = useState<string>("");
  const [assignedTo, setAssignedTo] = useState<string>(currentUserId || "");
  const [allDay, setAllDay] = useState(true);
  const [time, setTime] = useState("10:00");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const inputCls =
    "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-foreground/30";

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setErr("제목 필수");
      return;
    }
    setBusy(true);
    setErr(null);
    const startAt = allDay ? `${date}T00:00:00` : `${date}T${time}:00`;
    const result = await createCalendarEventAction({
      title: title.trim(),
      eventType,
      storeId: storeId || null,
      startAt,
      allDay,
      createdBy: assignedTo || null,
    });
    setBusy(false);
    if (!result.ok) {
      setErr(result.error);
      return;
    }
    setTitle("");
    setShowForm(false);
    onChanged();
  }

  async function remove(id: string) {
    if (
      !window.confirm(
        "이 일정을 삭제하시겠습니까?\n삭제 후 되돌릴 수 없습니다.",
      )
    ) {
      return;
    }
    const result = await deleteCalendarEventAction(id);
    if (!result.ok) {
      setErr(result.error);
      return;
    }
    onChanged();
  }

  const eventTypeOptions: { code: CalendarEventRow["event_type"]; label: string }[] = [
    { code: "meeting", label: "미팅" },
    { code: "report_due", label: "월보고" },
    { code: "visit", label: "방문" },
    { code: "milestone", label: "돌방" },
    { code: "other", label: "기타" },
  ];
  const eventTypeLabel = (t: CalendarEventRow["event_type"]) =>
    eventTypeOptions.find((o) => o.code === t)?.label ?? t;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-3 py-6 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[calc(100dvh-3rem)] w-full max-w-md overflow-y-auto rounded-xl border bg-card p-4 shadow-lg sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{date}</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>
        {err && (
          <div className="mb-3 rounded-md border border-urgent/30 bg-urgent-bg p-2 text-xs text-urgent">
            {err}
          </div>
        )}

        {/* 이벤트 리스트 */}
        {events.length > 0 ? (
          <ul className="mb-3 flex flex-col gap-2">
            {events.map((e) => (
              <li
                key={e.id}
                className="flex items-start gap-2 rounded-md border bg-muted/30 p-2 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {eventTypeLabel(e.event_type)}
                    </span>
                    <span className="truncate font-medium">{e.title}</span>
                  </div>
                  {e.store?.name && (
                    <div className="mt-0.5 text-muted-foreground">{e.store.name}</div>
                  )}
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {e.start_at.slice(11, 16)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => remove(e.id)}
                  className="rounded-md p-1 text-urgent hover:bg-urgent-bg"
                  aria-label="삭제"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mb-3 rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
            이 날 일정이 없습니다
          </div>
        )}

        {/* 추가 폼 */}
        {!showForm ? (
          <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
            <Plus className="size-3.5" />
            일정 추가
          </Button>
        ) : (
          <form onSubmit={add} className="flex flex-col gap-2 border-t pt-3 text-sm">
            <input
              className={inputCls}
              placeholder="제목 (예: 업주 미팅)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                className={inputCls}
                value={eventType}
                onChange={(e) => setEventType(e.target.value as CalendarEventRow["event_type"])}
              >
                {eventTypeOptions.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.label}
                  </option>
                ))}
              </select>
              <select
                className={inputCls}
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
              >
                <option value="">매장 미지정</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium">담당자</span>
              <select
                className={inputCls}
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
              >
                <option value="">미지정</option>
                {staff.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
              />
              종일
              {!allDay && (
                <input
                  type="time"
                  className={cn(inputCls, "ml-2 max-w-[120px]")}
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              )}
            </label>
            <div className="mt-1 flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>
                취소
              </Button>
              <Button type="submit" size="sm" disabled={busy}>
                {busy && <Loader2 className="size-3.5 animate-spin" />}
                추가
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function ProposedActionsPanel({
  items,
  totalCount,
  stores,
  storeAssignees,
  staff,
  onChanged,
}: {
  items: ProposedActionRow[] | null;
  totalCount?: number | null;
  stores: StoreOption[];
  storeAssignees: StoreAssigneeRow[];
  staff: StaffRow[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [storeId, setStoreId] = useState("");
  const [rawText, setRawText] = useState("");
  const [saving, setSaving] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ProposedActionDraft>>({});
  const [assigneeDrafts, setAssigneeDrafts] = useState<Record<string, string[]>>({});
  const [expandedDrafts, setExpandedDrafts] = useState<Record<string, boolean>>({});

  const storeAssigneeMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of storeAssignees) {
      const list = map.get(row.store_id) ?? [];
      if (!list.includes(row.profile_id)) list.push(row.profile_id);
      map.set(row.store_id, list);
    }
    stores.forEach((store) => {
      if (!map.has(store.id) && store.assigned_owner_id) {
        map.set(store.id, [store.assigned_owner_id]);
      }
    });
    return map;
  }, [storeAssignees, stores]);

  useEffect(() => {
    if (!storeId && stores[0]?.id) setStoreId(stores[0].id);
  }, [storeId, stores]);

  function defaultDraft(item: ProposedActionRow): ProposedActionDraft {
    return {
      title: item.title,
      description: item.description ?? "",
      storeId: item.store_id ?? "",
      priority: item.priority,
      dueDate: item.due_date ?? "",
    };
  }

  function draftFor(item: ProposedActionRow) {
    return drafts[item.id] ?? defaultDraft(item);
  }

  function updateDraft(item: ProposedActionRow, patch: Partial<ProposedActionDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [item.id]: {
        ...defaultDraft(item),
        ...prev[item.id],
        ...patch,
      },
    }));
    if (patch.storeId !== undefined) {
      setAssigneeDrafts((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    }
  }

  function toggleExpanded(itemId: string, fallback: boolean) {
    setExpandedDrafts((prev) => ({ ...prev, [itemId]: !(prev[itemId] ?? fallback) }));
  }

  function assigneesFor(item: ProposedActionRow) {
    if (assigneeDrafts[item.id] !== undefined) return assigneeDrafts[item.id];
    const draft = draftFor(item);
    if (!draft.storeId) return [];
    return storeAssigneeMap.get(draft.storeId) ?? [];
  }

  function toggleAssignee(item: ProposedActionRow, profileId: string) {
    const current = assigneesFor(item);
    const next = current.includes(profileId)
      ? current.filter((id) => id !== profileId)
      : [...current, profileId];
    setAssigneeDrafts((prev) => ({ ...prev, [item.id]: next }));
  }

  async function createProposal() {
    if (!rawText.trim()) {
      setError("내용을 입력해주세요.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await createProposedActionFromTextAction({
      rawText,
      storeId: storeId || null,
      source: "manual_capture",
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setRawText("");
    setOpen(false);
    onChanged();
  }

  async function approve(item: ProposedActionRow) {
    const draft = draftFor(item);
    const title = draft.title.trim();
    if (!title) {
      alert("퀘스트 제목을 입력해주세요.");
      return;
    }
    if (!draft.storeId) {
      alert("퀘스트를 만들 매장을 선택해주세요.");
      return;
    }
    setActingId(item.id);
    const result = await approveProposedActionAction(item.id, {
      title,
      description: draft.description.trim() || null,
      storeId: draft.storeId,
      priority: draft.priority,
      dueDate: draft.dueDate || null,
      assigneeIds: assigneesFor(item),
    });
    setActingId(null);
    if (!result.ok) {
      alert("승인 실패: " + result.error);
      return;
    }
    onChanged();
  }

  async function dismiss(item: ProposedActionRow) {
    const reason = window.prompt("스킵 사유", "");
    if (reason === null) return;
    const trimmedReason = reason.trim() || undefined;
    if (
      !window.confirm(
        `이 퀘스트 제안을 스킵하시겠습니까?\n\n제안: ${item.title}${
          trimmedReason ? `\n사유: ${trimmedReason}` : ""
        }`,
      )
    ) {
      return;
    }
    setActingId(item.id);
    const result = await dismissProposedActionAction(item.id, trimmedReason);
    setActingId(null);
    if (!result.ok) {
      alert("스킵 실패: " + result.error);
      return;
    }
    onChanged();
  }

  return (
    <section className="rounded-xl border border-l-4 border-l-primary bg-card p-3 shadow-sm sm:p-4">
      <div className="mb-3 flex flex-col gap-2 pr-9 sm:flex-row sm:items-center sm:justify-between sm:pr-0">
        <div className="flex items-baseline gap-2">
          <h2 className="flex items-center gap-1.5 text-base font-semibold">
            <Sparkles className="size-4 text-primary" />
            퀘스트 제안함
          </h2>
          <span className="text-xs text-muted-foreground">
            {totalCount ?? items?.length ?? 0}건
          </span>
          {items && totalCount != null && totalCount > items.length && (
            <span className="text-xs text-muted-foreground">
              최근 {items.length}건 표시
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="w-full sm:w-auto"
          onClick={() => setOpen((v) => !v)}
        >
          <ClipboardPaste className="size-3.5" />
          붙여넣기
        </Button>
      </div>

      {open && (
        <div className="mb-3 space-y-2 rounded-md border bg-primary/5 p-3">
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            className="h-8 w-full rounded-md border bg-background px-2 text-xs outline-none focus:border-foreground/30"
          >
            <option value="">매장 미지정</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="카톡/메모 내용을 붙여넣으면 퀘스트 후보로 변환합니다."
            className="min-h-[96px] w-full resize-y rounded-md border bg-background px-2 py-1.5 text-xs leading-relaxed outline-none focus:ring-1 focus:ring-primary"
          />
          {error && <div className="text-xs text-urgent">{error}</div>}
          <Button
            size="sm"
            className="w-full gap-1.5"
            onClick={createProposal}
            disabled={saving || !rawText.trim()}
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            퀘스트 후보 만들기
          </Button>
        </div>
      )}

      {items == null ? (
        <div className="flex justify-center p-6">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
          승인 대기 중인 제안이 없습니다
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item, index) => {
            const draft = draftFor(item);
            const selectedAssignees = assigneesFor(item);
            const expanded = expandedDrafts[item.id] ?? index === 0;
            return (
            <li key={item.id} className="rounded-md border bg-muted/20 p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <PriorityBadge priority={draft.priority} size="sm" />
                    <StatusBadge tone="info" size="sm">
                      {sourceLabel(item.source)}
                    </StatusBadge>
                    {draft.dueDate && (
                      <span className="text-[11px] text-muted-foreground">
                        마감 {draft.dueDate}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-sm font-medium leading-snug">
                    {draft.title.trim() || "제목 없음"}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    원본: {item.store?.name ?? "매장 미지정"}
                    {item.reasoning && <> · {item.reasoning}</>}
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full shrink-0 sm:w-auto"
                  onClick={() => toggleExpanded(item.id, index === 0)}
                >
                  {expanded ? "접기" : "검수"}
                </Button>
              </div>
              {expanded ? (
                <>
              <div className="mt-3 space-y-2 rounded-md border bg-background/70 p-3">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="font-medium text-muted-foreground">제목</span>
                  <input
                    value={draft.title}
                    onChange={(e) => updateDraft(item, { title: e.target.value })}
                    className="h-8 rounded-md border bg-background px-2 text-xs outline-none focus:border-foreground/30"
                    placeholder="퀘스트 제목"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="font-medium text-muted-foreground">내용</span>
                  <textarea
                    value={draft.description}
                    onChange={(e) => updateDraft(item, { description: e.target.value })}
                    className="min-h-[72px] resize-y rounded-md border bg-background px-2 py-1.5 text-xs leading-relaxed outline-none focus:ring-1 focus:ring-primary"
                    placeholder="퀘스트 내용"
                  />
                </label>
                <div className="grid gap-2 sm:grid-cols-3">
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="font-medium text-muted-foreground">매장</span>
                    <select
                      value={draft.storeId}
                      onChange={(e) => updateDraft(item, { storeId: e.target.value })}
                      className="h-8 rounded-md border bg-background px-2 text-xs outline-none focus:border-foreground/30"
                    >
                      <option value="">매장 선택</option>
                      {stores.map((store) => (
                        <option key={store.id} value={store.id}>
                          {store.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="font-medium text-muted-foreground">우선순위</span>
                    <select
                      value={draft.priority}
                      onChange={(e) =>
                        updateDraft(item, {
                          priority: e.target.value as ProposedActionRow["priority"],
                        })
                      }
                      className="h-8 rounded-md border bg-background px-2 text-xs outline-none focus:border-foreground/30"
                    >
                      <option value="urgent">긴급</option>
                      <option value="normal">보통</option>
                      <option value="low">낮음</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="font-medium text-muted-foreground">마감일</span>
                    <input
                      type="date"
                      value={draft.dueDate}
                      onChange={(e) => updateDraft(item, { dueDate: e.target.value })}
                      className="h-8 rounded-md border bg-background px-2 text-xs outline-none focus:border-foreground/30"
                    />
                  </label>
                </div>
              </div>
              {draft.storeId && staff.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  <div className="text-[11px] font-medium text-muted-foreground">
                    퀘스트 담당자
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {staff.map((member) => {
                      const selected = selectedAssignees.includes(member.id);
                      return (
                        <button
                          key={member.id}
                          type="button"
                          onClick={() => toggleAssignee(item, member.id)}
                          className={cn(
                            "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                            selected
                              ? "border-primary/30 bg-primary/10 text-primary"
                              : "border-border bg-background text-muted-foreground hover:bg-muted",
                          )}
                        >
                          {member.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Button
                  size="sm"
                  className="w-full flex-1 gap-1"
                  onClick={() => approve(item)}
                  disabled={actingId === item.id || !draft.storeId || !draft.title.trim()}
                  title={!draft.storeId ? "매장을 지정해야 승인할 수 있습니다" : undefined}
                >
                  {actingId === item.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-3.5" />
                  )}
                  퀘스트 생성
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full gap-1 sm:w-auto"
                  onClick={() => dismiss(item)}
                  disabled={actingId === item.id}
                >
                  스킵
                </Button>
              </div>
                </>
              ) : (
                <div className="mt-2 line-clamp-2 rounded-md border bg-background/60 px-2 py-1.5 text-xs leading-relaxed text-muted-foreground">
                  {draft.description || item.raw_input || "내용 없음"}
                </div>
              )}
            </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function AddQuestModal({
  stores,
  storeAssignees,
  staff,
  currentUserId,
  onClose,
  onCreated,
}: {
  stores: StoreOption[];
  storeAssignees: StoreAssigneeRow[];
  staff: StaffRow[];
  currentUserId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const assigneeMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of storeAssignees) {
      const list = map.get(row.store_id) ?? [];
      if (!list.includes(row.profile_id)) list.push(row.profile_id);
      map.set(row.store_id, list);
    }
    stores.forEach((store) => {
      if (!map.has(store.id) && store.assigned_owner_id) {
        map.set(store.id, [store.assigned_owner_id]);
      }
    });
    return map;
  }, [storeAssignees, stores]);

  // 본인 담당 매장 우선 정렬
  const sortedStores = useMemo(() => {
    if (!currentUserId) return stores;
    return [...stores].sort((a, b) => {
      const aMine = assigneeMap.get(a.id)?.includes(currentUserId) ? 0 : 1;
      const bMine = assigneeMap.get(b.id)?.includes(currentUserId) ? 0 : 1;
      return aMine - bMine || a.name.localeCompare(b.name);
    });
  }, [stores, currentUserId, assigneeMap]);

  const [storeId, setStoreId] = useState(sortedStores[0]?.id ?? "");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"urgent" | "normal" | "low">("normal");
  // 마감일 디폴트 = 오늘
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const defaultAssigneeIds = useMemo(
    () => assigneeMap.get(storeId) ?? [],
    [assigneeMap, storeId],
  );

  useEffect(() => {
    setAssigneeIds(defaultAssigneeIds);
  }, [defaultAssigneeIds]);

  const assigneeNames = useMemo(() => {
    if (assigneeIds.length === 0) return "미지정";
    return assigneeIds
      .map((id) => staff.find((p) => p.id === id)?.name)
      .filter(Boolean)
      .join(", ");
  }, [assigneeIds, staff]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!storeId || !title.trim()) {
      setErr("매장과 내용은 필수");
      return;
    }
    setSaving(true);
    setErr(null);
    const result = await createQuestAction({
      storeId,
      title: title.trim(),
      description: description.trim() || null,
      priority,
      dueDate: dueDate || null,
      assigneeIds,
    });
    setSaving(false);
    if (!result.ok) {
      setErr(result.error);
      return;
    }
    onCreated();
  }

  const inputCls =
    "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-foreground/30";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-3 py-6 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[calc(100dvh-3rem)] w-full max-w-md overflow-y-auto rounded-xl border bg-card p-4 shadow-lg sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">새 퀘스트 추가</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>
        {err && (
          <div className="mb-3 rounded-md border border-urgent/30 bg-urgent-bg p-2 text-xs text-urgent">
            {err}
          </div>
        )}
        <form onSubmit={submit} className="flex flex-col gap-3 text-sm">
          <label className="flex flex-col gap-1.5">
            <span className="font-medium">매장</span>
            <select
              className={inputCls}
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              required
            >
              {sortedStores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {currentUserId && assigneeMap.get(s.id)?.includes(currentUserId)
                    ? " (본인 담당)"
                    : ""}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">기본 담당자: {assigneeNames}</span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-medium">퀘스트 담당자</span>
            <div className="flex flex-wrap gap-1.5">
              {staff.map((member) => {
                const selected = assigneeIds.includes(member.id);
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() =>
                      setAssigneeIds((current) =>
                        selected
                          ? current.filter((id) => id !== member.id)
                          : [...current, member.id],
                      )
                    }
                    className={cn(
                      "rounded-md border px-2.5 py-1.5 text-xs transition-colors",
                      selected
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {member.name}
                  </button>
                );
              })}
            </div>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-medium">내용 (제목)</span>
            <input
              className={inputCls}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 업주 미팅 일정 잡기"
              required
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-medium">설명 (선택)</span>
            <textarea
              className={cn(inputCls, "min-h-[60px] resize-y")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="font-medium">우선순위</span>
              <select
                className={inputCls}
                value={priority}
                onChange={(e) => setPriority(e.target.value as typeof priority)}
              >
                <option value="urgent">긴급</option>
                <option value="normal">보통</option>
                <option value="low">낮음</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-medium">마감일 (선택)</span>
              <input
                type="date"
                className={inputCls}
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </label>
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              취소
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              추가
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
