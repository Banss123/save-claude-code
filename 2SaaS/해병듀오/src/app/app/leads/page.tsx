"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Phone, Search, Users, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  updateLeadAssignee as updateLeadAssigneeAction,
  updateLeadMemo as updateLeadMemoAction,
  updateLeadStatus as updateLeadStatusAction,
} from "@/lib/actions/lead";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";

type LeadStatus = "new" | "contacted" | "interested" | "booked" | "closed" | "dropped" | "invalid";

type LeadRow = {
  id: string;
  campaign_id: string | null;
  store_id: string | null;
  name: string | null;
  phone: string | null;
  age: number | null;
  region: string | null;
  status: LeadStatus;
  assigned_to: string | null;
  contacted_at: string | null;
  closed_at: string | null;
  memo: string | null;
  created_at: string;
  campaign: { campaign_name: string; platform: string } | null;
  store: { name: string } | null;
};

type StaffRow = { id: string; name: string };
type StoreOpt = { id: string; name: string };
type CampaignOpt = { id: string; campaign_name: string };

const STATUS_OPTIONS: { code: LeadStatus; label: string; tone: string }[] = [
  { code: "new", label: "신규", tone: "bg-blue-100 text-blue-700" },
  { code: "contacted", label: "연락", tone: "bg-violet-100 text-violet-700" },
  { code: "interested", label: "관심", tone: "bg-amber-100 text-amber-700" },
  { code: "booked", label: "예약", tone: "bg-emerald-100 text-emerald-700" },
  { code: "closed", label: "성사", tone: "bg-emerald-200 text-emerald-800" },
  { code: "dropped", label: "이탈", tone: "bg-zinc-100 text-zinc-500" },
  { code: "invalid", label: "허위", tone: "bg-rose-100 text-rose-700" },
];

const statusTone = (s: LeadStatus) => STATUS_OPTIONS.find((o) => o.code === s)?.tone ?? "";

export default function LeadsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { profile: currentProfile } = useCurrentProfile();
  const [leads, setLeads] = useState<LeadRow[] | null>(null);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [stores, setStores] = useState<StoreOpt[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignOpt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");

  // 필터
  const [statusFilter, setStatusFilter] = useState<"all" | LeadStatus>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!currentProfile?.id) return;
    setCurrentUserId(currentProfile.id);
    setOwnerFilter((prev) => (prev === "all" ? currentProfile.id : prev));
  }, [currentProfile?.id]);

  const reload = useMemo(
    () => async () => {
      const [l, p, s, c] = await Promise.all([
        supabase
          .from("leads")
          .select(
            "id, campaign_id, store_id, name, phone, age, region, status, assigned_to, contacted_at, closed_at, memo, created_at, campaign:lead_campaigns(campaign_name, platform), store:stores(name)",
          )
          .order("created_at", { ascending: false }),
        supabase.from("profiles").select("id, name").order("name"),
        supabase.from("stores").select("id, name").is("archived_at", null).order("name"),
        supabase.from("lead_campaigns").select("id, campaign_name").order("started_at", { ascending: false }),
      ]);
      if (l.error || p.error || s.error || c.error) {
        setError(l.error?.message ?? p.error?.message ?? s.error?.message ?? c.error?.message ?? "");
        return;
      }
      setLeads((l.data ?? []) as unknown as LeadRow[]);
      setStaff((p.data ?? []) as StaffRow[]);
      setStores((s.data ?? []) as StoreOpt[]);
      setCampaigns((c.data ?? []) as CampaignOpt[]);
    },
    [supabase],
  );

  useEffect(() => {
    reload();
  }, [reload]);

  async function changeStatus(id: string, status: LeadStatus) {
    setLeads((prev) => prev?.map((l) => (l.id === id ? { ...l, status } : l)) ?? null);
    const result = await updateLeadStatusAction(id, status);
    if (!result.ok) setError(`status 변경 실패: ${result.error}`);
  }

  async function changeAssignee(id: string, assigned_to: string | null) {
    setLeads((prev) => prev?.map((l) => (l.id === id ? { ...l, assigned_to } : l)) ?? null);
    const result = await updateLeadAssigneeAction(id, assigned_to);
    if (!result.ok) setError(`담당자 변경 실패: ${result.error}`);
  }

  async function saveMemo(id: string, memo: string) {
    const result = await updateLeadMemoAction(id, memo);
    if (!result.ok) setError(`메모 저장 실패: ${result.error}`);
  }

  const filtered = useMemo(() => {
    if (!leads) return [];
    return leads.filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (ownerFilter !== "all" && l.assigned_to !== ownerFilter) return false;
      if (storeFilter !== "all" && l.store_id !== storeFilter) return false;
      if (q && !`${l.name ?? ""} ${l.phone ?? ""} ${l.region ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [leads, statusFilter, ownerFilter, storeFilter, q]);

  // 통계
  const counts = useMemo(() => {
    const m: Record<string, number> = { all: 0, new: 0, mine_open: 0, dropped: 0 };
    leads?.forEach((l) => {
      m.all++;
      if (l.status === "new") m.new++;
      if (l.status === "dropped") m.dropped++;
      if (currentUserId && l.assigned_to === currentUserId && l.status !== "closed" && l.status !== "dropped" && l.status !== "invalid")
        m.mine_open++;
    });
    return m;
  }, [leads, currentUserId]);

  return (
    <main className="flex flex-1 flex-col gap-5 overflow-y-auto p-6 lg:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">DB 관리</h1>
          <p className="text-sm text-muted-foreground">
            메타광고 잠재고객(Lead). 시트 동기화 → 분배 → 진행 추적 ·{" "}
            <a
              href="https://docs.google.com/spreadsheets/d/1d_18LKEUpP9yxAL8Q86bxGndNToiaAGZ6M51Vc87CHk"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              디비관리 시트 ↗
            </a>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm">
            <Users className="size-4" />
            <span className="text-muted-foreground">전체</span>
            <span className="font-semibold">{counts.all}</span>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
            <span className="opacity-80">신규</span>
            <span className="font-semibold">{counts.new}</span>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            <span className="opacity-80">본인 진행 중</span>
            <span className="font-semibold">{counts.mine_open}</span>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle className="size-3.5" />
            <span className="opacity-80">이탈</span>
            <span className="font-semibold">{counts.dropped}</span>
          </div>
        </div>
      </header>

      {error && (
        <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* 필터 */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="이름·연락처·지역 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-foreground/30"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="all">전체 상태</option>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.code} value={o.code}>{o.label}</option>
          ))}
        </select>
        <select
          value={ownerFilter}
          onChange={(e) => setOwnerFilter(e.target.value)}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="all">전체 담당자</option>
          {staff.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          value={storeFilter}
          onChange={(e) => setStoreFilter(e.target.value)}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="all">전체 매장</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 text-left font-medium">이름·지역</th>
              <th className="px-3 py-2.5 text-left font-medium">연락처</th>
              <th className="px-3 py-2.5 text-left font-medium">캠페인·매장</th>
              <th className="px-3 py-2.5 text-left font-medium">담당자</th>
              <th className="px-3 py-2.5 text-left font-medium">상태</th>
              <th className="px-3 py-2.5 text-left font-medium">메모</th>
              <th className="px-3 py-2.5 text-left font-medium">접수일</th>
            </tr>
          </thead>
          <tbody>
            {leads == null ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                  <Loader2 className="mx-auto size-5 animate-spin" />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                  조건에 맞는 Lead가 없습니다
                </td>
              </tr>
            ) : (
              filtered.map((l) => (
                <tr key={l.id} className="border-t hover:bg-muted/20">
                  <td className="px-3 py-2.5">
                    <div className="font-medium">{l.name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {l.region ?? "—"} {l.age ? `· ${l.age}세` : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    {l.phone ? (
                      <a
                        href={`tel:${l.phone}`}
                        className="inline-flex items-center gap-1 text-foreground hover:text-primary"
                      >
                        <Phone className="size-3" />
                        {l.phone}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    <div className="truncate text-foreground/80">
                      {l.campaign?.campaign_name ?? "—"}
                    </div>
                    <div className="truncate text-muted-foreground">
                      {l.store?.name ?? "매장 미배정"}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <select
                      value={l.assigned_to ?? ""}
                      onChange={(e) => changeAssignee(l.id, e.target.value || null)}
                      className="rounded-md border bg-background px-2 py-1 text-xs outline-none cursor-pointer hover:border-foreground/30"
                    >
                      <option value="">미지정</option>
                      {staff.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2.5">
                    <select
                      value={l.status}
                      onChange={(e) => changeStatus(l.id, e.target.value as LeadStatus)}
                      className={cn(
                        "rounded-md border-0 px-2 py-1 text-xs font-medium outline-none cursor-pointer",
                        statusTone(l.status),
                      )}
                    >
                      {STATUS_OPTIONS.map((o) => (
                        <option key={o.code} value={o.code}>{o.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2.5">
                    <input
                      type="text"
                      defaultValue={l.memo ?? ""}
                      onBlur={(e) => {
                        if ((e.target.value || null) !== l.memo) saveMemo(l.id, e.target.value);
                      }}
                      placeholder="메모 추가..."
                      className="w-44 rounded-md border bg-background px-2 py-1 text-xs outline-none focus:border-foreground/30"
                    />
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground tabular-nums">
                    {l.created_at.slice(5, 10)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 캠페인 요약 */}
      {campaigns.length > 0 && (
        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-3 text-base font-semibold">캠페인 ({campaigns.length})</h2>
          <ul className="flex flex-wrap gap-2 text-xs">
            {campaigns.map((c) => {
              const cleads = leads?.filter((l) => l.campaign_id === c.id) ?? [];
              return (
                <li
                  key={c.id}
                  className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5"
                >
                  <span className="font-medium">{c.campaign_name}</span>
                  <span className="text-muted-foreground">{cleads.length}건</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
