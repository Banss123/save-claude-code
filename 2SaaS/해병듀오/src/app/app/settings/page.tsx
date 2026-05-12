"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  User,
  KeyRound,
  LogOut,
  MessageSquare,
  Loader2,
  Check,
  LinkIcon,
  RefreshCw,
  Save,
  Unlink,
  Wand2,
  ChevronDown,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { signOut as signOutAction } from "@/lib/actions/auth";
import { updateProfile as updateProfileAction } from "@/lib/actions/profile";
import {
  disconnectGoogleAccount as disconnectGoogleAccountAction,
  getGoogleConnectionStatus as getGoogleConnectionStatusAction,
  getOperationalStatus as getOperationalStatusAction,
  refreshGoogleSyncSources as refreshGoogleSyncSourcesAction,
  syncMyGoogleSources as syncMyGoogleSourcesAction,
  updateGoogleSyncSourceSelection as updateGoogleSyncSourceSelectionAction,
  updateCommonSheetLinks as updateCommonSheetLinksAction,
  updateOperationalSettings as updateOperationalSettingsAction,
  type GoogleConnectionStatus,
  type GoogleSyncStats,
  type OperationalStatusSnapshot,
} from "@/lib/actions/settings";
import {
  deactivateKakaoRoomMapping as deactivateKakaoRoomMappingAction,
  importKakaoConversationText as importKakaoConversationTextAction,
  upsertKakaoRoomMapping as upsertKakaoRoomMappingAction,
} from "@/lib/actions/kakao";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";

type ProfileRow = {
  id: string;
  name: string;
  role: "sales" | "marketer" | "admin";
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
};

type SettingRow = {
  key: string;
  value: string | null;
};

type StoreOption = {
  id: string;
  name: string;
  status: string;
};

type KakaoRoomMappingRow = {
  id: string;
  room_title: string;
  store_id: string;
  active: boolean;
  updated_at: string;
};

type KakaoEventRow = {
  id: string;
  room_title: string | null;
  sender_name: string | null;
  message_text: string;
  status: string;
  store_id: string | null;
  received_at: string;
  room_kind: "owner_seo" | "review_work" | null;
  store_match_method: string | null;
  sender_kind: string | null;
  ignored_reason: string | null;
};

type KakaoBatchRow = {
  id: string;
  device_id: string | null;
  event_count: number;
  inserted_count: number;
  duplicate_count: number;
  proposed_count: number;
  ignored_count: number;
  failed_count: number;
  received_at: string;
};

type RoomCandidate = {
  roomTitle: string;
  latestEvent: KakaoEventRow;
  count: number;
  proposedCount: number;
  mappedStoreId: string | null;
  suggestedStoreId: string | null;
  structuredKind: "owner_seo" | "review_work" | null;
  structuredStoreName: string | null;
};

type RoomListMode = "needs" | "auto" | "saved";

type OperationalSettings = {
  notificationNewQuestEnabled: boolean;
  notificationDueSoonEnabled: boolean;
  notificationBlockedEnabled: boolean;
  notificationStoreCheckEnabled: boolean;
  kakaoIngestEnabled: boolean;
  kakaoIngestNote: string;
};

type StatusTone = "ok" | "warn" | "muted";

const DEFAULT_OPERATIONAL_SETTINGS: OperationalSettings = {
  notificationNewQuestEnabled: true,
  notificationDueSoonEnabled: true,
  notificationBlockedEnabled: true,
  notificationStoreCheckEnabled: true,
  kakaoIngestEnabled: true,
  kakaoIngestNote: "",
};

const ROLE_OPTIONS = [
  { code: "sales", label: "영업자" },
  { code: "marketer", label: "마케터" },
  { code: "admin", label: "관리자" },
] as const;

function Section({
  icon: Icon,
  title,
  desc,
  children,
}: {
  icon: typeof Bell;
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
          <Icon className="size-4" />
        </div>
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Toggle({
  label,
  desc,
  defaultOn,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  desc?: string;
  defaultOn?: boolean;
  checked?: boolean;
  onCheckedChange?: (value: boolean) => void;
  disabled?: boolean;
}) {
  const [internalOn, setInternalOn] = useState(!!defaultOn);
  const on = checked ?? internalOn;
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {desc && <div className="text-xs text-muted-foreground">{desc}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={disabled}
        onClick={() => {
          const next = !on;
          if (checked === undefined) setInternalOn(next);
          onCheckedChange?.(next);
        }}
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          on ? "bg-primary" : "bg-muted",
          disabled && "opacity-50",
        )}
      >
        <span
          className={cn(
            "absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow transition-transform",
            on ? "translate-x-4" : "translate-x-0",
          )}
        />
      </button>
    </div>
  );
}

const inputCls =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-foreground/30";

function parseStructuredRoomTitle(roomTitle: string) {
  const match = roomTitle.match(/^\s*\[(SEO|작업)\]\s*(.+?)\s*$/i);
  if (!match?.[1] || !match?.[2]) {
    return { structuredKind: null, structuredStoreName: null };
  }
  const label = match[1].toUpperCase();
  return {
    structuredKind:
      label === "SEO" ? ("owner_seo" as const) : ("review_work" as const),
    structuredStoreName: match[2].trim(),
  };
}

function relativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.max(0, Math.round(diffMs / 60000));
  if (diffMin < 1) return "방금";
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  const diffDay = Math.round(diffHour / 24);
  return `${diffDay}일 전`;
}

function settingBool(
  map: Map<string, string>,
  key: string,
  fallback: boolean,
) {
  const value = map.get(key);
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function isCandidateReady(candidate: RoomCandidate) {
  return Boolean(candidate.mappedStoreId || candidate.suggestedStoreId);
}

function KakaoRoomCard({
  candidate,
  stores,
  storeMap,
  selectedStoreId,
  manualMapping,
  isSaving,
  saved,
  onSelectStore,
  onSave,
  onDeactivate,
}: {
  candidate: RoomCandidate;
  stores: StoreOption[];
  storeMap: Map<string, StoreOption>;
  selectedStoreId: string;
  manualMapping?: KakaoRoomMappingRow;
  isSaving: boolean;
  saved: boolean;
  onSelectStore: (storeId: string) => void;
  onSave: () => void;
  onDeactivate: () => void;
}) {
  const selectedStore = selectedStoreId ? storeMap.get(selectedStoreId) : null;
  const structuredLabel =
    candidate.structuredKind === "owner_seo"
      ? "SEO 업주방"
      : candidate.structuredKind === "review_work"
        ? "작업방"
        : null;

  return (
    <div className="rounded-md border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="truncate text-sm font-semibold">{candidate.roomTitle}</h3>
            {structuredLabel && (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                {structuredLabel}
              </span>
            )}
            {manualMapping && (
              <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                수동 저장
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            최근 {relativeTime(candidate.latestEvent.received_at)} · 메시지{" "}
            {candidate.count}건 · 제안 {candidate.proposedCount}건
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
            <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
              상태 {candidate.latestEvent.status}
            </span>
            {candidate.latestEvent.sender_kind && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                발신 {candidate.latestEvent.sender_kind}
              </span>
            )}
            {candidate.latestEvent.ignored_reason && (
              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">
                제외 {candidate.latestEvent.ignored_reason}
              </span>
            )}
          </div>
        </div>
        {candidate.suggestedStoreId && !manualMapping && (
          <div className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">
            <Wand2 className="size-3" />
            자동 후보
          </div>
        )}
      </div>

      <div className="mt-3 rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
        <div className="font-medium text-foreground">
          {candidate.latestEvent.sender_name ?? "발신자 없음"}
        </div>
        <div className="mt-1 line-clamp-2">{candidate.latestEvent.message_text}</div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <select
          className={inputCls}
          value={selectedStoreId}
          onChange={(e) => onSelectStore(e.target.value)}
        >
          <option value="">매장 선택</option>
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </select>
        <Button
          type="button"
          size="sm"
          onClick={onSave}
          disabled={isSaving || !selectedStoreId}
        >
          {isSaving ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Save className="size-3.5" />
          )}
          연결
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onDeactivate}
          disabled={isSaving || !manualMapping}
        >
          <Unlink className="size-3.5" />
          해제
        </Button>
      </div>

      <div className="mt-2 min-h-4 text-xs">
        {selectedStore && (
          <span className="text-muted-foreground">
            선택 매장:{" "}
            <span className="font-medium text-foreground">{selectedStore.name}</span>
          </span>
        )}
        {saved && (
          <span className="ml-2 inline-flex items-center gap-1 text-emerald-600">
            <Check className="size-3.5" />
            반영됨
          </span>
        )}
      </div>
    </div>
  );
}

function CollapsibleRoomGroup({
  title,
  desc,
  count,
  defaultOpen,
  children,
}: {
  title: string;
  desc: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);

  return (
    <div className="rounded-md border bg-background">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{title}</h3>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {count}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
        </div>
        <ChevronDown
          className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && <div className="border-t p-3">{children}</div>}
    </div>
  );
}

function KakaoIngestMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "primary" | "danger";
}) {
  const toneClass =
    tone === "primary"
      ? "border-primary/25 bg-primary/5 text-primary"
      : tone === "danger"
        ? "border-urgent/25 bg-urgent-bg text-urgent"
        : "border-border bg-background text-foreground";
  return (
    <div className={cn("rounded-md border px-3 py-2", toneClass)}>
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-base font-semibold tabular-nums">
        {value.toLocaleString("ko-KR")}
      </div>
    </div>
  );
}

function StatusPill({ tone, children }: { tone: StatusTone; children: React.ReactNode }) {
  const toneClass =
    tone === "ok"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "warn"
        ? "bg-amber-50 text-amber-700"
        : "bg-muted text-muted-foreground";
  return (
    <span className={cn("shrink-0 whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium", toneClass)}>
      {children}
    </span>
  );
}

function StatusRow({
  label,
  value,
  tone,
  desc,
}: {
  label: string;
  value: string;
  tone: StatusTone;
  desc?: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border bg-background p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="font-medium">{label}</div>
        {desc && <div className="mt-0.5 text-xs text-muted-foreground">{desc}</div>}
      </div>
      <StatusPill tone={tone}>{value}</StatusPill>
    </div>
  );
}

function GoogleSourceToggle({
  title,
  desc,
  selected,
  lastSyncedAt,
  badge,
  onChange,
}: {
  title: string;
  desc?: string | null;
  selected: boolean;
  lastSyncedAt?: string | null;
  badge?: string | null;
  onChange: (selected: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md border bg-background p-3 text-sm transition hover:border-primary/30">
      <input
        type="checkbox"
        checked={selected}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 size-4 rounded border-border accent-primary"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">{title}</span>
          {badge && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {badge}
            </span>
          )}
        </div>
        {desc && <div className="mt-0.5 text-xs text-muted-foreground">{desc}</div>}
        <div className="mt-1 text-[11px] text-muted-foreground">
          {lastSyncedAt ? `최근 동기화 ${relativeTime(lastSyncedAt)}` : "아직 동기화 전"}
        </div>
      </div>
    </label>
  );
}

function GoogleSyncMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "primary" | "warn";
}) {
  const toneClass =
    tone === "primary"
      ? "border-primary/25 bg-primary/5 text-primary"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-border bg-background text-foreground";
  return (
    <div className={cn("rounded-md border px-3 py-2", toneClass)}>
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-base font-semibold tabular-nums">
        {value.toLocaleString("ko-KR")}
      </div>
    </div>
  );
}

function statusTone(value: boolean): StatusTone {
  return value ? "ok" : "warn";
}

function configuredLabel(value: boolean) {
  return value ? "설정됨" : "없음";
}

function aipActionLabel(value: string) {
  if (value === "forwarding_draft") return "포워딩 초안";
  if (value === "proposed_quest_draft") return "퀘스트 제안";
  return value;
}

export default function SettingsPage() {
  const { profile: authProfile } = useCurrentProfile();
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [currentId, setCurrentId] = useState<string>("");
  const [draft, setDraft] = useState<ProfileRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [commonLinks, setCommonLinks] = useState({
    checklistSheetUrl: "",
    reviewSheetUrl: "",
  });
  const [savingLinks, setSavingLinks] = useState(false);
  const [linksSavedAt, setLinksSavedAt] = useState<number | null>(null);
  const [operationalSettings, setOperationalSettings] =
    useState<OperationalSettings>(DEFAULT_OPERATIONAL_SETTINGS);
  const [savingOperationalSettings, setSavingOperationalSettings] = useState(false);
  const [operationalSavedAt, setOperationalSavedAt] = useState<number | null>(null);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [kakaoMappings, setKakaoMappings] = useState<KakaoRoomMappingRow[]>([]);
  const [kakaoEvents, setKakaoEvents] = useState<KakaoEventRow[]>([]);
  const [kakaoBatches, setKakaoBatches] = useState<KakaoBatchRow[]>([]);
  const [kakaoDrafts, setKakaoDrafts] = useState<Record<string, string>>({});
  const [kakaoSavingRoom, setKakaoSavingRoom] = useState<string | null>(null);
  const [kakaoSavedRoom, setKakaoSavedRoom] = useState<string | null>(null);
  const [loadingKakao, setLoadingKakao] = useState(false);
  const [importStoreId, setImportStoreId] = useState("");
  const [importRoomTitle, setImportRoomTitle] = useState("");
  const [importSourceFileName, setImportSourceFileName] = useState("");
  const [importRawText, setImportRawText] = useState("");
  const [importingConversation, setImportingConversation] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [operationalStatus, setOperationalStatus] =
    useState<OperationalStatusSnapshot | null>(null);
  const [loadingOperationalStatus, setLoadingOperationalStatus] = useState(false);
  const [googleConnection, setGoogleConnection] =
    useState<GoogleConnectionStatus | null>(null);
  const [loadingGoogleConnection, setLoadingGoogleConnection] = useState(false);
  const [disconnectingGoogle, setDisconnectingGoogle] = useState(false);
  const [refreshingGoogleSources, setRefreshingGoogleSources] = useState(false);
  const [savingGoogleSources, setSavingGoogleSources] = useState(false);
  const [syncingGoogle, setSyncingGoogle] = useState(false);
  const [googleSyncResult, setGoogleSyncResult] = useState<GoogleSyncStats | null>(null);

  const storeMap = useMemo(
    () => new Map(stores.map((store) => [store.id, store])),
    [stores],
  );
  const storeNameMap = useMemo(
    () => new Map(stores.map((store) => [store.name, store])),
    [stores],
  );
  const mappingMap = useMemo(
    () =>
      new Map(
        kakaoMappings
          .filter((mapping) => mapping.active)
          .map((mapping) => [mapping.room_title, mapping]),
      ),
    [kakaoMappings],
  );
  const roomCandidates = useMemo<RoomCandidate[]>(() => {
    const grouped = new Map<string, RoomCandidate>();

    for (const event of kakaoEvents) {
      const roomTitle = event.room_title?.trim();
      if (!roomTitle) continue;

      const parsed =
        event.room_kind === "owner_seo" || event.room_kind === "review_work"
          ? {
              structuredKind: event.room_kind,
              structuredStoreName: parseStructuredRoomTitle(roomTitle).structuredStoreName,
            }
          : parseStructuredRoomTitle(roomTitle);
      const mapping = mappingMap.get(roomTitle);
      const suggestedStoreId = parsed.structuredStoreName
        ? storeNameMap.get(parsed.structuredStoreName)?.id ?? null
        : null;
      const current = grouped.get(roomTitle);
      if (current) {
        current.count += 1;
        if (event.status === "proposed") current.proposedCount += 1;
        if (!current.mappedStoreId && event.store_id) {
          current.mappedStoreId = event.store_id;
        }
        continue;
      }

      grouped.set(roomTitle, {
        roomTitle,
        latestEvent: event,
        count: 1,
        proposedCount: event.status === "proposed" ? 1 : 0,
        mappedStoreId: mapping?.store_id ?? event.store_id,
        suggestedStoreId,
        structuredKind: parsed.structuredKind,
        structuredStoreName: parsed.structuredStoreName,
      });
    }

    return [...grouped.values()].sort((a, b) => {
      const aMissing = a.mappedStoreId ? 1 : 0;
      const bMissing = b.mappedStoreId ? 1 : 0;
      if (aMissing !== bMissing) return aMissing - bMissing;
      return (
        new Date(b.latestEvent.received_at).getTime() -
        new Date(a.latestEvent.received_at).getTime()
      );
    });
  }, [kakaoEvents, mappingMap, storeNameMap]);

  const activeMappings = useMemo(
    () =>
      kakaoMappings
        .filter((mapping) => mapping.active)
        .sort((a, b) => a.room_title.localeCompare(b.room_title, "ko")),
    [kakaoMappings],
  );
  const needsReviewRooms = useMemo(
    () => roomCandidates.filter((candidate) => !isCandidateReady(candidate)),
    [roomCandidates],
  );
  const autoMatchedRooms = useMemo(
    () =>
      roomCandidates.filter(
        (candidate) =>
          isCandidateReady(candidate) && !mappingMap.has(candidate.roomTitle),
      ),
    [mappingMap, roomCandidates],
  );
  const savedRoomCandidates = useMemo(
    () =>
      roomCandidates.filter((candidate) => mappingMap.has(candidate.roomTitle)),
    [mappingMap, roomCandidates],
  );
  const kakaoBatchSummary = useMemo(
    () =>
      kakaoBatches.reduce(
        (acc, batch) => ({
          eventCount: acc.eventCount + batch.event_count,
          insertedCount: acc.insertedCount + batch.inserted_count,
          duplicateCount: acc.duplicateCount + batch.duplicate_count,
          proposedCount: acc.proposedCount + batch.proposed_count,
          ignoredCount: acc.ignoredCount + batch.ignored_count,
          failedCount: acc.failedCount + batch.failed_count,
        }),
        {
          eventCount: 0,
          insertedCount: 0,
          duplicateCount: 0,
          proposedCount: 0,
          ignoredCount: 0,
          failedCount: 0,
        },
      ),
    [kakaoBatches],
  );

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("profiles")
      .select("id, name, role, email, phone, avatar_url")
      .order("name")
      .then(({ data, error: err }) => {
        if (err) {
          setError(err.message);
          return;
        }
        const list = (data ?? []) as ProfileRow[];
        setProfiles(list);
      });
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const keys = [
      "common_checklist_sheet_url",
      "common_review_sheet_url",
      "notification_new_quest_enabled",
      "notification_due_soon_enabled",
      "notification_blocked_enabled",
      "notification_store_check_enabled",
      "integration_kakao_ingest_enabled",
      "integration_kakao_ingest_note",
    ];
    supabase
      .from("app_settings")
      .select("key, value")
      .in("key", keys)
      .then(({ data, error: err }) => {
        if (err) {
          setError(err.message);
          return;
        }
        const rows = (data ?? []) as SettingRow[];
        const map = new Map(rows.map((row) => [row.key, row.value ?? ""]));
        setCommonLinks({
          checklistSheetUrl: map.get("common_checklist_sheet_url") ?? "",
          reviewSheetUrl: map.get("common_review_sheet_url") ?? "",
        });
        setOperationalSettings({
          notificationNewQuestEnabled: settingBool(
            map,
            "notification_new_quest_enabled",
            DEFAULT_OPERATIONAL_SETTINGS.notificationNewQuestEnabled,
          ),
          notificationDueSoonEnabled: settingBool(
            map,
            "notification_due_soon_enabled",
            DEFAULT_OPERATIONAL_SETTINGS.notificationDueSoonEnabled,
          ),
          notificationBlockedEnabled: settingBool(
            map,
            "notification_blocked_enabled",
            DEFAULT_OPERATIONAL_SETTINGS.notificationBlockedEnabled,
          ),
          notificationStoreCheckEnabled: settingBool(
            map,
            "notification_store_check_enabled",
            DEFAULT_OPERATIONAL_SETTINGS.notificationStoreCheckEnabled,
          ),
          kakaoIngestEnabled: settingBool(
            map,
            "integration_kakao_ingest_enabled",
            DEFAULT_OPERATIONAL_SETTINGS.kakaoIngestEnabled,
          ),
          kakaoIngestNote: map.get("integration_kakao_ingest_note") ?? "",
        });
      });
  }, []);

  const loadKakaoData = useCallback(async () => {
    setLoadingKakao(true);
    setError(null);
    const supabase = createClient();
    const [storesResult, mappingsResult, eventsResult, batchesResult] = await Promise.all([
      supabase
        .from("stores")
        .select("id, name, status")
        .is("archived_at", null)
        .order("name"),
      supabase
        .from("kakao_room_mappings")
        .select("id, room_title, store_id, active, updated_at")
        .order("updated_at", { ascending: false }),
      supabase
        .from("kakao_notification_events")
        .select(
          "id, room_title, sender_name, message_text, status, store_id, received_at, room_kind, store_match_method, sender_kind, ignored_reason",
        )
        .not("room_title", "is", null)
        .order("received_at", { ascending: false })
        .limit(200),
      supabase
        .from("kakao_ingest_batches")
        .select(
          "id, device_id, event_count, inserted_count, duplicate_count, proposed_count, ignored_count, failed_count, received_at",
        )
        .order("received_at", { ascending: false })
        .limit(10),
    ]);
    setLoadingKakao(false);

    const err =
      storesResult.error ??
      mappingsResult.error ??
      eventsResult.error ??
      batchesResult.error ??
      null;
    if (err) {
      setError(err.message);
      return;
    }

    setStores((storesResult.data ?? []) as StoreOption[]);
    setKakaoMappings((mappingsResult.data ?? []) as KakaoRoomMappingRow[]);
    setKakaoEvents((eventsResult.data ?? []) as KakaoEventRow[]);
    setKakaoBatches((batchesResult.data ?? []) as KakaoBatchRow[]);
    setKakaoSavedRoom(null);
  }, []);

  useEffect(() => {
    loadKakaoData();
  }, [loadKakaoData]);

  const loadOperationalStatus = useCallback(async () => {
    setLoadingOperationalStatus(true);
    setError(null);
    const result = await getOperationalStatusAction();
    setLoadingOperationalStatus(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOperationalStatus(result.data);
  }, []);

  useEffect(() => {
    loadOperationalStatus();
  }, [loadOperationalStatus]);

  const loadGoogleConnection = useCallback(async () => {
    setLoadingGoogleConnection(true);
    setError(null);
    const result = await getGoogleConnectionStatusAction();
    setLoadingGoogleConnection(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setGoogleConnection(result.data);
  }, []);

  useEffect(() => {
    loadGoogleConnection();
  }, [loadGoogleConnection]);

  useEffect(() => {
    if (!importStoreId && stores[0]?.id) {
      setImportStoreId(stores[0].id);
    }
  }, [importStoreId, stores]);

  useEffect(() => {
    if (profiles.length === 0) return;
    const initial = authProfile?.id ?? profiles[0]?.id ?? "";
    if (!initial) return;
    setCurrentId(initial);
    localStorage.setItem("currentUserId", initial);
    const sel = profiles.find((p) => p.id === initial);
    if (sel) setDraft({ ...sel });
  }, [authProfile?.id, profiles]);

  function pickUser(id: string) {
    if (authProfile?.id) return;
    setCurrentId(id);
    if (typeof window !== "undefined") localStorage.setItem("currentUserId", id);
    const sel = profiles.find((p) => p.id === id);
    if (sel) setDraft({ ...sel });
    setSavedAt(null);
    setError(null);
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    const result = await updateProfileAction({
      id: draft.id,
      name: draft.name,
      role: draft.role,
      email: draft.email,
      phone: draft.phone,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setProfiles((prev) => prev.map((p) => (p.id === draft.id ? draft : p)));
    setSavedAt(Date.now());
  }

  async function saveCommonLinks() {
    setSavingLinks(true);
    setError(null);
    const result = await updateCommonSheetLinksAction(commonLinks);
    setSavingLinks(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setLinksSavedAt(Date.now());
  }

  async function saveOperationalSettings() {
    setSavingOperationalSettings(true);
    setError(null);
    const result = await updateOperationalSettingsAction(operationalSettings);
    setSavingOperationalSettings(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOperationalSavedAt(Date.now());
  }

  async function disconnectGoogle() {
    if (
      !window.confirm(
        "Google 계정 연결을 해제하시겠습니까?\nCalendar/Tasks 읽기 동기화도 중지됩니다.",
      )
    ) {
      return;
    }
    setDisconnectingGoogle(true);
    setError(null);
    const result = await disconnectGoogleAccountAction();
    setDisconnectingGoogle(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await Promise.all([loadGoogleConnection(), loadOperationalStatus()]);
  }

  async function refreshGoogleSources() {
    setRefreshingGoogleSources(true);
    setError(null);
    setGoogleSyncResult(null);
    const result = await refreshGoogleSyncSourcesAction();
    setRefreshingGoogleSources(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await loadGoogleConnection();
  }

  function updateGoogleCalendarSelection(sourceId: string, selected: boolean) {
    setGoogleConnection((prev) => {
      if (!prev) return prev;
      const calendars = prev.sources.calendars.map((source) =>
        source.id === sourceId ? { ...source, selected } : source,
      );
      return {
        ...prev,
        sync: {
          ...prev.sync,
          selectedCalendarCount: calendars.filter((source) => source.selected).length,
        },
        sources: { ...prev.sources, calendars },
      };
    });
  }

  function updateGoogleTaskSelection(sourceId: string, selected: boolean) {
    setGoogleConnection((prev) => {
      if (!prev) return prev;
      const taskLists = prev.sources.taskLists.map((source) =>
        source.id === sourceId ? { ...source, selected } : source,
      );
      return {
        ...prev,
        sync: {
          ...prev.sync,
          selectedTaskListCount: taskLists.filter((source) => source.selected).length,
        },
        sources: { ...prev.sources, taskLists },
      };
    });
  }

  async function saveGoogleSourceSelection() {
    if (!googleConnection) return;
    setSavingGoogleSources(true);
    setError(null);
    setGoogleSyncResult(null);
    const result = await updateGoogleSyncSourceSelectionAction({
      calendarSourceIds: googleConnection.sources.calendars
        .filter((source) => source.selected)
        .map((source) => source.id),
      taskSourceIds: googleConnection.sources.taskLists
        .filter((source) => source.selected)
        .map((source) => source.id),
    });
    setSavingGoogleSources(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await loadGoogleConnection();
  }

  async function syncGoogleNow() {
    setSyncingGoogle(true);
    setError(null);
    setGoogleSyncResult(null);
    const result = await syncMyGoogleSourcesAction();
    setSyncingGoogle(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setGoogleSyncResult(result.data);
    await loadGoogleConnection();
  }

  async function saveKakaoMapping(roomTitle: string, fallbackStoreId?: string | null) {
    const storeId = kakaoDrafts[roomTitle] ?? fallbackStoreId ?? "";
    if (!storeId) {
      setError("연결할 매장을 선택해주세요.");
      return;
    }

    setKakaoSavingRoom(roomTitle);
    setError(null);
    const result = await upsertKakaoRoomMappingAction({ roomTitle, storeId });
    setKakaoSavingRoom(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setKakaoSavedRoom(roomTitle);
    await loadKakaoData();
  }

  async function deactivateKakaoMapping(roomTitle: string) {
    if (
      !window.confirm(
        `카톡방 연결을 해제하시겠습니까?\n\n방: ${roomTitle}`,
      )
    ) {
      return;
    }
    setKakaoSavingRoom(roomTitle);
    setError(null);
    const result = await deactivateKakaoRoomMappingAction({ roomTitle });
    setKakaoSavingRoom(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setKakaoDrafts((prev) => {
      const next = { ...prev };
      delete next[roomTitle];
      return next;
    });
    setKakaoSavedRoom(roomTitle);
    await loadKakaoData();
  }

  async function importConversation() {
    if (!importStoreId) {
      setError("대화 기록을 붙일 매장을 선택해주세요.");
      return;
    }
    if (!importRawText.trim()) {
      setError("카카오톡 대화 내보내기 내용을 붙여넣어주세요.");
      return;
    }

    setImportingConversation(true);
    setImportResult(null);
    setError(null);
    const result = await importKakaoConversationTextAction({
      storeId: importStoreId,
      roomTitle: importRoomTitle || null,
      sourceFileName: importSourceFileName || null,
      rawText: importRawText,
    });
    setImportingConversation(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setImportResult(
      `메시지 ${result.importedCount ?? 0}건 저장 · 톤 예시 ${result.toneExampleCount ?? 0}건 반영`,
    );
    setImportRawText("");
    setImportSourceFileName("");
    await loadKakaoData();
  }

  const initial = draft?.name?.[0] ?? "?";
  const roleLabel = ROLE_OPTIONS.find((r) => r.code === draft?.role)?.label ?? "—";
  const renderKakaoRoomCards = (rooms: RoomCandidate[], mode: RoomListMode) => {
    if (rooms.length === 0) {
      const emptyText =
        mode === "needs"
          ? "확인 필요한 카톡방이 없습니다."
          : mode === "auto"
            ? "자동 매칭된 카톡방이 없습니다."
            : "저장된 수동 연결이 없습니다.";
      return (
        <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          {emptyText}
        </div>
      );
    }

    return (
      <div className="grid gap-3 xl:grid-cols-2">
        {rooms.map((candidate) => {
          const manualMapping = mappingMap.get(candidate.roomTitle);
          const selectedStoreId =
            kakaoDrafts[candidate.roomTitle] ??
            manualMapping?.store_id ??
            candidate.suggestedStoreId ??
            candidate.mappedStoreId ??
            "";
          return (
            <KakaoRoomCard
              key={candidate.roomTitle}
              candidate={candidate}
              stores={stores}
              storeMap={storeMap}
              selectedStoreId={selectedStoreId}
              manualMapping={manualMapping}
              isSaving={kakaoSavingRoom === candidate.roomTitle}
              saved={kakaoSavedRoom === candidate.roomTitle}
              onSelectStore={(storeId) =>
                setKakaoDrafts((prev) => ({
                  ...prev,
                  [candidate.roomTitle]: storeId,
                }))
              }
              onSave={() => saveKakaoMapping(candidate.roomTitle, selectedStoreId)}
              onDeactivate={() => deactivateKakaoMapping(candidate.roomTitle)}
            />
          );
        })}
      </div>
    );
  };

  return (
    <main className="flex flex-1 flex-col gap-5 overflow-y-auto p-6 lg:p-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">내 정보</h1>
        <p className="text-sm text-muted-foreground">
          셋이서 같이 쓰는 도구. 위에서 현재 사용자를 선택 — 퀘스트 본인 필터·매장 담당자 등의 기준이 됩니다.
        </p>
      </header>

      {error && (
        <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">
          저장 실패: {error}
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        {/* 프로필 */}
        <Section
          icon={User}
          title="프로필"
          desc="로그인한 계정 기준으로 자동 선택 + 본인 정보 수정"
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">현재 사용자</span>
            <select
              className={inputCls}
              value={currentId}
              onChange={(e) => pickUser(e.target.value)}
              disabled={Boolean(authProfile?.id)}
            >
              {profiles.length === 0 && <option>불러오는 중...</option>}
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {authProfile?.email && (
              <span className="text-xs text-muted-foreground">
                로그인 계정: {authProfile.email}
              </span>
            )}
          </label>

          {draft && (
            <>
              <div className="flex items-center gap-4 border-t pt-3">
                <div className="flex size-14 items-center justify-center rounded-full bg-muted text-lg font-semibold">
                  {initial}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{draft.name}</div>
                  <div className="text-xs text-muted-foreground">{roleLabel}</div>
                </div>
              </div>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium">이름</span>
                <input
                  className={inputCls}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium">이메일</span>
                <input
                  className={inputCls}
                  type="email"
                  value={draft.email ?? ""}
                  onChange={(e) => setDraft({ ...draft, email: e.target.value || null })}
                  placeholder="name@bizhigh.dev"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium">연락처</span>
                <input
                  className={inputCls}
                  value={draft.phone ?? ""}
                  onChange={(e) => setDraft({ ...draft, phone: e.target.value || null })}
                  placeholder="010-0000-0000"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium">역할</span>
                <select
                  className={inputCls}
                  value={draft.role}
                  onChange={(e) =>
                    setDraft({ ...draft, role: e.target.value as ProfileRow["role"] })
                  }
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-2 pt-2">
                <Button onClick={save} disabled={saving}>
                  {saving && <Loader2 className="size-4 animate-spin" />}
                  저장
                </Button>
                {savedAt && (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                    <Check className="size-3.5" />
                    저장됨
                  </span>
                )}
              </div>
            </>
          )}
        </Section>

        {/* 공용 링크 */}
        <Section
          icon={LinkIcon}
          title="공용 시트 링크"
          desc="매장별로 따로 받지 않는 체크리스트·리뷰 시트"
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">체크리스트 시트</span>
            <input
              className={inputCls}
              type="url"
              value={commonLinks.checklistSheetUrl}
              onChange={(e) =>
                setCommonLinks((prev) => ({
                  ...prev,
                  checklistSheetUrl: e.target.value,
                }))
              }
              placeholder="https://docs.google.com/spreadsheets/d/..."
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">리뷰 시트</span>
            <input
              className={inputCls}
              type="url"
              value={commonLinks.reviewSheetUrl}
              onChange={(e) =>
                setCommonLinks((prev) => ({
                  ...prev,
                  reviewSheetUrl: e.target.value,
                }))
              }
              placeholder="https://docs.google.com/spreadsheets/d/..."
            />
          </label>
          <div className="flex items-center gap-2 pt-2">
            <Button onClick={saveCommonLinks} disabled={savingLinks}>
              {savingLinks && <Loader2 className="size-4 animate-spin" />}
              저장
            </Button>
            {linksSavedAt && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                <Check className="size-3.5" />
                저장됨
              </span>
            )}
          </div>
        </Section>

        <div className="md:col-span-2">
          <Section
            icon={ShieldCheck}
            title="운영 상태"
            desc="민감값은 숨기고 설정 여부와 최근 실행만 확인"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">
                AIP/Kakao 운영에 필요한 서버 설정과 최근 실행 로그를 봅니다.
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={loadOperationalStatus}
                disabled={loadingOperationalStatus}
              >
                <RefreshCw
                  className={cn(
                    "size-3.5",
                    loadingOperationalStatus && "animate-spin",
                  )}
                />
                새로고침
              </Button>
            </div>

            {operationalStatus ? (
              <>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <StatusRow
                    label="Kimi provider"
                    value={
                      operationalStatus.aip.providerPreference === "kimi"
                        ? "Kimi 지정"
                        : operationalStatus.aip.providerPreference === "auto"
                          ? "자동 선택"
                          : "OpenAI 지정"
                    }
                    tone={
                      operationalStatus.aip.providerPreference === "openai"
                        ? "muted"
                        : "ok"
                    }
                    desc={`model ${operationalStatus.aip.kimiModel}`}
                  />
                  <StatusRow
                    label="Kimi API key"
                    value={
                      operationalStatus.aip.kimiApiKeyConfigured
                        ? "Kimi 키 있음"
                        : "Kimi 키 없음"
                    }
                    tone={statusTone(operationalStatus.aip.kimiApiKeyConfigured)}
                    desc={`thinking ${operationalStatus.aip.kimiThinking}`}
                  />
                  <StatusRow
                    label="AIP disable"
                    value={
                      operationalStatus.aip.disableLlm
                        ? "AI 호출 꺼짐"
                        : "AI 호출 가능"
                    }
                    tone={operationalStatus.aip.disableLlm ? "warn" : "ok"}
                    desc={
                      operationalStatus.aip.disableLlm
                        ? "AIP_DISABLE_LLM=true"
                        : "disable 플래그 없음"
                    }
                  />
                  <StatusRow
                    label="Supabase admin"
                    value={
                      operationalStatus.supabaseAdmin.serviceRoleKeyConfigured
                        ? "service role 있음"
                        : "service role 없음"
                    }
                    tone={statusTone(
                      operationalStatus.supabaseAdmin.serviceRoleKeyConfigured,
                    )}
                    desc={`URL ${configuredLabel(operationalStatus.supabaseAdmin.urlConfigured)}`}
                  />
                  <StatusRow
                    label="Kakao ingest token"
                    value={
                      operationalStatus.kakao.ingestTokenConfigured
                        ? "카톡 수집 토큰 설정됨"
                        : "카톡 수집 토큰 없음"
                    }
                    tone={statusTone(operationalStatus.kakao.ingestTokenConfigured)}
                    desc="토큰 값은 표시하지 않음"
                  />
                  <StatusRow
                    label="Google OAuth"
                    value={
                      operationalStatus.google.oauthConfigured &&
                      operationalStatus.google.tokenEncryptionConfigured
                        ? "연동 준비됨"
                        : "설정 필요"
                    }
                    tone={
                      operationalStatus.google.oauthConfigured &&
                      operationalStatus.google.tokenEncryptionConfigured
                        ? "ok"
                        : "warn"
                    }
                    desc={`OAuth ${configuredLabel(operationalStatus.google.oauthConfigured)} / token key ${configuredLabel(operationalStatus.google.tokenEncryptionConfigured)}`}
                  />
                  <StatusRow
                    label="Kakao 최근 batch"
                    value={
                      kakaoBatches[0]
                        ? `${relativeTime(kakaoBatches[0].received_at)}`
                        : "최근 수집 없음"
                    }
                    tone={kakaoBatches[0] ? "ok" : "muted"}
                    desc={
                      kakaoBatches[0]
                        ? `${kakaoBatches[0].event_count}건 수신 / ${kakaoBatches[0].inserted_count}건 저장`
                        : "태블릿 봇 수집 로그가 아직 없습니다."
                    }
                  />
                </div>

                <div className="rounded-md border bg-background">
                  <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
                    <h3 className="text-sm font-semibold">최근 AIP 실행 로그</h3>
                    <span className="text-xs text-muted-foreground">
                      {operationalStatus.recentAipLogs.length}건
                    </span>
                  </div>
                  {operationalStatus.recentAipLogs.length === 0 ? (
                    <div className="p-4 text-sm text-muted-foreground">
                      최근 AI 호출 없음
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px] text-left text-sm">
                        <thead className="text-xs text-muted-foreground">
                          <tr className="border-b">
                            <th className="px-3 py-2 font-medium">시간</th>
                            <th className="px-3 py-2 font-medium">provider</th>
                            <th className="px-3 py-2 font-medium">model</th>
                            <th className="px-3 py-2 font-medium">status</th>
                            <th className="px-3 py-2 font-medium">action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {operationalStatus.recentAipLogs.map((log) => (
                            <tr key={log.id} className="border-b last:border-b-0">
                              <td className="px-3 py-2 text-muted-foreground">
                                {relativeTime(log.createdAt)}
                              </td>
                              <td className="px-3 py-2">{log.provider}</td>
                              <td className="px-3 py-2">{log.model ?? "-"}</td>
                              <td className="px-3 py-2">
                                <StatusPill
                                  tone={
                                    log.status === "success"
                                      ? "ok"
                                      : log.status === "fallback"
                                        ? "muted"
                                        : "warn"
                                  }
                                >
                                  {log.status}
                                </StatusPill>
                              </td>
                              <td className="px-3 py-2">
                                {aipActionLabel(log.actionType)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                {loadingOperationalStatus
                  ? "운영 상태를 확인하는 중..."
                  : "운영 상태를 불러오지 못했습니다."}
              </div>
            )}
          </Section>
        </div>

        <div className="md:col-span-2">
          <Section
            icon={KeyRound}
            title="Google Calendar·Tasks 연동"
            desc="개인별 Google 계정을 연결하고, 읽어온 일정·할일은 제안함으로 검수"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">
                선택된 캘린더·할일 목록만 읽고, 새 항목은 바로 실행하지 않고 퀘스트 제안함으로 보냅니다.
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={loadGoogleConnection}
                disabled={loadingGoogleConnection}
              >
                <RefreshCw
                  className={cn(
                    "size-3.5",
                    loadingGoogleConnection && "animate-spin",
                  )}
                />
                새로고침
              </Button>
            </div>

            {googleConnection ? (
              <div className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <StatusRow
                    label="Google OAuth env"
                    value={
                      googleConnection.configured.oauth &&
                      googleConnection.configured.tokenEncryption
                        ? "설정됨"
                        : "설정 필요"
                    }
                    tone={
                      googleConnection.configured.oauth &&
                      googleConnection.configured.tokenEncryption
                        ? "ok"
                        : "warn"
                    }
                    desc={`client ${configuredLabel(googleConnection.configured.oauth)} / encryption ${configuredLabel(googleConnection.configured.tokenEncryption)}`}
                  />
                  <StatusRow
                    label="내 Google 계정"
                    value={
                      googleConnection.account.connected
                        ? "연결됨"
                        : googleConnection.account.revokedAt
                          ? "해제됨"
                          : "연결 전"
                    }
                    tone={googleConnection.account.connected ? "ok" : "muted"}
                    desc={
                      googleConnection.account.email
                        ? `${googleConnection.account.email}${googleConnection.account.connectedAt ? ` · ${relativeTime(googleConnection.account.connectedAt)}` : ""}`
                        : "아직 연결된 Google 계정이 없습니다."
                    }
                  />
                </div>

                <div className="rounded-md border bg-background p-3 text-sm">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <div className="font-medium">
                        {googleConnection.account.displayName ??
                          googleConnection.account.email ??
                          "Google 계정 연결"}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <StatusPill
                          tone={
                            googleConnection.account.scopes.includes(
                              "https://www.googleapis.com/auth/calendar.readonly",
                            )
                              ? "ok"
                              : "muted"
                          }
                        >
                          Calendar 읽기
                        </StatusPill>
                        <StatusPill
                          tone={
                            googleConnection.account.scopes.includes(
                              "https://www.googleapis.com/auth/tasks.readonly",
                            )
                              ? "ok"
                              : "muted"
                          }
                        >
                          Tasks 읽기
                        </StatusPill>
                      </div>
                      {!googleConnection.configured.oauth ||
                      !googleConnection.configured.tokenEncryption ? (
                        <p className="mt-2 text-xs text-warning">
                          Vercel에 GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
                          GOOGLE_TOKEN_ENCRYPTION_KEY가 필요합니다.
                        </p>
                      ) : (
                        <p className="mt-2 text-xs text-muted-foreground">
                          최근 전체 동기화:{" "}
                          {googleConnection.sync.lastSyncedAt
                            ? relativeTime(googleConnection.sync.lastSyncedAt)
                            : "아직 없음"}
                        </p>
                      )}
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                      {googleConnection.configured.oauth &&
                      googleConnection.configured.tokenEncryption ? (
                        <Button asChild className="w-full sm:w-auto">
                          <Link href="/api/integrations/google/oauth/start">
                            {googleConnection.account.connected ? "다시 연결" : "Google 연결"}
                          </Link>
                        </Button>
                      ) : (
                        <Button disabled className="w-full sm:w-auto">
                          Google 연결
                        </Button>
                      )}
                      {googleConnection.account.connected && (
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full sm:w-auto"
                          onClick={disconnectGoogle}
                          disabled={disconnectingGoogle}
                        >
                          {disconnectingGoogle && (
                            <Loader2 className="size-3.5 animate-spin" />
                          )}
                          연결 해제
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {googleConnection.account.connected && (
                  <>
                    <div className="grid gap-2 sm:grid-cols-4">
                      <GoogleSyncMetric
                        label="캘린더 선택"
                        value={googleConnection.sync.selectedCalendarCount}
                        tone="primary"
                      />
                      <GoogleSyncMetric
                        label="캘린더 전체"
                        value={googleConnection.sync.calendarCount}
                      />
                      <GoogleSyncMetric
                        label="Tasks 선택"
                        value={googleConnection.sync.selectedTaskListCount}
                        tone="primary"
                      />
                      <GoogleSyncMetric
                        label="Tasks 전체"
                        value={googleConnection.sync.taskListCount}
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={refreshGoogleSources}
                        disabled={refreshingGoogleSources}
                      >
                        {refreshingGoogleSources ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <RefreshCw className="size-4" />
                        )}
                        목록 가져오기
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={saveGoogleSourceSelection}
                        disabled={savingGoogleSources}
                      >
                        {savingGoogleSources && <Loader2 className="size-4 animate-spin" />}
                        선택 저장
                      </Button>
                      <Button
                        type="button"
                        onClick={syncGoogleNow}
                        disabled={
                          syncingGoogle ||
                          googleConnection.sync.selectedCalendarCount +
                            googleConnection.sync.selectedTaskListCount ===
                            0
                        }
                      >
                        {syncingGoogle && <Loader2 className="size-4 animate-spin" />}
                        지금 동기화
                      </Button>
                    </div>

                    {googleSyncResult && (
                      <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                        <div className="font-medium text-foreground">동기화 결과</div>
                        <div className="mt-1">
                          Calendar 제안 {googleSyncResult.calendarProposalsCreated}건 ·
                          Tasks 제안 {googleSyncResult.taskProposalsCreated}건 · 중복 제외{" "}
                          {googleSyncResult.calendarDuplicatesSkipped +
                            googleSyncResult.taskDuplicatesSkipped}
                          건
                        </div>
                        {googleSyncResult.errors.length > 0 && (
                          <div className="mt-1 text-amber-700">
                            오류 {googleSyncResult.errors.length}건:{" "}
                            {googleSyncResult.errors.slice(0, 2).join(" / ")}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="grid gap-3 lg:grid-cols-2">
                      <div className="space-y-2">
                        <div className="text-sm font-semibold">캘린더</div>
                        {googleConnection.sources.calendars.length === 0 ? (
                          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                            아직 불러온 캘린더가 없습니다. 목록 가져오기를 먼저 실행하세요.
                          </div>
                        ) : (
                          googleConnection.sources.calendars.map((source) => (
                            <GoogleSourceToggle
                              key={source.id}
                              title={source.summary}
                              desc={source.timezone}
                              badge={source.isPrimary ? "기본" : source.accessRole}
                              selected={source.selected}
                              lastSyncedAt={
                                source.lastIncrementalSyncAt ?? source.lastFullSyncAt
                              }
                              onChange={(selected) =>
                                updateGoogleCalendarSelection(source.id, selected)
                              }
                            />
                          ))
                        )}
                      </div>

                      <div className="space-y-2">
                        <div className="text-sm font-semibold">Google Tasks</div>
                        {googleConnection.sources.taskLists.length === 0 ? (
                          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                            아직 불러온 할일 목록이 없습니다. 목록 가져오기를 먼저 실행하세요.
                          </div>
                        ) : (
                          googleConnection.sources.taskLists.map((source) => (
                            <GoogleSourceToggle
                              key={source.id}
                              title={source.title}
                              selected={source.selected}
                              lastSyncedAt={source.lastSyncedAt}
                              onChange={(selected) =>
                                updateGoogleTaskSelection(source.id, selected)
                              }
                            />
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                {loadingGoogleConnection
                  ? "Google 연결 상태를 확인하는 중..."
                  : "Google 연결 상태를 불러오지 못했습니다."}
              </div>
            )}
          </Section>
        </div>

        <div className="md:col-span-2">
          <Section
            icon={MessageSquare}
            title="카톡방 매장 연결"
            desc="[SEO] 업장명·[작업] 업장명은 자동 매칭, 예외 방 이름은 여기서 수동 연결"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">
                확인 필요 {needsReviewRooms.length}개 · 자동 매칭{" "}
                {autoMatchedRooms.length}개 · 수동 연결 {activeMappings.length}개
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={loadKakaoData}
                disabled={loadingKakao}
              >
                <RefreshCw className={cn("size-3.5", loadingKakao && "animate-spin")} />
                새로고침
              </Button>
            </div>

            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <KakaoIngestMetric label="최근 수신" value={kakaoBatchSummary.eventCount} />
              <KakaoIngestMetric label="신규 저장" value={kakaoBatchSummary.insertedCount} />
              <KakaoIngestMetric label="중복 차단" value={kakaoBatchSummary.duplicateCount} />
              <KakaoIngestMetric label="제안 생성" value={kakaoBatchSummary.proposedCount} tone="primary" />
              <KakaoIngestMetric label="무시" value={kakaoBatchSummary.ignoredCount} />
              <KakaoIngestMetric
                label="실패"
                value={kakaoBatchSummary.failedCount}
                tone={kakaoBatchSummary.failedCount > 0 ? "danger" : "default"}
              />
            </div>

            {kakaoBatches[0] && (
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                최근 수집: {relativeTime(kakaoBatches[0].received_at)}
                {kakaoBatches[0].device_id && <> · 기기 {kakaoBatches[0].device_id}</>}
                {" · "}
                {kakaoBatches[0].event_count}건 수신 / {kakaoBatches[0].inserted_count}건 저장 /{" "}
                {kakaoBatches[0].proposed_count}건 제안
              </div>
            )}

            <CollapsibleRoomGroup
              title="대화 내보내기 import"
              desc="매장별 전체 카톡 대화 기록을 붙여넣으면 포워딩 톤 프로필에 반영합니다."
              count={importResult ? 1 : 0}
            >
              <div className="space-y-3">
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="font-medium">매장</span>
                    <select
                      className={inputCls}
                      value={importStoreId}
                      onChange={(event) => setImportStoreId(event.target.value)}
                    >
                      {stores.map((store) => (
                        <option key={store.id} value={store.id}>
                          {store.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="font-medium">카톡방 이름</span>
                    <input
                      className={inputCls}
                      value={importRoomTitle}
                      onChange={(event) => setImportRoomTitle(event.target.value)}
                      placeholder="[SEO] 업장명"
                    />
                  </label>
                </div>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium">TXT 파일</span>
                  <input
                    type="file"
                    accept=".txt,.csv,text/plain"
                    className={inputCls}
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      setImportSourceFileName(file.name);
                      setImportRawText(await file.text());
                    }}
                  />
                </label>
                <textarea
                  value={importRawText}
                  onChange={(event) => setImportRawText(event.target.value)}
                  placeholder="카카오톡 대화 내보내기 내용을 붙여넣어도 됩니다."
                  className="min-h-[150px] w-full resize-y rounded-md border bg-background px-3 py-2 text-xs leading-relaxed outline-none focus:ring-1 focus:ring-primary"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    onClick={importConversation}
                    disabled={importingConversation || !importStoreId || !importRawText.trim()}
                  >
                    {importingConversation && <Loader2 className="size-4 animate-spin" />}
                    대화 기록 반영
                  </Button>
                  {importSourceFileName && (
                    <span className="text-xs text-muted-foreground">
                      파일: {importSourceFileName}
                    </span>
                  )}
                  {importResult && (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                      <Check className="size-3.5" />
                      {importResult}
                    </span>
                  )}
                </div>
              </div>
            </CollapsibleRoomGroup>

            {roomCandidates.length === 0 ? (
              <div className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">
                아직 수집된 카톡방이 없습니다. 태블릿 봇을 켠 뒤 테스트 메시지를 보내면 여기에 표시됩니다.
              </div>
            ) : (
              <div className="space-y-3">
                <CollapsibleRoomGroup
                  title="확인 필요한 방"
                  desc="표준 이름이 아니거나 매장명을 찾지 못한 방만 확인하면 됩니다."
                  count={needsReviewRooms.length}
                  defaultOpen
                >
                  {renderKakaoRoomCards(needsReviewRooms.slice(0, 12), "needs")}
                </CollapsibleRoomGroup>

                <CollapsibleRoomGroup
                  title="자동 매칭된 방"
                  desc="[SEO] 업장명·[작업] 업장명 규칙으로 이미 매장에 붙은 방입니다."
                  count={autoMatchedRooms.length}
                >
                  {renderKakaoRoomCards(autoMatchedRooms.slice(0, 12), "auto")}
                </CollapsibleRoomGroup>

                <CollapsibleRoomGroup
                  title="저장된 수동 연결"
                  desc="예외 방 이름을 사람이 직접 연결해둔 목록입니다."
                  count={savedRoomCandidates.length}
                >
                  {renderKakaoRoomCards(savedRoomCandidates.slice(0, 12), "saved")}
                </CollapsibleRoomGroup>
              </div>
            )}
          </Section>
        </div>

        {/* 알림 */}
        <Section icon={Bell} title="알림" desc="언제 어떻게 받을지 설정">
          <Toggle
            label="새 퀘스트"
            desc="수동 알림·새 리드 계열 알림을 헤더 종에 표시"
            checked={operationalSettings.notificationNewQuestEnabled}
            onCheckedChange={(value) =>
              setOperationalSettings((prev) => ({
                ...prev,
                notificationNewQuestEnabled: value,
              }))
            }
          />
          <Toggle
            label="마감 임박"
            desc="퀘스트 마감·계약 종료 알림을 헤더 종에 표시"
            checked={operationalSettings.notificationDueSoonEnabled}
            onCheckedChange={(value) =>
              setOperationalSettings((prev) => ({
                ...prev,
                notificationDueSoonEnabled: value,
              }))
            }
          />
          <Toggle
            label="차단됨 발생"
            desc="시트 누락·의료법 컨펌 같은 진행 차단 알림 표시"
            checked={operationalSettings.notificationBlockedEnabled}
            onCheckedChange={(value) =>
              setOperationalSettings((prev) => ({
                ...prev,
                notificationBlockedEnabled: value,
              }))
            }
          />
          <Toggle
            label="매장 점검 필요"
            desc="매장 점검 신선도·일시중지 후보 알림 표시"
            checked={operationalSettings.notificationStoreCheckEnabled}
            onCheckedChange={(value) =>
              setOperationalSettings((prev) => ({
                ...prev,
                notificationStoreCheckEnabled: value,
              }))
            }
          />
          <div className="flex items-center gap-2 pt-2">
            <Button onClick={saveOperationalSettings} disabled={savingOperationalSettings}>
              {savingOperationalSettings && <Loader2 className="size-4 animate-spin" />}
              알림 설정 저장
            </Button>
            {operationalSavedAt && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                <Check className="size-3.5" />
                저장됨
              </span>
            )}
          </div>
        </Section>

        {/* 외부 채널 연동 */}
        <Section
          icon={MessageSquare}
          title="외부 연동"
          desc="실제 동작하는 연동만 켜고 끄기"
        >
          <div className="rounded-md border p-3 text-sm">
            <Toggle
              label="카톡 수집 API"
              desc="OFF면 태블릿/MessengerBotR에서 들어오는 카톡 이벤트를 저장하지 않음"
              checked={operationalSettings.kakaoIngestEnabled}
              onCheckedChange={(value) =>
                setOperationalSettings((prev) => ({
                  ...prev,
                  kakaoIngestEnabled: value,
                }))
              }
            />
            <label className="mt-2 flex flex-col gap-1.5 text-sm">
              <span className="font-medium">운영 메모</span>
              <textarea
                className={`${inputCls} min-h-20 resize-y`}
                value={operationalSettings.kakaoIngestNote}
                onChange={(e) =>
                  setOperationalSettings((prev) => ({
                    ...prev,
                    kakaoIngestNote: e.target.value,
                  }))
                }
                placeholder="예: 태블릿 기기명, 설치 위치, 점검 메모"
              />
            </label>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3 text-sm">
            <div>
              <div className="font-medium">구글 시트</div>
              <div className="text-xs text-muted-foreground">
                공용 체크리스트·리뷰 시트 링크 기준으로 사용
              </div>
            </div>
            <span
              className={cn(
                "rounded-full px-2 py-1 text-xs font-medium",
                commonLinks.checklistSheetUrl || commonLinks.reviewSheetUrl
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {commonLinks.checklistSheetUrl || commonLinks.reviewSheetUrl
                ? "설정됨"
                : "미설정"}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3 text-sm">
            <div>
              <div className="font-medium">전자서명</div>
              <div className="text-xs text-muted-foreground">
                외부 서비스 선택 전까지 SaaS 연결 없음
              </div>
            </div>
            <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
              보류
            </span>
          </div>
          <div className="flex items-center gap-2 pt-2">
            <Button onClick={saveOperationalSettings} disabled={savingOperationalSettings}>
              {savingOperationalSettings && <Loader2 className="size-4 animate-spin" />}
              연동 설정 저장
            </Button>
            {operationalSavedAt && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                <Check className="size-3.5" />
                저장됨
              </span>
            )}
          </div>
        </Section>

        {/* 계정 관리 */}
        <Section
          icon={KeyRound}
          title="계정 관리"
          desc="비밀번호와 세션. /app 화면은 로그인 계정만 접근."
        >
          <Button asChild variant="outline">
            <Link href="/login">로그인 페이지 열기</Link>
          </Button>
          <form action={signOutAction}>
            <Button
              type="submit"
              variant="outline"
              className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
            >
              <LogOut className="size-4" />
              로그아웃
            </Button>
          </form>
        </Section>
      </div>
    </main>
  );
}
