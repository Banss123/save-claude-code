"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Inbox,
  CheckCircle2,
  Send,
  ExternalLink,
  Plus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  confirmReport as confirmReportAction,
  createReport as createReportAction,
  markReportSent as markReportSentAction,
  requestReportRevision as requestReportRevisionAction,
} from "@/lib/actions/report";
import { cn } from "@/lib/utils";

type ReportType = "weekly" | "mid_rank" | "monthly";
type ReportStatus = "received" | "revision_requested" | "confirmed" | "sent";

type ReportRow = {
  id: string;
  store_id: string;
  type: ReportType;
  period_start: string;
  period_end: string;
  status: ReportStatus;
  source_url: string | null;
  body: string | null;
  received_at: string;
  received_from: string | null;
  confirmed_at: string | null;
  confirm_note: string | null;
  sent_at: string | null;
  sent_to: string | null;
  send_note: string | null;
  store: { name: string } | null;
};

type StoreOpt = { id: string; name: string };

const typeLabel: Record<ReportType, string> = {
  weekly: "주간보고",
  mid_rank: "중간등수",
  monthly: "월간보고",
};

const typeTone: Record<ReportType, string> = {
  weekly: "bg-blue-100 text-blue-700",
  mid_rank: "bg-amber-100 text-amber-700",
  monthly: "bg-violet-100 text-violet-700",
};

const statusLabel: Record<ReportStatus, string> = {
  received: "받음 (컨펌 대기)",
  revision_requested: "수정 요청",
  confirmed: "컨펌됨 (송부 대기)",
  sent: "송부 완료",
};

const statusTone: Record<ReportStatus, string> = {
  received: "bg-rose-100 text-rose-700",
  revision_requested: "bg-orange-100 text-orange-700",
  confirmed: "bg-amber-100 text-amber-700",
  sent: "bg-emerald-100 text-emerald-700",
};

const inputCls =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-foreground/30";

export default function ReportsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [reports, setReports] = useState<ReportRow[] | null>(null);
  const [stores, setStores] = useState<StoreOpt[]>([]);
  const [tab, setTab] = useState<ReportStatus | "all">("received");
  const [openNew, setOpenNew] = useState(false);

  const reload = useMemo(
    () => async () => {
      const [r, s] = await Promise.all([
        supabase
          .from("reports")
          .select("*, store:stores(name)")
          .order("received_at", { ascending: false }),
        supabase
          .from("stores")
          .select("id, name")
          .is("archived_at", null)
          .order("name"),
      ]);
      setReports((r.data ?? []) as unknown as ReportRow[]);
      setStores((s.data ?? []) as StoreOpt[]);
    },
    [supabase],
  );

  useEffect(() => {
    reload();
  }, [reload]);

  const filtered = useMemo(() => {
    if (!reports) return [];
    return reports.filter((r) => tab === "all" || r.status === tab);
  }, [reports, tab]);

  const counts = useMemo(() => {
    const c: Record<ReportStatus | "all", number> = {
      received: 0,
      revision_requested: 0,
      confirmed: 0,
      sent: 0,
      all: 0,
    };
    for (const r of reports ?? []) {
      c[r.status]++;
      c.all++;
    }
    return c;
  }, [reports]);

  const TABS: { key: ReportStatus | "all"; label: string }[] = [
    { key: "received", label: `받음·컨펌 대기 (${counts.received})` },
    { key: "confirmed", label: `송부 대기 (${counts.confirmed})` },
    { key: "revision_requested", label: `수정 요청 (${counts.revision_requested})` },
    { key: "sent", label: `송부 완료 (${counts.sent})` },
    { key: "all", label: `전체 (${counts.all})` },
  ];

  return (
    <main className="flex flex-1 flex-col gap-5 overflow-y-auto p-6 lg:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">보고서</h1>
          <p className="text-sm text-muted-foreground">
            본사 자료 받음 → 컨펌 → 업주 송부 흐름.
            {counts.received > 0 && (
              <span className="ml-2 font-medium text-rose-600">
                컨펌 대기 {counts.received}건
              </span>
            )}
          </p>
        </div>
        <Button onClick={() => setOpenNew((v) => !v)}>
          <Plus className="size-4" />
          본사 자료 받음
        </Button>
      </header>

      {openNew && (
        <NewReportForm
          stores={stores}
          onClose={() => setOpenNew(false)}
          onSaved={() => {
            setOpenNew(false);
            reload();
          }}
        />
      )}

      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
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

      {reports == null ? (
        <div className="flex justify-center p-12">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-12 text-center text-sm text-muted-foreground">
          {tab === "received" ? "컨펌 대기 보고서 없음 — 다 처리했네요" : "조건에 맞는 보고서 없음"}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((r) => (
            <ReportCard key={r.id} report={r} onChanged={reload} />
          ))}
        </ul>
      )}
    </main>
  );
}

function ReportCard({
  report: r,
  onChanged,
}: {
  report: ReportRow;
  onChanged: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmNote, setConfirmNote] = useState("");
  const [sendOpen, setSendOpen] = useState(false);
  const [sentTo, setSentTo] = useState("업주 카톡");
  const [sendNote, setSendNote] = useState("");

  const handleConfirm = async () => {
    const result = await confirmReportAction(r.id, confirmNote || undefined);
    if (!result.ok) {
      alert("저장 실패: " + result.error);
      return;
    }
    setConfirmOpen(false);
    setConfirmNote("");
    onChanged();
  };

  const handleRevision = async () => {
    const note = prompt("본사에 어떤 수정을 요청하시겠습니까?");
    if (!note) return;
    const result = await requestReportRevisionAction(r.id, note);
    if (!result.ok) {
      alert("저장 실패: " + result.error);
      return;
    }
    onChanged();
  };

  const handleSend = async () => {
    const result = await markReportSentAction({
      reportId: r.id,
      sentTo,
      note: sendNote || null,
    });
    if (!result.ok) {
      alert("저장 실패: " + result.error);
      return;
    }
    setSendOpen(false);
    onChanged();
  };

  return (
    <li className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className={cn("rounded px-2 py-0.5 text-xs font-medium", typeTone[r.type])}>
          {typeLabel[r.type]}
        </span>
        <span className={cn("rounded px-2 py-0.5 text-xs font-medium", statusTone[r.status])}>
          {statusLabel[r.status]}
        </span>
        <Link
          href={`/app/stores/${r.store_id}`}
          className="font-medium hover:underline"
        >
          {r.store?.name ?? "—"}
        </Link>
        <span className="text-xs text-muted-foreground">
          {r.period_start} ~ {r.period_end}
        </span>
      </div>

      {r.body && (
        <p className="text-sm text-foreground/80">{r.body}</p>
      )}

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>받음: {r.received_at.slice(0, 10)}</span>
        {r.received_from && <span>· 본사 {r.received_from}</span>}
        {r.source_url && (
          <a
            href={r.source_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-blue-600 hover:underline"
          >
            <ExternalLink className="size-3" />원본 자료
          </a>
        )}
        {r.confirmed_at && (
          <span>· 컨펌 {r.confirmed_at.slice(0, 10)}</span>
        )}
        {r.sent_at && (
          <span>· 송부 {r.sent_at.slice(0, 10)} ({r.sent_to})</span>
        )}
      </div>

      {r.confirm_note && (
        <div className="rounded-md border-l-4 border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          <strong>컨펌 메모:</strong> {r.confirm_note}
        </div>
      )}

      {/* 액션 영역 — 상태별 */}
      {r.status === "received" && (
        <div className="flex flex-col gap-2 border-t pt-3">
          {!confirmOpen ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setConfirmOpen(true)}>
                <CheckCircle2 className="size-3.5" />
                컨펌
              </Button>
              <Button size="sm" variant="outline" onClick={handleRevision}>
                본사에 수정 요청
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <textarea
                className={cn(inputCls, "min-h-[60px]")}
                placeholder="컨펌 의견 (선택)"
                value={confirmNote}
                onChange={(e) => setConfirmNote(e.target.value)}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleConfirm}>
                  컨펌 확정
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmOpen(false)}>
                  취소
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {r.status === "confirmed" && (
        <div className="flex flex-col gap-2 border-t pt-3">
          {!sendOpen ? (
            <Button size="sm" onClick={() => setSendOpen(true)}>
              <Send className="size-3.5" />
              업주 송부
            </Button>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  className={inputCls}
                  placeholder="송부 채널 (예: 업주 카톡)"
                  value={sentTo}
                  onChange={(e) => setSentTo(e.target.value)}
                />
                <input
                  className={inputCls}
                  placeholder="메모 (선택)"
                  value={sendNote}
                  onChange={(e) => setSendNote(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSend}>
                  송부 완료 처리
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSendOpen(false)}>
                  취소
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function NewReportForm({
  stores,
  onClose,
  onSaved,
}: {
  stores: StoreOpt[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [type, setType] = useState<ReportType>("weekly");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [body, setBody] = useState("");
  const [receivedFrom, setReceivedFrom] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!storeId || !periodStart || !periodEnd) return;
    setSubmitting(true);
    const result = await createReportAction({
      storeId,
      type,
      periodStart,
      periodEnd,
      sourceUrl: sourceUrl || null,
      body: body || null,
      receivedFrom: receivedFrom || null,
    });
    setSubmitting(false);
    if (!result.ok) {
      alert("저장 실패: " + result.error);
      return;
    }
    onSaved();
  };

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">본사 자료 등록</h2>
        <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted">
          <X className="size-4" />
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">매장</span>
          <select className={inputCls} value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">보고서 종류</span>
          <select
            className={inputCls}
            value={type}
            onChange={(e) => setType(e.target.value as ReportType)}
          >
            <option value="weekly">주간보고</option>
            <option value="mid_rank">중간등수 보고</option>
            <option value="monthly">월간보고</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">기간 시작</span>
          <input
            type="date"
            className={inputCls}
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">기간 종료</span>
          <input
            type="date"
            className={inputCls}
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
          <span className="font-medium">자료 링크 (선택)</span>
          <input
            className={inputCls}
            placeholder="https://drive.google.com/..."
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
          <span className="font-medium">본문·요약</span>
          <textarea
            className={cn(inputCls, "min-h-[80px]")}
            placeholder="키워드 등수 / GBP 통계 / 리뷰 / 기타 핵심"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">본사 담당자 (선택)</span>
          <input
            className={inputCls}
            placeholder="김보고"
            value={receivedFrom}
            onChange={(e) => setReceivedFrom(e.target.value)}
          />
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>취소</Button>
        <Button onClick={submit} disabled={submitting || !storeId || !periodStart || !periodEnd}>
          {submitting && <Loader2 className="size-3.5 animate-spin" />}
          <Inbox className="size-3.5" />
          받음 등록
        </Button>
      </div>
    </div>
  );
}
