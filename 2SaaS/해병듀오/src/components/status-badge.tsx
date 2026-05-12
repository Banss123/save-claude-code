/**
 * StatusBadge — 상태·우선순위·단계·마감 표현 통합 배지
 *
 * design-system.md §3 / §6-1 의 색 룰을 한 곳에 정착.
 * 페이지마다 raw `bg-rose-100`처럼 박는 패턴을 이 컴포넌트로 흡수한다.
 *
 * 의미 색 매핑:
 *   urgent  → red    (위급·연체)
 *   warning → amber  (주의·오늘마감)
 *   info    → sky    (일반·내일마감)
 *   success → emerald(완료·정상)
 *   neutral → slate  (부가·비활성)
 *
 * Process Step 매핑:
 *   A → sky / B → violet / C → emerald / D → amber
 */

import { cn } from "@/lib/utils";

type Tone = "urgent" | "warning" | "info" | "success" | "neutral" | "brand";

const TONE_CLASS: Record<Tone, string> = {
  urgent:  "bg-urgent-bg text-urgent border-urgent/25",
  warning: "bg-warning-bg text-warning border-warning/25",
  info:    "bg-info-bg text-info border-info/25",
  success: "bg-success-bg text-success border-success/25",
  neutral: "bg-muted text-muted-foreground border-border",
  brand:   "bg-primary/10 text-primary border-primary/25",
};

const SIZE_CLASS = {
  sm: "px-1.5 py-0.5 text-[11px] rounded",
  md: "px-2 py-0.5 text-xs rounded-md",
  lg: "px-2.5 py-1 text-sm rounded-md",
} as const;

type Size = keyof typeof SIZE_CLASS;

export function StatusBadge({
  tone = "neutral",
  size = "md",
  bordered = false,
  className,
  children,
}: {
  tone?: Tone;
  size?: Size;
  bordered?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium leading-none whitespace-nowrap",
        SIZE_CLASS[size],
        TONE_CLASS[tone],
        bordered ? "border" : "border-transparent",
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────
 * 도메인별 헬퍼 — 페이지 코드에서 if/else 분기 안 하도록
 * ─────────────────────────────────────────────────────────────── */

type Priority = "urgent" | "normal" | "low";

const PRIORITY_TONE: Record<Priority, Tone> = {
  urgent: "urgent",
  normal: "neutral",
  low:    "neutral",
};
const PRIORITY_LABEL: Record<Priority, string> = {
  urgent: "긴급",
  normal: "보통",
  low:    "낮음",
};

export function PriorityBadge({ priority, size }: { priority: Priority; size?: Size }) {
  return (
    <StatusBadge tone={PRIORITY_TONE[priority]} size={size}>
      {PRIORITY_LABEL[priority]}
    </StatusBadge>
  );
}

/**
 * Process Step 한글 라벨 — 사용자 비전: "A.5는 처음 보면 모름 → 한글로 즉시 이해"
 * `process.md` 단계 정의와 동기화. 새 step 추가 시 여기와 마이그 양쪽 추가.
 */
export const STEP_LABELS: Record<string, string> = {
  "A.1": "계약정보 수집",
  "A.2": "견적서 작성",
  "A.3": "본사 컨펌",
  "A.4": "자료 전송",
  "A.5": "사업자등록증 수취",
  "A.6": "계약서 발송",
  "A.7": "입금확인",
  "B.1": "신규DB 작성",
  "B.2": "팀채팅방 개설",
  "B.3": "팀채팅방 초대",
  "B.4": "GBP 권한 요청",
  "B.4a": "GBP 인증 확인",
  "B.4*": "GBP 프로필 세팅",
  "B.5": "초기자료 수집",
  "B.5b": "아티클 컨펌",
  "B.5c": "자료 정리",
  "B.6": "리뷰 작업자 구인",
  "B.7": "리뷰 작업자 등록",
  "B.8": "리뷰 톡방 개설",
  "B.9": "시작일 확정",
  "COMM.follow_up": "후속 연락",
  "AI.proposed": "AI 제안",
  "C.weekly": "주간보고",
  "C.monthly": "월간보고",
  "C.midterm": "중간 등수보고",
  "C.check": "정기점검",
  "C.D15": "D+15일 안부",
  "D.15": "D+15일 안부",
  "XHS.schedule": "샤오홍슈 일정",
};

export function stepLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return STEP_LABELS[code] ?? code;
}

/**
 * Process Step 배지
 * 한글 라벨이 메인, 코드는 옵션(작은 보조 텍스트)
 * 사용: <StepBadge code="B.5b" />
 *      → 보라 [아티클 컨펌] (B.5b는 tooltip)
 */
export function StepBadge({
  code,
  size,
  showCode = false,
}: {
  code: string;
  size?: Size;
  /** true면 한글 라벨 옆에 코드도 작게 표시 (디버그·관리자용) */
  showCode?: boolean;
}) {
  const family = code.charAt(0).toUpperCase();
  const tone: Tone =
    family === "A" ? "info" :
    family === "C" ? "success" :
    family === "D" ? "warning" :
    family === "B" ? "neutral" : // B는 violet — neutral 매핑 후 클래스 override
    "neutral";

  // B 단계만 violet (의미 색에 violet 없음)
  const bClass =
    family === "B"
      ? "!bg-violet-50 !text-violet-700 !border-violet-200"
      : "";

  const label = STEP_LABELS[code] ?? code;

  return (
    <StatusBadge tone={tone} size={size} className={bClass}>
      <span title={code}>{label}</span>
      {showCode && (
        <span className="font-mono text-[10px] opacity-60">{code}</span>
      )}
    </StatusBadge>
  );
}

/**
 * Due Bucket 배지 — 마감 임박도 표현
 *  overdue=빨강 / today=주황 / tomorrow=파랑 / later=회색
 */
export function DueBadge({
  bucket,
  text,
  size,
}: {
  bucket: "overdue" | "today" | "tomorrow" | "later";
  text: string;
  size?: Size;
}) {
  const tone: Tone =
    bucket === "overdue" ? "urgent" :
    bucket === "today"   ? "warning" :
    bucket === "tomorrow" ? "info" :
    "neutral";
  return <StatusBadge tone={tone} size={size}>{text}</StatusBadge>;
}

/**
 * Store Status 배지 — 매장 상태 표현
 */
type StoreStatus =
  | "contract_pending" | "contract_signed" | "ready_to_start"
  | "active" | "paused" | "churned" | "archived";

const STORE_STATUS_TONE: Record<StoreStatus, Tone> = {
  contract_pending: "info",
  contract_signed:  "info",
  ready_to_start:   "warning",
  active:           "success",
  paused:           "warning",
  churned:          "urgent",
  archived:         "neutral",
};

const STORE_STATUS_LABEL: Record<StoreStatus, string> = {
  contract_pending: "계약진행",
  contract_signed:  "계약완료",
  ready_to_start:   "시작대기",
  active:           "관리중",
  paused:           "일시정지",
  churned:          "이탈",
  archived:         "보존",
};

export function StoreStatusBadge({
  status,
  size,
}: {
  status: StoreStatus;
  size?: Size;
}) {
  return (
    <StatusBadge tone={STORE_STATUS_TONE[status]} size={size} bordered>
      {STORE_STATUS_LABEL[status]}
    </StatusBadge>
  );
}
