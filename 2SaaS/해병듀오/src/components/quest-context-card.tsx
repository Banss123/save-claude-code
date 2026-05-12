/**
 * QuestContextCard — 자비스(JARVIS) 실행 중심 Decision Brief
 *
 * 사용자 비전:
 *   "퀘스트를 먼저 보고, 아래에서 매장·업주 컨텍스트를 확인.
 *    한 화면에서 다음 행동과 포워딩 멘트까지 결정 가능."
 *
 * 데이터: supabase.rpc('get_decision_brief', { p_quest_id })
 * 액션 (Phase 2: Server Action 연결 예정): 완료 / 위임 / 스킵 / 메모
 */

"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  UserPlus2,
  Ban,
  StickyNote,
  ExternalLink,
  Loader2,
  Phone,
  Mail,
  CalendarClock,
  Activity,
  TrendingUp,
  X,
  AlertTriangle,
  Crown,
  Sparkles,
  ArrowRight,
  Pin,
  MessageSquare,
  Copy,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  completeQuest as completeQuestAction,
  delegateQuest as delegateQuestAction,
  skipQuest as skipQuestAction,
} from "@/lib/actions/quest";
import {
  addCommunication as addCommunicationAction,
  updateStoreMemo as updateStoreMemoAction,
} from "@/lib/actions/store";
import { generateForwardingDraftAction } from "@/lib/actions/aip";
import { Button } from "@/components/ui/button";
import {
  StatusBadge,
  PriorityBadge,
  StepBadge,
  StoreStatusBadge,
} from "@/components/status-badge";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────
type ActiveQuest = {
  id: string;
  title: string;
  description: string | null;
  process_step: string | null;
  priority: "urgent" | "normal" | "low";
  due_date: string | null;
  status: string;
  source: string;
  external_url: string | null;
  is_pinned: boolean;
};

type QuestNote = {
  text: string;
  at: string;
};

type QuestMetadata = {
  notes?: unknown;
} & Record<string, unknown>;

type Communication = {
  id: string;
  channel_code: string;
  direction: "inbound" | "outbound";
  summary: string;
  body: string | null;
  occurred_at: string;
  next_action: string | null;
  next_action_date: string | null;
};

type QuestRow = {
  id: string;
  store_id: string;
  title: string;
  description: string | null;
  process_step: string | null;
  status: string;
  priority: "urgent" | "normal" | "low";
  is_pinned: boolean;
  due_date: string | null;
  blocked_reason: string | null;
  source: "auto" | "manual" | "sheet_missing";
  external_url: string | null;
  created_at: string;
  metadata: QuestMetadata | null;
};

type Store360 = {
  store_id: string;
  store_name: string;
  type_code: string;
  type_label: string | null;
  status: string;
  address: string | null;
  owner_name: string | null;
  owner_phone: string | null;
  owner_email: string | null;
  // 매장 링크 + 회차 + 메인 키워드 (마이그 20260506000006~007)
  current_round: number | null;
  main_keyword: string | null;
  main_keyword_translation: string | null;
  main_keywords_i18n: Record<string, string> | null;  // {ko, en, ja, zh_tw, zh_cn, ...}
  naver_place_url: string | null;
  google_map_url: string | null;
  gbp_url: string | null;
  drive_folder_url: string | null;
  onboarding_sheet_url: string | null;
  checklist_sheet_url: string | null;
  review_sheet_url: string | null;
  start_date: string | null;
  contract_months: number | null;
  contract_end_date: string | null;
  days_since_start: number | null;
  days_until_contract_end: number | null;
  monthly_fee: number | null;
  assigned_owner_name: string | null;
  assigned_marketer_name: string | null;
  last_health_check_at: string | null;
  days_since_health_check: number | null;
  health_status: "fresh" | "stale" | "critical" | "never";
  // owner profile (마이그 20260506000005)
  country_focus: string | null;
  channel_preferences: string[] | null;
  owner_priority: string | null;
  owner_memo: string | null;
  metadata: Record<string, unknown> | null;
  active_quests: ActiveQuest[];
  active_quest_count: number;
  overdue_quest_count: number;
  recent_comms: Communication[];
  recent_issues: Communication[];
  comm_count_30d: number;
  last_comm_at: string | null;
  keyword_movement: Array<{
    keyword_id: string;
    text: string;
    region: string | null;
    rank_today: number | null;
    rank_7d_ago: number | null;
    delta: number;
  }>;
  latest_gbp:
    | {
        measured_on: string;
        views: number | null;
        calls: number | null;
        direction_requests: number | null;
        reviews_count: number | null;
        reviews_avg: number | null;
      }
    | null;
};

type DecisionBrief = {
  quest: QuestRow;
  store_360: Store360;
  computed_at: string;
};

type CommonLinks = {
  checklistSheetUrl: string | null;
  reviewSheetUrl: string | null;
};

type QuestAssigneeRow = {
  profile_id: string;
  profile: { name: string } | null;
};

type StoreToneProfile = {
  formality_level: number;
  warmth_level: number;
  emoji_level: number;
  message_length: "short" | "medium" | "detailed";
  honorific_style: string;
  preferred_opening: string | null;
  preferred_closing: string | null;
  tone_summary: string | null;
  owner_response_summary: string | null;
  sample_phrases?: string[] | null;
  avoid_phrases?: string[] | null;
  last_sample_at?: string | null;
  internal_message_count: number;
  owner_message_count: number;
  learned_from_event_count: number;
};

type ForwardingKakaoContext = {
  id: string;
  source: "notification" | "import";
  occurred_at: string;
  room_title: string | null;
  sender_name: string | null;
  sender_kind: string | null;
  message_text: string;
  status?: string | null;
};

type ForwardingDraftMeta = {
  provider: "openai" | "kimi" | "fallback";
  model: string | null;
  riskFlags: string[];
  usedContext: {
    toneProfile: boolean;
    recentKakaoCount: number;
    activeQuestCount: number;
  };
};

function forwardingDraftProviderLabel(provider: ForwardingDraftMeta["provider"]) {
  if (provider === "openai") return "GPT 초안";
  if (provider === "kimi") return "Kimi 초안";
  return "룰 기반 초안";
}

function forwardingDraftContextLabel(meta: ForwardingDraftMeta) {
  const parts: string[] = [];
  if (meta.usedContext.toneProfile) parts.push("매장 톤 반영");
  if (meta.usedContext.recentKakaoCount > 0) {
    parts.push(`최근 카톡 ${meta.usedContext.recentKakaoCount}건 참고`);
  }
  if (meta.usedContext.activeQuestCount > 0) {
    parts.push(`진행 퀘스트 ${meta.usedContext.activeQuestCount}건 참고`);
  }
  if (meta.riskFlags.length > 0) parts.push(`검수 필요 ${meta.riskFlags.length}건`);
  return parts.length > 0 ? parts.join(" · ") : "기본 문안 생성";
}

// ─── Component ──────────────────────────────────────
type Props = {
  questId: string;
  onClose?: () => void;
  /** 액션 후 부모가 데이터 새로고침할 때 호출 */
  onActionDone?: () => void;
  /** 위임 select용 직원 목록 */
  staff?: Array<{ id: string; name: string }>;
  className?: string;
};

export function QuestContextCard({
  questId,
  onClose,
  onActionDone,
  staff = [],
  className,
}: Props) {
  const [brief, setBrief] = useState<DecisionBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [reload, setReload] = useState(0); // RPC 재조회 트리거
  const [commonLinks, setCommonLinks] = useState<CommonLinks>({
    checklistSheetUrl: null,
    reviewSheetUrl: null,
  });
  const [questAssignees, setQuestAssignees] = useState<QuestAssigneeRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const supabase = createClient();
    Promise.all([
      supabase.rpc("get_decision_brief", { p_quest_id: questId }).single<DecisionBrief>(),
      supabase
        .from("app_settings")
        .select("key, value")
        .in("key", ["common_checklist_sheet_url", "common_review_sheet_url"]),
      supabase
        .from("quest_assignees")
        .select("profile_id, profile:profiles(name)")
        .eq("quest_id", questId)
        .order("is_primary", { ascending: false })
        .order("created_at"),
    ]).then(([briefResult, settingsResult, assigneesResult]) => {
        if (cancelled) return;
        const { data, error } = briefResult;
        if (error) {
          console.error("[QuestContextCard] rpc error", error);
          setBrief(null);
        } else {
          setBrief(data);
        }
        if (!settingsResult.error) {
          const rows = settingsResult.data ?? [];
          const map = new Map(rows.map((row) => [row.key, row.value]));
          setCommonLinks({
            checklistSheetUrl: map.get("common_checklist_sheet_url") ?? null,
            reviewSheetUrl: map.get("common_review_sheet_url") ?? null,
          });
        }
        if (!assigneesResult.error) {
          setQuestAssignees((assigneesResult.data ?? []) as unknown as QuestAssigneeRow[]);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [questId, reload]);

  if (loading) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-xl border bg-card p-12 text-sm text-muted-foreground",
          className,
        )}
      >
        <Loader2 className="mr-2 size-4 animate-spin" />
        매장 정보 불러오는 중…
      </div>
    );
  }

  if (!brief) {
    return (
      <div
        className={cn(
          "rounded-xl border border-urgent/30 bg-urgent-bg p-4 text-sm text-urgent",
          className,
        )}
      >
        퀘스트 정보를 불러올 수 없습니다.
      </div>
    );
  }

  const { quest, store_360: s } = brief;
  const dueLabel = formatDue(quest.due_date);
  const questAssigneeNames = questAssignees
    .map((row) => row.profile?.name ?? staff.find((member) => member.id === row.profile_id)?.name)
    .filter((name): name is string => Boolean(name));
  // 다음 퀘스트: 현재 quest 다음으로 우선순위 높은 것
  const nextQuest = (s.active_quests ?? []).find((q) => q.id !== quest.id) ?? null;

  const finishAction = (result: { ok: boolean; error?: string }): boolean => {
    setActionPending(null);
    if (!result.ok) {
      alert("처리 실패: " + (result.error ?? "알 수 없는 오류"));
      return false;
    }
    setReload((r) => r + 1);
    onActionDone?.();
    return true;
  };

  const handleComplete = async (note?: string) => {
    setActionPending("complete");
    const result = await completeQuestAction(quest.id, note || undefined);
    return finishAction(result);
  };

  const handleDelegate = async () => {
    if (staff.length === 0) {
      alert("위임 대상 직원이 없습니다.");
      return;
    }
    const list = staff.map((s, i) => `${i + 1}. ${s.name}`).join("\n");
    const choice = window.prompt(
      `[담당 지정] 누구에게 맡길까요?\n${list}\n\n번호 여러 개 입력 가능 (예: 1,3):`,
      "1",
    );
    if (!choice) return;
    const indexes = Array.from(
      new Set(
        choice
          .split(/[,\s]+/)
          .map((value) => Number(value.trim()) - 1)
          .filter((idx) => Number.isInteger(idx)),
      ),
    );
    if (
      indexes.length === 0 ||
      indexes.some((idx) => idx < 0 || idx >= staff.length)
    ) {
      alert("올바른 번호를 입력하세요. 예: 1,3");
      return;
    }
    const assigneeIds = indexes.map((idx) => staff[idx].id);
    const assigneeNames = indexes.map((idx) => staff[idx].name).join(", ");
    if (
      !window.confirm(
        `이 퀘스트 담당자를 ${assigneeNames}(으)로 지정하시겠습니까?`,
      )
    ) {
      return;
    }
    setActionPending("delegate");
    const result = await delegateQuestAction(quest.id, assigneeIds);
    finishAction(result);
  };

  const handleSkip = async () => {
    const reason = window.prompt(
      `[스킵] 사유를 입력하세요\n${quest.title}`,
      "",
    );
    if (reason === null) return;
    if (!reason.trim()) {
      alert("스킵 사유는 필수입니다.");
      return;
    }
    if (
      !window.confirm(
        `이 퀘스트를 스킵하시겠습니까?\n\n퀘스트: ${quest.title}\n사유: ${reason}`,
      )
    ) {
      return;
    }
    setActionPending("skip");
    const result = await skipQuestAction(quest.id, reason);
    finishAction(result);
  };

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-xl border bg-card shadow-sm",
        className,
      )}
    >
      {/* 좌측 strip: priority urgent면 빨강 */}
      {quest.priority === "urgent" && (
        <span aria-hidden className="absolute left-0 top-0 h-full w-1 bg-urgent" />
      )}

      {onClose && (
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="닫기"
        >
          <X className="size-4" />
        </button>
      )}

      {/* ─── 헤더: 풀 너비 (퀘스트 자체 + 매장 한 줄) ─── */}
      <header className="grid gap-3 border-b bg-gradient-to-r from-card via-card to-primary/5 px-3 py-4 sm:px-6 md:grid-cols-[minmax(0,1fr)_180px] md:gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {quest.process_step && <StepBadge code={quest.process_step} />}
            <PriorityBadge priority={quest.priority} />
            {dueLabel && (
              <StatusBadge tone={dueLabel.tone} size="md">
                {dueLabel.label}
              </StatusBadge>
            )}
            {quest.is_pinned && (
              <StatusBadge tone="warning" size="sm">
                <Pin className="size-3" /> 핀
              </StatusBadge>
            )}
            {quest.source === "sheet_missing" && (
              <StatusBadge tone="info" size="sm">시트 누락</StatusBadge>
            )}
            {quest.status === "blocked" && (
              <StatusBadge tone="warning" size="sm">차단</StatusBadge>
            )}
          </div>
          <h2 className="break-keep text-lg font-semibold leading-tight sm:text-xl">{quest.title}</h2>
          {quest.description && (
            <p className="max-w-4xl text-sm leading-relaxed text-muted-foreground">
              {quest.description}
            </p>
          )}
          {quest.blocked_reason && (
            <p className="inline-flex rounded-md bg-urgent-bg px-2 py-1 text-xs text-urgent">
              차단됨: {quest.blocked_reason}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            <span className="text-foreground font-medium">{s.store_name}</span>
            <StoreStatusBadge status={s.status as "active"} size="sm" />
            {s.type_label && <span className="ml-1.5">· {s.type_label}</span>}
            {s.assigned_owner_name && (
              <span className="ml-1.5">· 담당 {s.assigned_owner_name}</span>
            )}
            {questAssigneeNames.length > 0 && (
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="ml-1.5">· 퀘스트 담당</span>
                {questAssigneeNames.map((name) => (
                  <StatusBadge key={name} tone="brand" size="sm">
                    {name}
                  </StatusBadge>
                ))}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-start justify-between gap-3 text-xs sm:block md:text-right">
          <div className="font-medium uppercase tracking-wider text-muted-foreground">
            날짜
          </div>
          <div className="space-y-1 sm:mt-1.5">
            <div>
              <span className="text-muted-foreground">발급: </span>
              <span className="font-semibold">{quest.created_at.slice(0, 10)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">마감: </span>
              <span
                className={cn(
                  "font-semibold",
                  dueLabel?.tone === "urgent" && "text-urgent",
                  dueLabel?.tone === "warning" && "text-warning",
                )}
              >
                {quest.due_date ?? "미정"}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* ─── 본문: 실행 우선 — 처리 패널 / 맥락 패널 ─── */}
      <div className="grid gap-px bg-border md:grid-cols-[minmax(0,1.45fr)_minmax(260px,0.9fr)] xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.95fr)]">
        <QuestActionPane
          quest={quest}
          store={s}
          nextQuest={nextQuest}
          commonLinks={commonLinks}
          actionPending={actionPending}
          onComplete={handleComplete}
          onDelegate={handleDelegate}
          onSkip={handleSkip}
          onStoreMemoSaved={() => setReload((r) => r + 1)}
        />
        <QuestContextPane store={s} currentQuestId={quest.id} />
      </div>
    </article>
  );
}

// ═══════════════════════════════════════════════════════
// 1. 왼쪽 — 퀘스트
// ═══════════════════════════════════════════════════════
function QuestActionPane({
  quest,
  store: s,
  nextQuest,
  commonLinks,
  actionPending,
  onComplete,
  onDelegate,
  onSkip,
  onStoreMemoSaved,
}: {
  quest: QuestRow;
  store: Store360;
  nextQuest: ActiveQuest | null;
  commonLinks: CommonLinks;
  actionPending: string | null;
  onComplete: (note?: string) => Promise<boolean>;
  onDelegate: () => void | Promise<void>;
  onSkip: () => void | Promise<void>;
  onStoreMemoSaved: () => void;
}) {
  const notes = getQuestNotes(quest.metadata);
  const storeMemo = getStoreMemo(s.metadata);
  const storeMemoSavedAt = getStoreMemoSavedAt(s.metadata);
  const checklistSheetUrl = s.checklist_sheet_url ?? commonLinks.checklistSheetUrl;
  const reviewSheetUrl = s.review_sheet_url ?? commonLinks.reviewSheetUrl;
  const [completeOpen, setCompleteOpen] = useState(false);

  return (
    <section className="space-y-4 bg-card p-3 sm:space-y-5 sm:p-5">
      <DataRow icon={ExternalLink} label="바로가기 링크">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <ExternalLinkButton
            url={quest.source === "sheet_missing" ? quest.external_url : checklistSheetUrl}
            label="체크리스트 시트"
            colorClass="bg-info-bg text-info hover:bg-info-bg/80 border-info/30"
            prominent
          />
          <ExternalLinkButton
            url={reviewSheetUrl}
            label="리뷰 시트"
            colorClass="bg-urgent-bg text-urgent hover:bg-urgent-bg/80 border-urgent/30"
            prominent
          />
          <ExternalLinkButton
            url={s.gbp_url}
            label="구글 프로필"
            colorClass="bg-info-bg text-info hover:bg-info-bg/80 border-info/30"
            prominent
          />
          <ExternalLinkButton
            url={`/app/stores/${s.store_id}`}
            label="매장 상세"
            colorClass="bg-primary/5 text-primary hover:bg-primary/10 border-primary/30"
            prominent
            external={false}
          />
          <ExternalLinkButton
            url={s.drive_folder_url}
            label="드라이브 자료"
            colorClass="bg-warning-bg text-warning hover:bg-warning-bg/80 border-warning/30"
          />
          <ExternalLinkButton
            url={s.onboarding_sheet_url}
            label="온보딩 시트"
            colorClass="bg-violet-50 text-violet-700 hover:bg-violet-100 border-violet-200"
          />
          <ExternalLinkButton
            url={s.naver_place_url}
            label="네이버 플레이스"
            colorClass="bg-success-bg text-success hover:bg-success-bg/80 border-success/30"
          />
          <ExternalLinkButton
            url={s.google_map_url}
            label="구글맵"
            colorClass="bg-info-bg text-info hover:bg-info-bg/80 border-info/30"
          />
        </div>
      </DataRow>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <ForwardingAssistant store={s} />

        <div className="space-y-3">
          <DataRow icon={Sparkles} label="AI 요약">
            <AISummary quest={quest} store={s} />
          </DataRow>

          {nextQuest && (
            <DataRow icon={ArrowRight} label="이거 끝나면 다음">
              <div className="rounded-md border bg-background p-2">
                <div className="flex items-center gap-1.5 text-xs">
                  {nextQuest.process_step && (
                    <StepBadge code={nextQuest.process_step} size="sm" />
                  )}
                  {nextQuest.priority === "urgent" && (
                    <PriorityBadge priority="urgent" size="sm" />
                  )}
                </div>
                <div className="mt-1 text-sm font-medium">{nextQuest.title}</div>
                {nextQuest.due_date && (
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    마감 {nextQuest.due_date}
                  </div>
                )}
              </div>
            </DataRow>
          )}

          {notes.length > 0 && (
            <DataRow icon={StickyNote} label="퀘스트 메모">
              <ul className="space-y-1.5">
                {notes
                  .slice(-2)
                  .reverse()
                  .map((note, index) => (
                    <li
                      key={`${note.at}-${index}`}
                      className="rounded-md bg-muted/40 px-2 py-1.5 text-xs"
                    >
                      <p className="whitespace-pre-wrap text-foreground">{note.text}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {formatNoteTime(note.at)}
                      </p>
                    </li>
                  ))}
              </ul>
            </DataRow>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="sticky bottom-0 z-20 -mx-3 grid grid-cols-2 gap-2 border-t bg-card/95 px-3 py-3 shadow-[0_-10px_30px_rgba(15,23,42,0.10)] backdrop-blur sm:-mx-5 sm:grid-cols-4 sm:px-5 lg:static lg:col-span-2 lg:mx-0 lg:bg-transparent lg:p-0 lg:pt-4 lg:shadow-none lg:backdrop-blur-none">
          {quest.source === "sheet_missing" ? (
            <a
              href={quest.external_url ?? "#"}
              target="_blank"
              rel="noopener"
              className="col-span-2 inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 sm:col-span-4"
            >
              <ExternalLink className="size-4" />
              체크리스트에서 처리
            </a>
          ) : (
            <Button
              onClick={() => setCompleteOpen((v) => !v)}
              disabled={actionPending !== null}
              className="col-span-2 min-h-9 gap-1.5 sm:col-span-2"
              size="sm"
            >
              {actionPending === "complete" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              완료하고 다음으로
            </Button>
          )}
          <Button
            onClick={onDelegate}
            disabled={actionPending !== null}
            variant="outline"
            size="sm"
            className="min-h-9 gap-1"
          >
            {actionPending === "delegate" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <UserPlus2 className="size-3.5" />
            )}
            담당 지정
          </Button>
          <Button
            onClick={onSkip}
            disabled={actionPending !== null}
            variant="ghost"
            size="sm"
            className="min-h-9 gap-1"
          >
            {actionPending === "skip" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Ban className="size-3.5" />
            )}
            스킵
          </Button>
        </div>
      </div>

      {completeOpen && quest.source !== "sheet_missing" && (
        <CompleteQuestPanel
          quest={quest}
          storeId={s.store_id}
          actionPending={actionPending}
          onComplete={async (note) => {
            const ok = await onComplete(note);
            if (ok) setCompleteOpen(false);
            return ok;
          }}
          onCommunicationSaved={onStoreMemoSaved}
        />
      )}

      <DataRow
        icon={MessageSquare}
        label="연락 기록"
      >
        <QuickCommunicationLogger
          storeId={s.store_id}
          onSaved={onStoreMemoSaved}
        />
      </DataRow>

      <DataRow
        icon={StickyNote}
        label="매장 메모"
        description={
          storeMemoSavedAt
            ? `최근 저장 ${formatNoteTime(storeMemoSavedAt)}`
            : "최근 저장 기록 없음"
        }
      >
        <StoreMemoEditor
          storeId={s.store_id}
          initialMemo={storeMemo}
          onSaved={onStoreMemoSaved}
        />
      </DataRow>
    </section>
  );
}

// ═══════════════════════════════════════════════════════
// 2. 오른쪽 — 매장&업주 정보
// ═══════════════════════════════════════════════════════
function QuestContextPane({
  store: s,
  currentQuestId,
}: {
  store: Store360;
  currentQuestId: string;
}) {
  const otherQuests = (s.active_quests ?? []).filter((q) => q.id !== currentQuestId);

  return (
    <aside className="space-y-4 bg-card p-3 sm:p-5">
      <PaneHeader icon={Crown} label="매장&업주 정보" />

      <DataRow icon={Phone} label="최근 연락">
        {s.recent_comms.length === 0 ? (
          <span className="text-sm text-muted-foreground">기록 없음</span>
        ) : (
          <ul className="space-y-1.5">
            {s.recent_comms.slice(0, 3).map((c) => (
              <li key={c.id} className="space-y-0.5 rounded-md bg-muted/35 px-2 py-1.5 text-xs">
                <div className="flex items-center gap-1.5">
                  <StatusBadge
                    tone={c.direction === "outbound" ? "info" : "neutral"}
                    size="sm"
                  >
                    {c.channel_code}
                  </StatusBadge>
                  <span className="text-muted-foreground">
                    {formatRelative(c.occurred_at)}
                  </span>
                </div>
                <p className="text-foreground">{c.summary}</p>
              </li>
            ))}
          </ul>
        )}
      </DataRow>

      <DataRow icon={AlertTriangle} label="최근 이슈" tone="warning">
        {s.recent_issues.length === 0 ? (
          <span className="text-sm text-muted-foreground">기록 없음</span>
        ) : (
          <ul className="space-y-1.5">
            {s.recent_issues.slice(0, 3).map((c) => (
              <li key={c.id} className="rounded-md bg-warning-bg px-2 py-1.5 text-xs">
                <p className="font-medium text-warning">{c.summary}</p>
                {c.next_action && (
                  <p className="mt-0.5 text-warning">
                    다음: {c.next_action}
                    {c.next_action_date && (
                      <span className="ml-1 font-mono">{c.next_action_date}</span>
                    )}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </DataRow>

      <div className="space-y-2 rounded-md bg-muted/35 p-3 text-xs">
        <div>
          <div className="text-sm font-semibold">{s.owner_name ?? "—"}</div>
          <div className="mt-1 space-y-0.5 text-muted-foreground">
            {s.owner_phone && (
              <div className="flex items-center gap-1">
                <Phone className="size-3" />
                <span className="font-mono break-all">{s.owner_phone}</span>
              </div>
            )}
            {s.owner_email && (
              <div className="flex items-center gap-1">
                <Mail className="size-3" />
                <span className="break-all">{s.owner_email}</span>
              </div>
            )}
          </div>
        </div>
        <div className="border-t pt-2">
          {s.owner_priority ? (
            <div>
              <span className="text-muted-foreground">우선시</span>
              <PriorityToneLabel priority={s.owner_priority} />
            </div>
          ) : (
            <span className="text-muted-foreground">우선시 항목 없음</span>
          )}
          {s.owner_memo && (
            <div className="mt-2">
              <div className="mb-1 text-muted-foreground">메모</div>
              <div className="rounded-md bg-background px-2 py-1.5 text-foreground">
                {s.owner_memo}
              </div>
            </div>
          )}
          {(s.country_focus || (s.channel_preferences && s.channel_preferences.length > 0)) && (
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {s.country_focus && (
                <StatusBadge tone="info" size="sm">{s.country_focus}</StatusBadge>
              )}
              {s.channel_preferences?.map((c) => (
                <StatusBadge key={c} tone="neutral" size="sm">
                  {c}
                </StatusBadge>
              ))}
            </div>
          )}
        </div>
      </div>

      <MainKeywordsI18n store={s} />

      <DataRow icon={CalendarClock} label="관리회차&관리기간">
        <div className="space-y-1.5">
          {s.current_round != null && (
            <StatusBadge tone="info" size="sm">
              {s.current_round}회차
            </StatusBadge>
          )}
          {s.start_date ? (
            <div className="space-y-0.5">
              <div className="text-sm font-medium">
                {s.start_date} → {s.contract_end_date ?? "—"}
              </div>
              <div className="text-xs text-muted-foreground">
                D+{s.days_since_start}
                {s.contract_months && <> · 약정 {s.contract_months}개월</>}
                {s.days_until_contract_end != null && (
                  <span
                    className={cn(
                      "ml-1",
                      s.days_until_contract_end <= 30 && "font-medium text-warning",
                    )}
                  >
                    · 남 {s.days_until_contract_end}일
                  </span>
                )}
              </div>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">미시작</span>
          )}
        </div>
      </DataRow>

      <DataRow icon={Activity} label="매장 점검">
        <HealthStatus status={s.health_status} days={s.days_since_health_check} />
      </DataRow>

      <DataRow icon={CheckCircle2} label={`진행 중 ${s.active_quest_count}건`}>
        {otherQuests.length === 0 ? (
          <span className="text-sm text-muted-foreground">현재 1건만 진행</span>
        ) : (
          <ul className="space-y-1.5">
            {otherQuests.slice(0, 4).map((q) => (
              <li key={q.id} className="flex items-start gap-1.5 text-xs">
                <span className="line-clamp-1 flex-1">{q.title}</span>
                {q.due_date && (
                  <span className="shrink-0 text-muted-foreground">
                    {q.due_date.slice(5)}
                  </span>
                )}
              </li>
            ))}
            {otherQuests.length > 4 && (
              <li className="text-xs text-muted-foreground">
                +{otherQuests.length - 4}건 더
              </li>
            )}
          </ul>
        )}
      </DataRow>

    </aside>
  );
}

function CompleteQuestPanel({
  quest,
  storeId,
  actionPending,
  onComplete,
  onCommunicationSaved,
}: {
  quest: QuestRow;
  storeId: string;
  actionPending: string | null;
  onComplete: (note?: string) => Promise<boolean>;
  onCommunicationSaved: () => void;
}) {
  const [note, setNote] = useState("");
  const [logCommunication, setLogCommunication] = useState(
    shouldSuggestCommunicationLog(quest),
  );
  const [commSummary, setCommSummary] = useState(defaultCompletionCommSummary(quest));
  const [nextAction, setNextAction] = useState("");
  const [nextActionDate, setNextActionDate] = useState("");
  const [savingComm, setSavingComm] = useState(false);

  useEffect(() => {
    setNote("");
    setLogCommunication(shouldSuggestCommunicationLog(quest));
    setCommSummary(defaultCompletionCommSummary(quest));
    setNextAction("");
    setNextActionDate("");
  }, [quest]);

  const pending = savingComm || actionPending === "complete";

  const submit = async () => {
    if (logCommunication) {
      if (!commSummary.trim()) {
        alert("연락 요약을 입력해주세요.");
        return;
      }
      setSavingComm(true);
      const commResult = await addCommunicationAction({
        storeId,
        channelCode: "kakao",
        direction: "outbound",
        summary: commSummary,
        nextAction: nextAction || null,
        nextActionDate: nextActionDate || null,
      });
      setSavingComm(false);
      if (!commResult.ok) {
        alert("연락 기록 저장 실패: " + commResult.error);
        return;
      }
      onCommunicationSaved();
    }

    await onComplete(note || undefined);
  };

  return (
    <DataRow icon={CheckCircle2} label="완료 처리">
      <div className="space-y-3 rounded-md border border-success/30 bg-success-bg/45 p-3">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="완료 메모"
          className="min-h-[68px] w-full resize-y rounded-md border bg-background px-2 py-1.5 text-xs leading-relaxed outline-none focus:ring-1 focus:ring-success"
        />
        <label className="flex items-center gap-2 text-xs font-medium text-foreground">
          <input
            type="checkbox"
            checked={logCommunication}
            onChange={(e) => setLogCommunication(e.target.checked)}
            className="size-4 rounded border"
          />
          업주 연락 기록도 남기기
        </label>
        {logCommunication && (
          <div className="space-y-2">
            <textarea
              value={commSummary}
              onChange={(e) => setCommSummary(e.target.value)}
              placeholder="업주에게 보낸 내용 요약"
              className="min-h-[72px] w-full resize-y rounded-md border bg-background px-2 py-1.5 text-xs leading-relaxed outline-none focus:ring-1 focus:ring-success"
            />
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_132px]">
              <input
                value={nextAction}
                onChange={(e) => setNextAction(e.target.value)}
                placeholder="후속 액션"
                className="h-8 rounded-md border bg-background px-2 text-xs outline-none focus:border-foreground/30"
              />
              <input
                type="date"
                value={nextActionDate}
                onChange={(e) => setNextActionDate(e.target.value)}
                className="h-8 rounded-md border bg-background px-2 text-xs outline-none focus:border-foreground/30"
              />
            </div>
          </div>
        )}
        <Button
          type="button"
          size="sm"
          className="w-full gap-1.5"
          onClick={submit}
          disabled={pending}
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="size-3.5" />
          )}
          완료 저장
        </Button>
      </div>
    </DataRow>
  );
}

function shouldSuggestCommunicationLog(quest: QuestRow) {
  const text = `${quest.process_step ?? ""} ${quest.title} ${quest.description ?? ""}`;
  return /(연락|카톡|전송|송부|요청|컨펌|안내|포워딩|후속|자료|견적서|온보딩)/.test(text);
}

function defaultCompletionCommSummary(quest: QuestRow) {
  if (shouldSuggestCommunicationLog(quest)) {
    return `${quest.title} 처리 및 업주 안내`;
  }
  return "";
}

const QUICK_COMM_CHANNELS = [
  { code: "kakao", label: "카카오톡" },
  { code: "call", label: "전화" },
  { code: "meeting", label: "대면 미팅" },
  { code: "email", label: "이메일" },
  { code: "other", label: "기타" },
];

function QuickCommunicationLogger({
  storeId,
  onSaved,
}: {
  storeId: string;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [channelCode, setChannelCode] = useState("kakao");
  const [direction, setDirection] = useState<"inbound" | "outbound">("outbound");
  const [summary, setSummary] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [nextActionDate, setNextActionDate] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!summary.trim()) return;
    setSaving(true);
    const result = await addCommunicationAction({
      storeId,
      channelCode,
      direction,
      summary,
      nextAction: nextAction || null,
      nextActionDate: nextActionDate || null,
    });
    setSaving(false);
    if (!result.ok) {
      alert("연락 기록 저장 실패: " + result.error);
      return;
    }
    setSummary("");
    setNextAction("");
    setNextActionDate("");
    setOpen(false);
    onSaved();
  };

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 gap-1.5 px-2 text-xs"
        onClick={() => setOpen(true)}
      >
        <MessageSquare className="size-3.5" />
        연락 기록 추가
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-md border bg-background p-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <select
          className="h-8 rounded-md border bg-background px-2 text-xs outline-none focus:border-foreground/30"
          value={channelCode}
          onChange={(e) => setChannelCode(e.target.value)}
        >
          {QUICK_COMM_CHANNELS.map((channel) => (
            <option key={channel.code} value={channel.code}>
              {channel.label}
            </option>
          ))}
        </select>
        <select
          className="h-8 rounded-md border bg-background px-2 text-xs outline-none focus:border-foreground/30"
          value={direction}
          onChange={(e) => setDirection(e.target.value as "inbound" | "outbound")}
        >
          <option value="outbound">우리 → 업주</option>
          <option value="inbound">업주 → 우리</option>
        </select>
      </div>
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="연락 요약"
        className="min-h-[68px] w-full resize-y rounded-md border bg-background px-2 py-1.5 text-xs leading-relaxed outline-none focus:ring-1 focus:ring-primary"
      />
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_132px]">
        <input
          value={nextAction}
          onChange={(e) => setNextAction(e.target.value)}
          placeholder="다음 액션"
          className="h-8 rounded-md border bg-background px-2 text-xs outline-none focus:border-foreground/30"
        />
        <input
          type="date"
          value={nextActionDate}
          onChange={(e) => setNextActionDate(e.target.value)}
          className="h-8 rounded-md border bg-background px-2 text-xs outline-none focus:border-foreground/30"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-[11px]"
          onClick={() => setOpen(false)}
          disabled={saving}
        >
          닫기
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7 gap-1 px-2 text-[11px]"
          onClick={save}
          disabled={saving || !summary.trim()}
        >
          {saving && <Loader2 className="size-3 animate-spin" />}
          저장
        </Button>
      </div>
    </div>
  );
}

function StoreMemoEditor({
  storeId,
  initialMemo,
  onSaved,
}: {
  storeId: string;
  initialMemo: string | null;
  onSaved: () => void;
}) {
  const [memo, setMemo] = useState(initialMemo ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMemo(initialMemo ?? "");
  }, [initialMemo]);

  const changed = memo.trim() !== (initialMemo ?? "").trim();

  const save = async () => {
    setSaving(true);
    const result = await updateStoreMemoAction(storeId, memo);
    setSaving(false);
    if (!result.ok) {
      alert("매장 메모 저장 실패: " + result.error);
      return;
    }
    onSaved();
  };

  return (
    <div className="space-y-2">
      <textarea
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        placeholder="기록 없음"
        className="min-h-[92px] w-full resize-y rounded-md border bg-background px-2 py-1.5 text-xs leading-relaxed outline-none focus:ring-1 focus:ring-primary"
      />
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1 px-2 text-[11px]"
          onClick={save}
          disabled={saving || !changed}
        >
          {saving && <Loader2 className="size-3 animate-spin" />}
          저장
        </Button>
      </div>
    </div>
  );
}

// 다국어 라벨 (사용자 비전)
const I18N_LABELS: Record<string, string> = {
  ko: "한국어",
  en: "영어",
  ja: "일본어",
  zh_tw: "중국어 번체",
  zh_cn: "중국어 간체",
  vi: "베트남어",
  th: "태국어",
};
const I18N_ORDER = ["ko", "en", "ja", "zh_tw", "zh_cn", "vi", "th"];

function MainKeywordsI18n({ store: s }: { store: Store360 }) {
  // 우선순위: main_keywords_i18n (jsonb) → 없으면 main_keyword fallback
  const i18n = s.main_keywords_i18n;
  const hasI18n = i18n && Object.keys(i18n).length > 0;
  const fallbackText = s.main_keyword;

  if (!hasI18n && !fallbackText) {
    return null;
  }

  return (
    <DataRow icon={TrendingUp} label="현재 메인 키워드">
      {hasI18n ? (
        <ul className="space-y-0.5">
          {I18N_ORDER.filter((lang) => i18n![lang]).map((lang) => (
            <li key={lang} className="flex items-baseline gap-1.5 text-sm">
              <span className="w-20 shrink-0 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {I18N_LABELS[lang] ?? lang}
              </span>
              <span className="font-semibold">{i18n![lang]}</span>
            </li>
          ))}
          {/* 매핑 안 된 언어 키도 표시 */}
          {Object.keys(i18n!)
            .filter((lang) => !I18N_ORDER.includes(lang))
            .map((lang) => (
              <li key={lang} className="flex items-baseline gap-1.5 text-sm">
                <span className="w-20 shrink-0 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {lang}
                </span>
                <span className="font-semibold">{i18n![lang]}</span>
              </li>
            ))}
        </ul>
      ) : (
        <div className="space-y-0.5">
          <div className="text-sm font-semibold">{fallbackText}</div>
          {s.main_keyword_translation && (
            <div className="text-xs text-muted-foreground">
              ↳ {s.main_keyword_translation}
            </div>
          )}
        </div>
      )}
    </DataRow>
  );
}

function ExternalLinkButton({
  url,
  label,
  colorClass,
  prominent = false,
  external = true,
}: {
  url: string | null | undefined;
  label: string;
  colorClass: string;
  prominent?: boolean;
  external?: boolean;
}) {
  if (!url) {
    return (
      <span
        className={cn(
          "flex items-center justify-center rounded-md border border-dashed bg-muted/30 text-muted-foreground",
          prominent ? "py-2 text-xs" : "py-1.5 text-[11px]",
        )}
      >
        {label} 없음
      </span>
    );
  }
  return (
    <a
      href={url}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className={cn(
        "flex items-center justify-center gap-1 rounded-md border font-medium transition-colors",
        prominent ? "py-2 text-xs font-semibold" : "py-1.5 text-[11px]",
        colorClass,
      )}
    >
      {label} <ExternalLink className={prominent ? "size-3.5" : "size-3"} />
    </a>
  );
}

// ═══════════════════════════════════════════════════════
// 포워딩 어시스턴트 — 본사 메시지/공지를 업주 톤에 맞춰 카톡 멘트로 변환
// Phase 1: 룰 기반 (owner_priority 반영)
// Phase 2: LLM 한 줄 (Q4 보류 풀리면 연결)
// ═══════════════════════════════════════════════════════
function ForwardingAssistant({ store: s }: { store: Store360 }) {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [draftMeta, setDraftMeta] = useState<ForwardingDraftMeta | null>(null);
  const [toneProfile, setToneProfile] = useState<StoreToneProfile | null>(null);
  const [recentKakao, setRecentKakao] = useState<ForwardingKakaoContext[]>([]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    Promise.all([
      supabase
        .from("store_tone_profiles")
        .select(
          "formality_level, warmth_level, emoji_level, message_length, honorific_style, preferred_opening, preferred_closing, tone_summary, owner_response_summary, sample_phrases, avoid_phrases, last_sample_at, internal_message_count, owner_message_count, learned_from_event_count",
        )
        .eq("store_id", s.store_id)
        .maybeSingle(),
      supabase
        .from("kakao_notification_events")
        .select("id, room_title, sender_name, sender_kind, message_text, posted_at, received_at, status")
        .eq("store_id", s.store_id)
        .order("received_at", { ascending: false })
        .limit(10),
      supabase
        .from("kakao_conversation_messages")
        .select("id, room_title, sender_name, sender_kind, message_text, sent_at, created_at")
        .eq("store_id", s.store_id)
        .order("sent_at", { ascending: false })
        .limit(10),
    ]).then(([toneResult, notificationResult, importResult]) => {
        if (cancelled) return;
        if (!toneResult.error && toneResult.data) {
          setToneProfile(toneResult.data as StoreToneProfile);
        } else {
          setToneProfile(null);
        }
        const notificationRows = (notificationResult.data ?? []).map((row) => ({
          id: row.id,
          source: "notification" as const,
          occurred_at: row.posted_at ?? row.received_at,
          room_title: row.room_title,
          sender_name: row.sender_name,
          sender_kind: row.sender_kind,
          message_text: row.message_text,
          status: row.status,
        }));
        const importRows = (importResult.data ?? []).map((row) => ({
          id: row.id,
          source: "import" as const,
          occurred_at: row.sent_at ?? row.created_at,
          room_title: row.room_title,
          sender_name: row.sender_name,
          sender_kind: row.sender_kind,
          message_text: row.message_text,
          status: null,
        }));
        setRecentKakao(
          [...notificationRows, ...importRows]
            .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
            .slice(0, 8),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [s.store_id]);

  const handleGenerate = async () => {
    if (!input.trim()) {
      setOutput("");
      setDraftMeta(null);
      return;
    }
    setGenerating(true);
    try {
      const result = await generateForwardingDraftAction({
        storeId: s.store_id,
        rawText: input,
      });
      if (!result.ok) {
        alert("멘트 생성 실패: " + result.error);
        return;
      }
      setOutput(result.draft);
      setDraftMeta({
        provider: result.provider,
        model: result.model,
        riskFlags: result.riskFlags,
        usedContext: result.usedContext,
      });
    } catch (error) {
      alert("멘트 생성 실패: " + (error instanceof Error ? error.message : "알 수 없는 오류"));
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      alert("클립보드 복사 실패");
    }
  };

  return (
    <DataRow icon={MessageSquare} label="포워딩 어시스턴트">
      <div className="space-y-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="포워딩할 내용을 적어주세요."
          className="w-full rounded-md border bg-background px-2 py-1.5 text-xs leading-relaxed outline-none focus:ring-1 focus:ring-primary"
          rows={3}
        />
        <Button
          size="sm"
          onClick={handleGenerate}
          disabled={!input.trim() || generating}
          className="w-full gap-1"
        >
          {generating ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          포워딩 멘트 생성
        </Button>
        {toneProfile && (
          <div className="rounded-md border bg-muted/30 px-2 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
            매장 톤 프로필: {toneProfile.tone_summary ?? "학습 중"} · 예시{" "}
            {toneProfile.learned_from_event_count}건
            {toneProfile.owner_response_summary && (
              <> · {toneProfile.owner_response_summary}</>
            )}
          </div>
        )}
        {recentKakao.length > 0 && (
          <div className="rounded-md border bg-muted/20 p-2">
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              최근 카톡 맥락
            </div>
            <ul className="space-y-1">
              {recentKakao.slice(0, 3).map((message) => (
                <li key={`${message.source}-${message.id}`} className="text-[11px] leading-relaxed">
                  <span className="font-medium text-foreground">
                    {message.sender_name ?? "발신자 미상"}
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {formatRelative(message.occurred_at)}
                    {message.room_title ? ` · ${message.room_title}` : ""}
                  </span>
                  <div className="line-clamp-2 text-muted-foreground">
                    {message.message_text}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="space-y-2 rounded-md border border-primary/25 bg-primary/5 p-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-[10px] font-medium uppercase tracking-wider text-primary">
                포워딩 결과
              </div>
              {draftMeta && (
                <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                  {forwardingDraftProviderLabel(draftMeta.provider)}
                  {draftMeta.model ? ` · ${draftMeta.model}` : ""}
                </div>
              )}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-full gap-1 px-2 text-[11px] sm:h-7 sm:w-auto"
              onClick={handleCopy}
              disabled={!output}
            >
              <Copy className="size-3" />
              {copied ? "복사됨" : "멘트 복사"}
            </Button>
          </div>
          <textarea
            value={output}
            onChange={(e) => setOutput(e.target.value)}
            placeholder="생성된 포워딩 멘트가 여기에 표시됩니다."
            className="min-h-[132px] w-full resize-y rounded-md border bg-background px-2 py-1.5 text-xs leading-relaxed outline-none"
            onFocus={(e) => e.currentTarget.select()}
          />
          {draftMeta && (
            <div className="text-[11px] leading-relaxed text-muted-foreground">
              {forwardingDraftContextLabel(draftMeta)}
            </div>
          )}
        </div>
      </div>
    </DataRow>
  );
}

// ═══════════════════════════════════════════════════════
// AI — 히스토리 요약 + 1달 방향
// ═══════════════════════════════════════════════════════
function AISummary({
  quest,
  store: s,
}: {
  quest: QuestRow;
  store: Store360;
}) {
  const history = generateHistorySummary(s);
  const direction = generateNextMonthDirection(quest, s);

  return (
    <div className="rounded-md border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-3">
      <div className="space-y-2.5">
        {/* 히스토리 요약 */}
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            최근 히스토리
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-foreground">{history}</p>
        </div>

        {/* 앞으로 1달 방향 */}
        <div className="border-t border-primary/15 pt-2">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            앞으로 한 달 방향
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-foreground">{direction}</p>
        </div>
      </div>
    </div>
  );
}

/** 최근 활동·통신을 1~2문장으로 요약. Phase 2에서 LLM으로 교체. */
function generateHistorySummary(s: Store360): string {
  const parts: string[] = [];

  // 최근 통신
  if (s.recent_comms.length > 0) {
    const last = s.recent_comms[0];
    const ago = formatRelative(last.occurred_at);
    parts.push(
      `${ago} ${last.channel_code} (${last.direction === "outbound" ? "발신" : "수신"}): ${last.summary}`,
    );
  } else {
    parts.push("최근 30일 통신 기록 없음.");
  }

  // 30일 누적
  if (s.comm_count_30d > 0) {
    parts.push(`최근 30일 ${s.comm_count_30d}회 접촉.`);
  }

  // 진행 중 quest
  if (s.active_quest_count > 0) {
    parts.push(
      `진행 중 ${s.active_quest_count}건${
        s.overdue_quest_count > 0 ? ` (연체 ${s.overdue_quest_count})` : ""
      }.`,
    );
  }

  // 최근 이슈
  if (s.recent_issues.length > 0) {
    parts.push(`미해결 이슈 ${s.recent_issues.length}건 (후속 액션 필요).`);
  }

  return parts.join(" ");
}

/** 앞으로 1달 영업자가 해야 할 핵심 방향. */
function generateNextMonthDirection(quest: QuestRow, s: Store360): string {
  const items: string[] = [];

  // 1. 재계약 임박이 가장 우선
  if (s.days_until_contract_end != null && s.days_until_contract_end <= 30) {
    items.push(
      `🔁 약정 ${s.days_until_contract_end}일 남음 — 갱신 의사 확인 + 만족도 점검 + 차기 견적 준비.`,
    );
  } else if (
    s.days_until_contract_end != null &&
    s.days_until_contract_end <= 60
  ) {
    items.push(
      `📅 약정 ${s.days_until_contract_end}일 남음 — 다음 달부터 재계약 분위기 사전 점검.`,
    );
  }

  // 2. 매장 점검
  if (s.health_status === "critical") {
    items.push("⚠ 14일+ 점검 누락 — 통화·방문으로 즉시 상태 확인.");
  } else if (s.health_status === "stale") {
    items.push("📞 7일+ 점검 필요 — 안부 연락 한 번.");
  }

  // 3. 병의원·약국 사전 컨펌
  if (
    quest.process_step === "B.5b" ||
    (s.type_code === "clinic" || s.type_code === "pharm")
  ) {
    items.push("📋 4주치 아티클 컨펌 필요 — 완료되어야 시작일 확정 가능.");
  }

  // 4. 미해결 이슈
  if (s.recent_issues.length > 0) {
    items.push(
      `🗨️ 미해결 이슈 ${s.recent_issues.length}건 — 다음 통신에서 후속 처리.`,
    );
  }

  // 5. 키워드 하락
  const droppingKeywords = (s.keyword_movement ?? []).filter(
    (k) => k.delta < -2,
  );
  if (droppingKeywords.length > 0) {
    items.push(
      `📉 키워드 ${droppingKeywords[0].text} 등 ${droppingKeywords.length}개 하락 — 콘텐츠 보강 검토.`,
    );
  }

  // 6. 통신 끊김
  if (s.last_comm_at == null || daysAgo(s.last_comm_at) > 14) {
    items.push("📱 최근 통신 14일+ — 안부 카톡으로 라포 유지.");
  }

  // 7. 디폴트 (다 정상)
  if (items.length === 0) {
    const tone =
      s.owner_priority === "authority"
        ? "격식 있는 톤으로"
        : s.owner_priority === "rapport"
        ? "친근한 톤으로"
        : "";
    items.push(
      `${tone} 정상 운영 사이클 유지. 주간보고·정기 점검 빠뜨리지 않도록 주의.`,
    );
  }

  return items.slice(0, 3).join(" ");
}

// ═══════════════════════════════════════════════════════
// Sub Components
// ═══════════════════════════════════════════════════════

function PaneHeader({
  icon: Icon,
  label,
  tone = "default",
}: {
  icon: typeof Activity;
  label: string;
  tone?: "default" | "primary";
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 border-b pb-2 text-xs font-semibold uppercase tracking-wider",
        tone === "primary" ? "text-primary" : "text-muted-foreground",
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </div>
  );
}

function DataRow({
  icon: Icon,
  label,
  description,
  tone = "default",
  children,
}: {
  icon: typeof Activity;
  label: string;
  description?: React.ReactNode;
  tone?: "default" | "warning";
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          className={cn(
            "flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider",
            tone === "warning" ? "text-warning" : "text-muted-foreground",
          )}
        >
          <Icon className="size-3" />
          {label}
        </div>
        {description && (
          <div className="text-[11px] text-muted-foreground">{description}</div>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

function HealthStatus({
  status,
  days,
}: {
  status: Store360["health_status"];
  days: number | null;
}) {
  const config = {
    fresh: { label: "신선", tone: "success" as const, hint: days != null ? `${days}일 전` : null },
    stale: { label: "점검 필요", tone: "warning" as const, hint: `${days}일 전 (7일+)` },
    critical: { label: "즉시 점검", tone: "urgent" as const, hint: `${days}일 전 (14일+)` },
    never: { label: "미체크", tone: "urgent" as const, hint: "최초 점검 필요" },
  }[status];

  return (
    <div className="flex items-center gap-1.5">
      <StatusBadge tone={config.tone} size="md">
        {config.label}
      </StatusBadge>
      {config.hint && (
        <span className="text-xs text-muted-foreground">{config.hint}</span>
      )}
    </div>
  );
}

const PRIORITY_KO: Record<string, { label: string; emoji: string }> = {
  revenue: { label: "매출 우선", emoji: "💰" },
  authority: { label: "권위·격식 우선", emoji: "👔" },
  rapport: { label: "라포·친근 우선", emoji: "🤝" },
  quality: { label: "퀄리티 우선", emoji: "✨" },
  speed: { label: "속도 우선", emoji: "⚡" },
};

function PriorityToneLabel({ priority }: { priority: string }) {
  const config = PRIORITY_KO[priority];
  if (!config)
    return <span className="ml-1.5 font-medium">{priority}</span>;
  return (
    <span className="ml-1.5 inline-flex items-center gap-1 font-medium">
      <span>{config.emoji}</span>
      {config.label}
    </span>
  );
}

// ═══════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════

function getQuestNotes(metadata: QuestRow["metadata"]): QuestNote[] {
  if (!metadata || typeof metadata !== "object") return [];
  const rawNotes = metadata.notes;
  if (!Array.isArray(rawNotes)) return [];

  return rawNotes.flatMap((note) => {
    if (!note || typeof note !== "object") return [];
    const candidate = note as Record<string, unknown>;
    if (typeof candidate.text !== "string" || !candidate.text.trim()) return [];
    return [
      {
        text: candidate.text.trim(),
        at: typeof candidate.at === "string" ? candidate.at : "",
      },
    ];
  });
}

function getStoreMemo(metadata: Store360["metadata"]): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const memo = metadata.memo;
  return typeof memo === "string" && memo.trim() ? memo.trim() : null;
}

function getStoreMemoSavedAt(metadata: Store360["metadata"]): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const savedAt = metadata.memo_updated_at;
  return typeof savedAt === "string" && savedAt.trim() ? savedAt.trim() : null;
}

function formatNoteTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "방금";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDue(
  due: string | null,
):
  | { label: string; tone: "urgent" | "warning" | "info" | "neutral" }
  | null {
  if (!due) return null;
  const dueDate = new Date(due);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor(
    (dueDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (diffDays < 0) return { label: `연체 ${-diffDays}일`, tone: "urgent" };
  if (diffDays === 0) return { label: "오늘 마감", tone: "warning" };
  if (diffDays === 1) return { label: "내일", tone: "info" };
  if (diffDays <= 7) return { label: `D-${diffDays}`, tone: "info" };
  return { label: due.slice(5), tone: "neutral" };
}

function formatRelative(iso: string): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diffMin = Math.round((now - t) / 60000);
  if (diffMin < 1) return "방금";
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffMin < 60 * 24) return `${Math.floor(diffMin / 60)}시간 전`;
  const diffDay = Math.floor(diffMin / (60 * 24));
  if (diffDay < 30) return `${diffDay}일 전`;
  return iso.slice(0, 10);
}

// generateRecommendation은 AISummary로 흡수됨 (제거)

function daysAgo(iso: string): number {
  return Math.floor(
    (Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000),
  );
}
