"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Building2,
  CalendarClock,
  CheckCircle2,
  Loader2,
  Plus,
  Search,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { updateStoreAssignees as updateStoreAssigneesAction } from "@/lib/actions/store";
import type { Json } from "@/lib/database.types";
import { serviceLabel } from "@/lib/pricing";
import { StatusBadge, StoreStatusBadge } from "@/components/status-badge";
import {
  storeStatusLabel,
  todayStr,
  type StoreStatus,
} from "@/lib/mock-data";

type StoreRow = {
  id: string;
  name: string;
  type_code: string;
  status: StoreStatus;
  monthly_fee: number | null;
  start_date: string | null;
  last_health_check_at: string | null;
  assigned_owner_id: string | null;
  metadata: Json;
  store_types: { label: string } | null;
};

type Staff = { id: string; name: string };
type StoreAssignee = { store_id: string; profile_id: string };

const statusFilters: ("all" | StoreStatus)[] = [
  "all",
  "contract_pending",
  "contract_signed",
  "ready_to_start",
  "active",
  "paused",
  "churned",
];

const typeFilters = ["전체", "요식업", "뷰티", "병의원", "약국", "기타"] as const;

function daysSince(dateStr: string | null, today: string) {
  if (!dateStr) return null;
  const a = new Date(dateStr).getTime();
  const b = new Date(today).getTime();
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

function fmtMoney(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString("ko-KR");
}

function serviceLabelsFromMetadata(metadata: Json) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return [];
  }
  const raw = metadata.services;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === "string").map(serviceLabel);
}

function SummaryCard({
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
    neutral: "border-slate-200 bg-card text-foreground",
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
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function healthBadge(days: number | null) {
  if (days == null) return <StatusBadge tone="neutral" size="sm">기록 없음</StatusBadge>;
  if (days >= 14) return <StatusBadge tone="urgent" size="sm">즉시 점검 · {days}일</StatusBadge>;
  if (days >= 7) return <StatusBadge tone="warning" size="sm">점검 필요 · {days}일</StatusBadge>;
  if (days === 0) return <StatusBadge tone="success" size="sm">오늘</StatusBadge>;
  return <StatusBadge tone="success" size="sm">정상 · {days}일</StatusBadge>;
}

export default function StoresPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"all" | StoreStatus>("all");
  const [type, setType] = useState<(typeof typeFilters)[number]>("전체");
  const [q, setQ] = useState("");
  const [stores, setStores] = useState<StoreRow[] | null>(null);
  const [storeAssignees, setStoreAssignees] = useState<StoreAssignee[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase
        .from("stores")
        .select(
          "id, name, type_code, status, monthly_fee, start_date, last_health_check_at, assigned_owner_id, metadata, store_types(label)",
        )
        .is("archived_at", null)
        .order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, name").order("name"),
      supabase.from("store_assignees").select("store_id, profile_id"),
    ]).then(([storesRes, staffRes, assigneesRes]) => {
      if (storesRes.error) {
        setError(storesRes.error.message);
        return;
      }
      if (staffRes.error) {
        setError(staffRes.error.message);
        return;
      }
      if (assigneesRes.error) {
        setError(assigneesRes.error.message);
        return;
      }
      setStores((storesRes.data ?? []) as unknown as StoreRow[]);
      setStaff((staffRes.data ?? []) as Staff[]);
      setStoreAssignees((assigneesRes.data ?? []) as StoreAssignee[]);
    });
  }, []);

  async function setAssignees(storeId: string, assigneeIds: string[]) {
    const prevStores = stores;
    const prevAssignees = storeAssignees;
    const unique = Array.from(new Set(assigneeIds));
    const storeName = stores?.find((store) => store.id === storeId)?.name ?? "이 매장";
    const assigneeNames =
      unique
        .map((profileId) => staff.find((member) => member.id === profileId)?.name)
        .filter((name): name is string => Boolean(name))
        .join(", ") || "담당자 없음";
    if (
      !window.confirm(
        `${storeName} 담당자를 ${assigneeNames}(으)로 변경하시겠습니까?`,
      )
    ) {
      return;
    }
    setStores(
      (cur) =>
        cur?.map((s) =>
          s.id === storeId ? { ...s, assigned_owner_id: unique[0] ?? null } : s,
        ) ?? null,
    );
    setStoreAssignees((cur) => [
      ...cur.filter((row) => row.store_id !== storeId),
      ...unique.map((profileId) => ({ store_id: storeId, profile_id: profileId })),
    ]);
    const result = await updateStoreAssigneesAction(storeId, unique);
    if (!result.ok) {
      setError(`담당자 변경 실패: ${result.error}`);
      setStores(prevStores);
      setStoreAssignees(prevAssignees);
    }
  }

  const assigneeMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of storeAssignees) {
      const list = map.get(row.store_id) ?? [];
      if (!list.includes(row.profile_id)) list.push(row.profile_id);
      map.set(row.store_id, list);
    }
    stores?.forEach((store) => {
      if (!map.has(store.id) && store.assigned_owner_id) {
        map.set(store.id, [store.assigned_owner_id]);
      }
    });
    return map;
  }, [storeAssignees, stores]);

  const filtered = useMemo(() => {
    if (!stores) return [];
    return stores.filter((s) => {
      if (status !== "all" && s.status !== status) return false;
      const label = s.store_types?.label ?? "";
      if (type !== "전체" && label !== type) return false;
      if (q && !s.name.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [stores, status, type, q]);

  const staleCount = useMemo(() => {
    if (!stores) return 0;
    return stores.filter((s) => {
      const d = daysSince(s.last_health_check_at, todayStr);
      return d != null && d >= 7;
    }).length;
  }, [stores]);
  const activeCount = stores?.filter((s) => s.status === "active").length ?? 0;
  const readyCount = stores?.filter((s) => s.status === "ready_to_start").length ?? 0;
  const monthlyTotal =
    stores?.reduce((sum, s) => sum + (s.monthly_fee ?? 0), 0) ?? 0;

  return (
    <main className="flex flex-1 flex-col gap-5 overflow-y-auto p-6 lg:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">매장 관리</h1>
          <p className="text-sm text-muted-foreground">
            {stores == null ? "불러오는 중…" : `전체 ${stores.length}건`}
            {staleCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-rose-600">
                <AlertCircle className="size-3.5" />
                매장 점검 필요 {staleCount}건
              </span>
            )}
          </p>
        </div>
        <Button asChild>
          <Link href="/app/stores/new">
            <Plus className="size-4" />
            매장 등록
          </Link>
        </Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard icon={Building2} label="전체 매장" value={stores == null ? "—" : `${stores.length}건`} />
        <SummaryCard icon={CheckCircle2} label="관리 중" value={`${activeCount}건`} tone="success" />
        <SummaryCard icon={CalendarClock} label="시작일 대기" value={`${readyCount}건`} tone="warning" />
        <SummaryCard
          icon={AlertCircle}
          label="점검 필요"
          value={`${staleCount}건`}
          tone={staleCount > 0 ? "urgent" : "neutral"}
        />
        <SummaryCard icon={WalletCards} label="월 공급가 합계" value={`${fmtMoney(monthlyTotal)}원`} tone="info" />
      </div>

      {error && (
        <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">
          DB 조회 에러: {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3 shadow-sm">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="매장명 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-foreground/30"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {statusFilters.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-xs transition-colors",
                status === s
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {s === "all" ? "전체 상태" : storeStatusLabel[s]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {typeFilters.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-xs transition-colors",
                type === t
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium">매장</th>
              <th className="px-4 py-3 text-left font-medium">서비스</th>
              <th className="px-4 py-3 text-left font-medium">상태</th>
              <th className="px-4 py-3 text-left font-medium">담당자</th>
              <th className="px-4 py-3 text-right font-medium">월 단가</th>
              <th className="px-4 py-3 text-left font-medium">시작일</th>
              <th className="px-4 py-3 text-left font-medium">매장 점검</th>
            </tr>
          </thead>
          <tbody>
            {stores == null ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                  <Loader2 className="mx-auto size-5 animate-spin" />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                  조건에 맞는 매장이 없습니다
                </td>
              </tr>
            ) : (
              filtered.map((s) => {
                const staleDays = daysSince(s.last_health_check_at, todayStr);
                const isStale = staleDays != null && staleDays >= 7;
                const serviceLabels = serviceLabelsFromMetadata(s.metadata);
                const displayServiceLabels =
                  serviceLabels.length > 0
                    ? serviceLabels
                    : ["구글 SEO/GBP 관리"];
                return (
                  <tr
                    key={s.id}
                    onClick={() => router.push(`/app/stores/${s.id}`)}
                    className={cn(
                      "cursor-pointer border-t transition-colors hover:bg-sky-50/50",
                      isStale && "bg-red-50/30 hover:bg-red-50/60",
                    )}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{s.name}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <StatusBadge tone="neutral" size="sm">
                          {s.store_types?.label ?? s.type_code}
                        </StatusBadge>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex max-w-[360px] flex-wrap gap-1">
                        {displayServiceLabels.slice(0, 3).map((label) => (
                          <StatusBadge key={label} tone="info" size="sm">
                            <span className="max-w-[190px] truncate" title={label}>
                              {label}
                            </span>
                          </StatusBadge>
                        ))}
                        {displayServiceLabels.length > 3 && (
                          <StatusBadge tone="neutral" size="sm">
                            +{displayServiceLabels.length - 3}
                          </StatusBadge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StoreStatusBadge status={s.status} size="sm" />
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex min-w-[180px] flex-wrap gap-1.5">
                        {staff.map((p) => {
                          const selected = assigneeMap.get(s.id)?.includes(p.id) ?? false;
                          const nextIds = selected
                            ? (assigneeMap.get(s.id) ?? []).filter((id) => id !== p.id)
                            : [...(assigneeMap.get(s.id) ?? []), p.id];
                          return (
                            <label
                              key={p.id}
                              className={cn(
                                "flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
                                selected
                                  ? "border-primary/30 bg-primary/10 text-primary"
                                  : "bg-background text-muted-foreground hover:border-foreground/30",
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => setAssignees(s.id, nextIds)}
                                className="size-3"
                              />
                              {p.name}
                            </label>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className="font-medium">{fmtMoney(s.monthly_fee)}원</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {s.start_date ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {healthBadge(staleDays)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
