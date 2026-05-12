// 라벨 매핑 + 시연용 today 상수.
// 모든 매장·퀘스트·통신·체크·보고서 데이터는 supabase에서 fetch.

export type StoreStatus =
  | "contract_pending"
  | "contract_signed"
  | "ready_to_start"
  | "active"
  | "paused"
  | "churned"
  | "archived";

export const storeStatusLabel: Record<StoreStatus, string> = {
  contract_pending: "계약 진행",
  contract_signed: "온보딩 중",
  ready_to_start: "시작일 대기",
  active: "관리 중",
  paused: "일시 중단",
  churned: "이탈",
  archived: "보관됨",
};

export const storeStatusTone: Record<StoreStatus, string> = {
  contract_pending: "bg-blue-100 text-blue-700",
  contract_signed: "bg-violet-100 text-violet-700",
  ready_to_start: "bg-amber-100 text-amber-700",
  active: "bg-emerald-100 text-emerald-700",
  paused: "bg-zinc-200 text-zinc-700",
  churned: "bg-rose-100 text-rose-700",
  archived: "bg-zinc-100 text-zinc-500",
};

// 미니 캘린더 컴포넌트가 받는 형식 (DB calendar_events에서 변환)
export type CalendarEvent = {
  date: string;
  storeName: string;
  type: "milestone" | "meeting" | "report";
  title: string;
};

// 시연용 "오늘" — 영상·스크린샷의 시점에 맞춤. 실 운영 시 dayjs/Date.now()로 교체.
export const todayStr = "2026-04-26";
