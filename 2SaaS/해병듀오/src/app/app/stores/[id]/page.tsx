"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Activity,
  Loader2,
  CheckCircle2,
  Lock,
  Phone,
  MessageSquare,
  Mail,
  Users,
  Clock,
  Pin,
  Plus,
  AlertCircle,
  X,
  Building2,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { createQuest as createQuestAction } from "@/lib/actions/quest";
import {
  addCommunication as addCommunicationAction,
  archiveStore as archiveStoreAction,
  markStoreHealthChecked as markStoreHealthCheckedAction,
  rollStoreNextMonth as rollStoreNextMonthAction,
  setStoreStartDate as setStoreStartDateAction,
  updateStoreStatus as updateStoreStatusAction,
  updateStoreMemo as updateStoreMemoAction,
  updateStoreAssignees as updateStoreAssigneesAction,
} from "@/lib/actions/store";
import type { Json } from "@/lib/database.types";
import { serviceLabel } from "@/lib/pricing";
import {
  PriorityBadge,
  StatusBadge,
  StepBadge,
  StoreStatusBadge,
} from "@/components/status-badge";
import {
  storeStatusLabel,
  todayStr,
  type StoreStatus,
} from "@/lib/mock-data";

type Store = {
  id: string;
  name: string;
  type_code: string;
  status: StoreStatus;
  business_number: string | null;
  address: string | null;
  owner_name: string | null;
  owner_email: string | null;
  owner_phone: string | null;
  gbp_url: string | null;
  gbp_already_created: boolean;
  contract_months: number | null;
  keywords_count: number | null;
  monthly_fee: number | null;
  discount_pct: number;
  discount_amount: number | null;
  payment_method_code: string | null;
  tax_invoice: boolean;
  start_date: string | null;
  last_health_check_at: string | null;
  metadata: Json;
  created_at: string;
  store_types: { label: string } | null;
  payment_methods: { label: string } | null;
};

type Quest = {
  id: string;
  title: string;
  process_step: string | null;
  status: "pending" | "blocked" | "completed" | "cancelled";
  priority: "urgent" | "normal" | "low";
  is_pinned: boolean;
  due_date: string | null;
  blocked_reason: string | null;
};

type Communication = {
  id: string;
  channel_code: string;
  direction: "inbound" | "outbound";
  occurred_at: string;
  summary: string;
  next_action: string | null;
  next_action_date: string | null;
  channel: { label: string } | null;
};

type AuditEntry = {
  id: number;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  occurred_at: string;
};

type Channel = { code: string; label: string };
type StaffMember = { id: string; name: string };
type StoreAssignee = { store_id: string; profile_id: string };
type KakaoNotificationEvent = {
  id: string;
  room_title: string | null;
  sender_name: string | null;
  sender_kind: string | null;
  message_text: string;
  posted_at: string | null;
  received_at: string;
  status: string;
  proposed_action_id: string | null;
  room_kind: string | null;
  ignored_reason: string | null;
  store_match_method: string | null;
};
type KakaoConversationMessage = {
  id: string;
  room_title: string | null;
  sender_name: string | null;
  sender_kind: string | null;
  message_text: string;
  sent_at: string | null;
  created_at: string;
  line_number: number | null;
};

const channelIcons: Record<string, typeof Phone> = {
  call: Phone,
  kakao: MessageSquare,
  email: Mail,
  kakaowork: MessageSquare,
  meeting: Users,
  other: MessageSquare,
};

function fmtDate(d: string | null) {
  if (!d) return "—";
  return d.slice(0, 10);
}

function fmtDateTime(d: string) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
}

function fmtMoney(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString("ko-KR") + "원";
}

function serviceLabelsFromMetadata(metadata: Json) {
  const codes = serviceCodesFromMetadata(metadata);
  return codes.map(serviceLabel);
}

function serviceCodesFromMetadata(metadata: Json) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return [];
  }
  const raw = metadata.services;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === "string");
}

function hasGoogleService(metadata: Json) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return true;
  }
  const raw = metadata.services;
  if (!Array.isArray(raw)) return true;
  return raw.includes("google_gbp");
}

function memoFromMetadata(metadata: Json) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "";
  }
  const memo = metadata.memo;
  return typeof memo === "string" ? memo : "";
}

function memoSavedAtFromMetadata(metadata: Json) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const savedAt = metadata.memo_updated_at;
  return typeof savedAt === "string" && savedAt.trim() ? savedAt : null;
}

export default function StoreDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = use(props.params);
  const supabase = useMemo(() => createClient(), []);

  const [store, setStore] = useState<Store | null>(null);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [comms, setComms] = useState<Communication[]>([]);
  const [audits, setAudits] = useState<AuditEntry[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [storeAssignees, setStoreAssignees] = useState<StoreAssignee[]>([]);
  const [kakaoEvents, setKakaoEvents] = useState<KakaoNotificationEvent[]>([]);
  const [kakaoMessages, setKakaoMessages] = useState<KakaoConversationMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newStartDate, setNewStartDate] = useState("");
  const [settingStart, setSettingStart] = useState(false);

  const reload = useMemo(
    () => async () => {
      const [s, q, c, a, ch, st, sa, ke, km] = await Promise.all([
        supabase
          .from("stores")
          .select(
            "*, store_types(label), payment_methods(label)",
          )
          .eq("id", id)
          .single(),
        supabase
          .from("quests")
          .select("id, title, process_step, status, priority, is_pinned, due_date, blocked_reason")
          .eq("store_id", id)
          .order("status")
          .order("is_pinned", { ascending: false })
          .order("due_date"),
        supabase
          .from("communications")
          .select("*, channel:communication_channels(label)")
          .eq("store_id", id)
          .order("occurred_at", { ascending: false }),
        supabase
          .from("store_audit_log")
          .select("*")
          .eq("store_id", id)
          .order("occurred_at", { ascending: false })
          .limit(20),
        supabase.from("communication_channels").select("code, label").order("sort_order"),
        supabase.from("profiles").select("id, name").order("name"),
        supabase
          .from("store_assignees")
          .select("store_id, profile_id")
          .eq("store_id", id),
        supabase
          .from("kakao_notification_events")
          .select(
            "id, room_title, sender_name, sender_kind, message_text, posted_at, received_at, status, proposed_action_id, room_kind, ignored_reason, store_match_method",
          )
          .eq("store_id", id)
          .order("received_at", { ascending: false })
          .limit(80),
        supabase
          .from("kakao_conversation_messages")
          .select("id, room_title, sender_name, sender_kind, message_text, sent_at, created_at, line_number")
          .eq("store_id", id)
          .order("sent_at", { ascending: false })
          .limit(80),
      ]);
      setLoading(false);
      const loadError =
        s.error ??
        q.error ??
        c.error ??
        a.error ??
        ch.error ??
        st.error ??
        sa.error ??
        ke.error ??
        km.error;
      if (loadError) {
        setError(loadError.message);
        return;
      }
      setError(null);
      setStore(s.data as unknown as Store);
      setQuests((q.data ?? []) as unknown as Quest[]);
      setComms((c.data ?? []) as unknown as Communication[]);
      setAudits((a.data ?? []) as unknown as AuditEntry[]);
      setChannels((ch.data ?? []) as unknown as Channel[]);
      setStaff((st.data ?? []) as StaffMember[]);
      setStoreAssignees((sa.data ?? []) as StoreAssignee[]);
      setKakaoEvents((ke.data ?? []) as unknown as KakaoNotificationEvent[]);
      setKakaoMessages((km.data ?? []) as unknown as KakaoConversationMessage[]);
    },
    [supabase, id],
  );

  useEffect(() => {
    reload();
  }, [reload]);

  const updateStatus = async (newStatus: StoreStatus) => {
    const result = await updateStoreStatusAction(id, newStatus);
    if (!result.ok) {
      alert("상태 변경 실패: " + result.error);
      return;
    }
    reload();
  };

  const updateHealthCheck = async () => {
    const result = await markStoreHealthCheckedAction(id);
    if (!result.ok) {
      alert("매장 점검 갱신 실패: " + result.error);
      return;
    }
    reload();
  };

  const archiveStore = async () => {
    const reason = prompt("아카이브 사유를 입력하세요 (예: 계약 종료·이탈 처리)");
    if (reason == null) return;
    if (!reason.trim()) {
      alert("아카이브 사유는 필수입니다.");
      return;
    }
    if (
      !window.confirm(
        `이 매장을 아카이브하시겠습니까?\n\n매장: ${store?.name ?? "현재 매장"}\n사유: ${reason}`,
      )
    ) {
      return;
    }
    const result = await archiveStoreAction(id, reason);
    if (!result.ok) {
      alert("아카이브 실패: " + result.error);
      return;
    }
    alert("아카이브됨. 매장 목록으로 이동합니다.");
    window.location.href = "/app/stores";
  };

  const confirmStartDate = async () => {
    if (!newStartDate) return;
    setSettingStart(true);
    const result = await setStoreStartDateAction(id, newStartDate);
    setSettingStart(false);
    if (!result.ok) {
      alert("시작일 확정 실패: " + result.error);
      return;
    }
    setNewStartDate("");
    reload();
  };

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }
  if (error || !store) {
    return (
      <main className="flex flex-1 flex-col gap-4 p-8">
        <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">
          {error ?? "매장을 찾을 수 없습니다"}
        </div>
        <Button asChild variant="outline">
          <Link href="/app/stores">목록으로</Link>
        </Button>
      </main>
    );
  }

  const pendingQuests = quests.filter((q) => q.status === "pending" || q.status === "blocked");
  const completedQuests = quests.filter((q) => q.status === "completed");
  const staleDays = store.last_health_check_at
    ? Math.floor(
        (new Date(todayStr).getTime() - new Date(store.last_health_check_at).getTime()) /
          (1000 * 60 * 60 * 24),
      )
    : null;
  const isStale = staleDays != null && staleDays >= 7;
  const serviceLabels = serviceLabelsFromMetadata(store.metadata);
  const googleService = hasGoogleService(store.metadata);
  const effectiveMonthly = store.discount_amount ?? store.monthly_fee ?? 0;
  const monthlyVat = Math.round(effectiveMonthly * 0.1);
  const monthlyBilling = effectiveMonthly + monthlyVat;
  const contractTotal = monthlyBilling * (store.contract_months ?? 0);
  const selectedAssigneeIds = storeAssignees.map((row) => row.profile_id);

  const toggleStoreAssignee = async (profileId: string) => {
    const memberName = staff.find((member) => member.id === profileId)?.name ?? "선택한 담당자";
    const isAssigned = selectedAssigneeIds.includes(profileId);
    if (
      !window.confirm(
        `${store.name} 담당자에서 ${memberName}님을 ${isAssigned ? "해제" : "추가"}하시겠습니까?`,
      )
    ) {
      return;
    }
    const nextIds = selectedAssigneeIds.includes(profileId)
      ? selectedAssigneeIds.filter((id) => id !== profileId)
      : [...selectedAssigneeIds, profileId];
    const result = await updateStoreAssigneesAction(id, nextIds);
    if (!result.ok) {
      alert("담당자 저장 실패: " + result.error);
      return;
    }
    reload();
  };

  return (
    <main className="flex flex-1 flex-col gap-5 overflow-y-auto p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-gradient-to-r from-sky-50 via-card to-orange-50/50 p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/app/stores">
              <ArrowLeft className="size-4" />
              목록
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{store.name}</h1>
              <StoreStatusBadge status={store.status} size="md" />
              <StatusBadge tone="neutral" size="md">
                {store.store_types?.label}
              </StatusBadge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              등록 {fmtDate(store.created_at)}
              {store.start_date && <> · 시작일 {store.start_date}</>}
              {staleDays != null && (
                <span className={cn("ml-2", isStale && "text-rose-600 font-medium")}>
                  · 매장 점검 {staleDays === 0 ? "오늘" : `${staleDays}일 전`}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
            value={store.status}
            onChange={(e) => updateStatus(e.target.value as StoreStatus)}
          >
            {Object.entries(storeStatusLabel).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={updateHealthCheck}>
            <CheckCircle2 className="size-4" />
            매장 점검 갱신
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={archiveStore}
            className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
          >
            아카이브
          </Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DetailMetric
          icon={WalletCards}
          label="월 청구액"
          value={fmtMoney(monthlyBilling)}
          tone="info"
        />
        <DetailMetric
          icon={CheckCircle2}
          label="진행 퀘스트"
          value={`${pendingQuests.length}건`}
          tone={pendingQuests.length > 0 ? "warning" : "success"}
        />
        <DetailMetric
          icon={Building2}
          label="서비스"
          value={`${serviceLabels.length || 1}개`}
          tone="success"
        />
        <DetailMetric
          icon={Activity}
          label="매장 점검"
          value={staleDays == null ? "기록 없음" : staleDays === 0 ? "오늘" : `${staleDays}일 전`}
          tone={isStale ? "urgent" : "neutral"}
        />
      </div>

      {/* 시작일 미입력 매장만 — 입력 시 C 단계 첫 1개월치 자동 발급 */}
      {!store.start_date ? (
        <div className="flex items-center gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertCircle className="size-4 shrink-0" />
          <span className="flex-1">
            <strong>시작일 미입력</strong> — 확정하면 C 단계 첫 1개월치
            (D+15·주간보고 4·월간보고·매장 체크리스트) 자동 생성
          </span>
          <input
            type="date"
            value={newStartDate}
            onChange={(e) => setNewStartDate(e.target.value)}
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
          />
          <Button size="sm" onClick={confirmStartDate} disabled={!newStartDate || settingStart}>
            {settingStart && <Loader2 className="size-3.5 animate-spin" />}
            시작일 확정
          </Button>
        </div>
      ) : (
        <NextMonthRoll storeId={id} onRolled={reload} />
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* 좌: 기본 정보 */}
        <section className="rounded-xl border border-l-4 border-l-sky-400 bg-card p-5 shadow-sm lg:col-span-1">
          <SectionTitle icon={Building2} title="기본 정보" />
          <dl className="space-y-3 text-sm">
            <Row label="사업자등록번호" value={store.business_number ?? "—"} />
            <Row label="주소" value={store.address ?? "—"} />
            <div className="space-y-1">
              <dt className="text-muted-foreground">서비스</dt>
              <dd className="flex flex-wrap gap-1">
                {(serviceLabels.length > 0 ? serviceLabels : ["구글 SEO/GBP 관리"]).map((label) => (
                  <StatusBadge key={label} tone="info" size="sm">
                    {label}
                  </StatusBadge>
                ))}
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-muted-foreground">담당자</dt>
              <dd className="flex flex-wrap gap-1.5">
                {staff.length === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  staff.map((member) => {
                    const selected = selectedAssigneeIds.includes(member.id);
                    const primary = selectedAssigneeIds[0] === member.id;
                    return (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => toggleStoreAssignee(member.id)}
                        className={cn(
                          "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                          selected
                            ? "border-primary/30 bg-primary/10 text-primary"
                            : "border-border bg-background text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {member.name}
                        {primary && <span className="ml-1 text-[10px] opacity-70">메인</span>}
                      </button>
                    );
                  })
                )}
              </dd>
            </div>
            <Row label="업주" value={store.owner_name ?? "—"} />
            <Row label="연락처" value={store.owner_phone ?? "—"} />
            <Row label="이메일" value={store.owner_email ?? "—"} />
            <hr />
            <Row label="약정 기간" value={`${store.contract_months ?? "—"}개월`} />
            <Row label="키워드 수" value={`${store.keywords_count ?? "—"}개`} />
            <Row label="월 단가 (공급가)" value={fmtMoney(store.monthly_fee)} />
            {store.discount_amount != null && (
              <>
                <Row
                  label="할인 단가"
                  value={`${fmtMoney(store.discount_amount)} (${store.discount_pct}% 할인)`}
                />
              </>
            )}
            {(() => {
              return (
                <>
                  <Row label="VAT 10%" value={`+${fmtMoney(monthlyVat)}`} />
                  <Row label="월 청구액 (VAT 포함)" value={fmtMoney(monthlyBilling)} strong />
                  <Row label={`약정 ${store.contract_months ?? 0}개월 합계`} value={fmtMoney(contractTotal)} strong />
                </>
              );
            })()}
            <Row label="결제수단" value={store.payment_methods?.label ?? "—"} />
            <Row label="세금계산서" value={store.tax_invoice ? "발행" : "미발행"} />
            {googleService && (
              <Row
                label="GBP"
                value={
                  store.gbp_already_created
                    ? store.gbp_url
                      ? "생성됨 (URL 등록)"
                      : "생성됨 (URL 미등록)"
                    : "세팅 필요"
                }
              />
            )}
            <hr />
            <StoreMemoBox
              storeId={id}
              initialMemo={memoFromMetadata(store.metadata)}
              savedAt={memoSavedAtFromMetadata(store.metadata)}
              onSaved={reload}
            />
          </dl>
        </section>

        {/* 우: 퀘스트 + 연락 + 변경 이력 */}
        <div className="flex flex-col gap-5 lg:col-span-2">
          {/* 진행 중 퀘스트 */}
          <section className="rounded-xl border border-l-4 border-l-amber-400 bg-card p-5 shadow-sm">
            <div className="mb-3 flex items-baseline justify-between">
              <SectionTitle icon={CheckCircle2} title="진행 중 퀘스트" compact />
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  {pendingQuests.length}건 (완료 {completedQuests.length}건)
                </span>
                <ManualQuestAdd storeId={id} onAdded={reload} />
              </div>
            </div>
            {pendingQuests.length === 0 ? (
              <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                진행 중인 퀘스트가 없습니다
              </div>
            ) : (
              <ul className="space-y-2">
                {pendingQuests.map((q) => {
                  const blocked = q.status === "blocked";
                  return (
                    <li
                      key={q.id}
                      className={cn(
                        "flex items-start gap-2 rounded-md border bg-card p-3 text-sm shadow-sm transition-colors hover:bg-sky-50/40",
                        blocked && "border-amber-200 bg-amber-50/50",
                        q.priority === "urgent" && "border-red-200 bg-red-50/40",
                        q.is_pinned && "border-foreground/30 bg-amber-50/70",
                      )}
                    >
                      {q.is_pinned && <Pin className="mt-0.5 size-3 shrink-0 text-amber-600" />}
                      {q.process_step && (
                        <StepBadge code={q.process_step} size="sm" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium">{q.title}</span>
                          <PriorityBadge priority={q.priority} size="sm" />
                        </div>
                        {blocked ? (
                          <div className="mt-0.5 flex items-center gap-1 text-xs text-amber-600">
                            <Lock className="size-3" />
                            {q.blocked_reason}
                          </div>
                        ) : (
                          q.due_date && (
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              마감 {q.due_date}
                            </div>
                          )
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* 연락 로그 */}
          <CommunicationsSection
            storeId={id}
            comms={comms}
            channels={channels}
            onChange={reload}
          />

          <KakaoConversationSection
            events={kakaoEvents}
            messages={kakaoMessages}
          />

          {/* (비활성) 정기 체크 / 보고서 — 카톡 직송 워크플로우라 SaaS UI는 부담 (사용자 결정 2026-04-26) */}

          {/* 변경 이력 */}
          <section className="rounded-xl border border-l-4 border-l-slate-300 bg-card p-5 shadow-sm">
            <SectionTitle icon={Clock} title="변경 이력" />
            {audits.length === 0 ? (
              <div className="text-sm text-muted-foreground">기록 없음</div>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {audits.map((a) => (
                  <li key={a.id} className="flex items-baseline gap-2">
                    <Clock className="size-3 shrink-0 text-muted-foreground" />
                    <span className="text-muted-foreground tabular-nums">
                      {fmtDateTime(a.occurred_at)}
                    </span>
                    <span className="font-medium">{a.action}</span>
                    {a.before && a.after && (
                      <span className="truncate text-muted-foreground">
                        {JSON.stringify(a.before)} → {JSON.stringify(a.after)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function StoreMemoBox({
  storeId,
  initialMemo,
  savedAt,
  onSaved,
}: {
  storeId: string;
  initialMemo: string;
  savedAt: string | null;
  onSaved: () => void;
}) {
  const [memo, setMemo] = useState(initialMemo);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMemo(initialMemo);
  }, [initialMemo]);

  const changed = memo.trim() !== initialMemo.trim();

  async function save() {
    setSaving(true);
    const result = await updateStoreMemoAction(storeId, memo);
    setSaving(false);
    if (!result.ok) {
      alert("매장 메모 저장 실패: " + result.error);
      return;
    }
    onSaved();
  }

  return (
    <div className="space-y-1">
      <dt className="flex items-center justify-between gap-2 text-muted-foreground">
        <span>매장 메모</span>
        <span className="text-xs">
          {savedAt ? `최근 저장 ${fmtDateTime(savedAt)}` : "최근 저장 기록 없음"}
        </span>
      </dt>
      <dd className="space-y-2">
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="기록 없음"
          className="min-h-[96px] w-full resize-y rounded-md border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus:ring-1 focus:ring-primary"
        />
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={save}
            disabled={saving || !changed}
          >
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            저장
          </Button>
        </div>
      </dd>
    </div>
  );
}

function ManualQuestAdd({ storeId, onAdded }: { storeId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<"urgent" | "normal" | "low">("normal");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!title.trim()) return;
    setSubmitting(true);
    const result = await createQuestAction({
      storeId,
      title: title.trim(),
      processStep: null,
      priority,
      dueDate: dueDate || null,
    });
    setSubmitting(false);
    if (!result.ok) {
      alert("저장 실패: " + result.error);
      return;
    }
    setTitle("");
    setDueDate("");
    setOpen(false);
    onAdded();
  };

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" />
        수동 추가
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        className="w-44 rounded-md border bg-background px-2 py-1 text-xs"
        placeholder="제목"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
      />
      <select
        className="rounded-md border bg-background px-2 py-1 text-xs"
        value={priority}
        onChange={(e) => setPriority(e.target.value as typeof priority)}
      >
        <option value="urgent">긴급</option>
        <option value="normal">보통</option>
        <option value="low">낮음</option>
      </select>
      <input
        type="date"
        className="rounded-md border bg-background px-2 py-1 text-xs"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
      />
      <Button size="sm" variant="outline" onClick={submit} disabled={!title.trim() || submitting}>
        {submitting && <Loader2 className="size-3 animate-spin" />}
        추가
      </Button>
      <button onClick={() => setOpen(false)} className="rounded p-1 text-muted-foreground hover:bg-muted">
        <X className="size-3" />
      </button>
    </div>
  );
}

function NextMonthRoll({ storeId, onRolled }: { storeId: string; onRolled: () => void }) {
  const [rolling, setRolling] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const roll = async () => {
    setRolling(true);
    setLastResult(null);
    const result = await rollStoreNextMonthAction(storeId);
    setRolling(false);
    if (!result.ok) {
      alert("롤링 발급 실패: " + result.error);
      return;
    }
    setLastResult(
      `퀘스트 ${result.questsAdded}건 + 정기체크 ${result.checksAdded}건 추가됨`,
    );
    onRolled();
  };

  return (
    <div className="flex items-center gap-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
      <Clock className="size-4 shrink-0" />
      <span className="flex-1">
        <strong>롤링 갱신</strong> — 마지막 주간보고 다음 4주치 (주간 4·월간 1·체크 4) 자동
        발급. 1개월 끝날 때마다 사용.
        {lastResult && <span className="ml-2 font-medium">→ {lastResult}</span>}
      </span>
      <Button size="sm" variant="outline" onClick={roll} disabled={rolling}>
        {rolling && <Loader2 className="size-3.5 animate-spin" />}
        다음 1개월 발급
      </Button>
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  compact = false,
}: {
  icon: typeof Building2;
  title: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2", compact ? "" : "mb-4")}>
      <div className="rounded-md border bg-background p-1.5 text-primary shadow-sm">
        <Icon className="size-3.5" />
      </div>
      <h2 className="text-base font-semibold">{title}</h2>
    </div>
  );
}

function DetailMetric({
  icon: Icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  tone?: "neutral" | "info" | "success" | "warning" | "urgent";
}) {
  const toneClass = {
    neutral: "border-slate-200 bg-card",
    info: "border-sky-200 bg-sky-50 text-sky-950",
    success: "border-emerald-200 bg-emerald-50 text-emerald-950",
    warning: "border-amber-200 bg-amber-50 text-amber-950",
    urgent: "border-red-200 bg-red-50 text-red-950",
  }[tone];
  const iconClass = {
    neutral: "text-slate-500",
    info: "text-sky-600",
    success: "text-emerald-600",
    warning: "text-amber-600",
    urgent: "text-red-600",
  }[tone];
  return (
    <div className={cn("rounded-xl border px-4 py-3 shadow-sm", toneClass)}>
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className={cn("size-3.5", iconClass)} />
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("text-right", strong && "font-semibold text-foreground")}>{value}</dd>
    </div>
  );
}

const inputCls =
  "w-full rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:border-foreground/30";

type KakaoTimelineItem = {
  id: string;
  source: "notification" | "import";
  occurredAt: string;
  roomTitle: string | null;
  senderName: string | null;
  senderKind: string | null;
  messageText: string;
  status?: string;
  proposedActionId?: string | null;
  roomKind?: string | null;
  ignoredReason?: string | null;
  storeMatchMethod?: string | null;
  lineNumber?: number | null;
};

function senderKindLabel(kind: string | null | undefined) {
  const labels: Record<string, string> = {
    internal: "우리",
    owner: "업주",
    reviewer: "리뷰어",
    system: "시스템",
    unknown: "미분류",
  };
  return labels[kind ?? ""] ?? "미분류";
}

function senderKindTone(kind: string | null | undefined): "info" | "success" | "warning" | "neutral" {
  if (kind === "internal") return "info";
  if (kind === "owner") return "success";
  if (kind === "reviewer") return "warning";
  return "neutral";
}

function kakaoStatusLabel(status: string | null | undefined) {
  const labels: Record<string, string> = {
    received: "수신",
    proposed: "제안 생성",
    ignored: "무시",
    failed: "실패",
  };
  return labels[status ?? ""] ?? status ?? "기록";
}

function kakaoStatusTone(status: string | null | undefined): "brand" | "info" | "neutral" | "urgent" {
  if (status === "proposed") return "brand";
  if (status === "received") return "info";
  if (status === "failed") return "urgent";
  return "neutral";
}

function roomKindLabel(kind: string | null | undefined) {
  if (kind === "owner_seo") return "SEO방";
  if (kind === "review_work") return "작업방";
  return null;
}

function KakaoConversationSection({
  events,
  messages,
}: {
  events: KakaoNotificationEvent[];
  messages: KakaoConversationMessage[];
}) {
  const [showAll, setShowAll] = useState(false);
  const timeline = useMemo<KakaoTimelineItem[]>(() => {
    const items: KakaoTimelineItem[] = [
      ...events.map((event) => ({
        id: event.id,
        source: "notification" as const,
        occurredAt: event.posted_at ?? event.received_at,
        roomTitle: event.room_title,
        senderName: event.sender_name,
        senderKind: event.sender_kind,
        messageText: event.message_text,
        status: event.status,
        proposedActionId: event.proposed_action_id,
        roomKind: event.room_kind,
        ignoredReason: event.ignored_reason,
        storeMatchMethod: event.store_match_method,
      })),
      ...messages.map((message) => ({
        id: message.id,
        source: "import" as const,
        occurredAt: message.sent_at ?? message.created_at,
        roomTitle: message.room_title,
        senderName: message.sender_name,
        senderKind: message.sender_kind,
        messageText: message.message_text,
        lineNumber: message.line_number,
      })),
    ];
    return items
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .slice(0, 120);
  }, [events, messages]);

  const visibleItems = showAll ? timeline : timeline.slice(0, 40);
  const proposedCount = events.filter((event) => event.status === "proposed").length;

  return (
    <section className="rounded-xl border border-l-4 border-l-indigo-400 bg-card p-5 shadow-sm">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <SectionTitle icon={MessageSquare} title="카톡 대화 기록" compact />
          <div className="mt-2 flex flex-wrap gap-1.5">
            <StatusBadge tone="info" size="sm">알림 {events.length}건</StatusBadge>
            <StatusBadge tone="neutral" size="sm">내보내기 {messages.length}건</StatusBadge>
            <StatusBadge tone={proposedCount > 0 ? "brand" : "neutral"} size="sm">
              제안 {proposedCount}건
            </StatusBadge>
            <StatusBadge tone="neutral" size="sm">최근 {timeline.length}건</StatusBadge>
          </div>
        </div>
        {timeline.length > 40 && (
          <Button size="sm" variant="outline" onClick={() => setShowAll((value) => !value)}>
            {showAll ? "40건만 보기" : "최근 120건 보기"}
          </Button>
        )}
      </div>

      {timeline.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          카톡 기록이 없습니다
        </div>
      ) : (
        <ul className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
          {visibleItems.map((item) => {
            const roomKind = roomKindLabel(item.roomKind);
            return (
              <li
                key={`${item.source}-${item.id}`}
                className="rounded-md border bg-muted/15 p-3 text-sm transition-colors hover:bg-indigo-50/40"
              >
                <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <StatusBadge tone={item.source === "notification" ? "info" : "neutral"} size="sm">
                    {item.source === "notification" ? "알림수집" : "대화내보내기"}
                  </StatusBadge>
                  {item.source === "notification" && item.status && (
                    <StatusBadge tone={kakaoStatusTone(item.status)} size="sm">
                      {kakaoStatusLabel(item.status)}
                    </StatusBadge>
                  )}
                  <StatusBadge tone={senderKindTone(item.senderKind)} size="sm">
                    {senderKindLabel(item.senderKind)}
                  </StatusBadge>
                  {roomKind && <StatusBadge tone="neutral" size="sm">{roomKind}</StatusBadge>}
                  <span className="tabular-nums">{fmtDateTime(item.occurredAt)}</span>
                  {item.roomTitle && (
                    <>
                      <span>·</span>
                      <span className="truncate">{item.roomTitle}</span>
                    </>
                  )}
                </div>
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <span className="font-medium">{item.senderName ?? "발신자 미상"}</span>
                  {item.storeMatchMethod && (
                    <span className="text-xs text-muted-foreground">
                      매칭 {item.storeMatchMethod}
                    </span>
                  )}
                  {item.lineNumber != null && (
                    <span className="text-xs text-muted-foreground">
                      line {item.lineNumber}
                    </span>
                  )}
                </div>
                <div className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-background px-2 py-1.5 text-xs leading-relaxed">
                  {item.messageText}
                </div>
                {item.ignoredReason && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    무시 사유: {item.ignoredReason}
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

function CommunicationsSection({
  storeId,
  comms,
  channels,
  onChange,
}: {
  storeId: string;
  comms: Communication[];
  channels: Channel[];
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [channelCode, setChannelCode] = useState("call");
  const [direction, setDirection] = useState<"inbound" | "outbound">("outbound");
  const [summary, setSummary] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!summary.trim()) return;
    setSubmitting(true);
    const result = await addCommunicationAction({
      storeId,
      channelCode,
      direction,
      summary,
      nextAction: nextAction || null,
      nextActionDate: nextDate || null,
    });
    setSubmitting(false);
    if (!result.ok) {
      alert("저장 실패: " + result.error);
      return;
    }
    setSummary("");
    setNextAction("");
    setNextDate("");
    setOpen(false);
    onChange();
  };

  return (
    <section className="rounded-xl border border-l-4 border-l-emerald-400 bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between">
        <SectionTitle icon={MessageSquare} title="업주 연락 로그" compact />
        <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
          <Plus className="size-3.5" />
          {open ? "닫기" : "기록 추가"}
        </Button>
      </div>

      {open && (
        <div className="mb-4 space-y-2 rounded-md border bg-muted/30 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              className={inputCls}
              value={channelCode}
              onChange={(e) => setChannelCode(e.target.value)}
            >
              {channels.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
            <select
              className={inputCls}
              value={direction}
              onChange={(e) => setDirection(e.target.value as "inbound" | "outbound")}
            >
              <option value="outbound">우리 → 업주</option>
              <option value="inbound">업주 → 우리</option>
            </select>
          </div>
          <input
            className={inputCls}
            placeholder="요약 (예: 견적 의향 통화)"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              className={inputCls}
              placeholder="다음 액션 (선택)"
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
            />
            <input
              type="date"
              className={inputCls}
              value={nextDate}
              onChange={(e) => setNextDate(e.target.value)}
            />
          </div>
          <Button size="sm" onClick={submit} disabled={submitting || !summary.trim()}>
            {submitting && <Loader2 className="size-3.5 animate-spin" />}
            저장
          </Button>
        </div>
      )}

      {comms.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          연락 기록이 없습니다
        </div>
      ) : (
        <ul className="space-y-2">
          {comms.map((c) => {
            const Icon = channelIcons[c.channel_code] ?? MessageSquare;
            return (
              <li
                key={c.id}
                className="flex items-start gap-3 rounded-md border bg-muted/20 p-3 text-sm transition-colors hover:bg-emerald-50/40"
              >
                <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{c.channel?.label ?? c.channel_code}</span>
                    <span>·</span>
                    <span>{c.direction === "inbound" ? "← 업주" : "→ 업주"}</span>
                    <span>·</span>
                    <span>{fmtDateTime(c.occurred_at)}</span>
                  </div>
                  <div className="mt-0.5 font-medium">{c.summary}</div>
                  {c.next_action && (
                    <div className="mt-1 flex items-center gap-1 text-xs text-amber-700">
                      <AlertCircle className="size-3" />
                      다음: {c.next_action}
                      {c.next_action_date && ` (${c.next_action_date})`}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
