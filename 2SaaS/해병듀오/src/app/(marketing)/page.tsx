import Link from "next/link";
import {
  CheckCircle2,
  Layers,
  PinIcon,
  Activity,
  Calendar,
  Workflow,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <main className="flex flex-1 flex-col">
      {/* Hero */}
      <section className="flex flex-col items-center px-6 pt-24 pb-20 text-center">
        <div className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          비즈하이솔루션 · 구글 SEO 영업 관리
        </div>
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
          영업자가 할 일을<br />대시보드가 알려주는 SaaS
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          계약 전 견적부터 관리 중 주간 보고까지 — 비즈하이의 모든 영업
          프로세스를 퀘스트로 변환합니다. 누락 없이, 실시간으로, 팀 전체가
          공유하며.
        </p>
        <div className="mt-8 flex gap-3">
          <Button asChild size="default">
            <Link href="/app">
              지금 대시보드 열기
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/app/stores/new">매장 등록하기</Link>
          </Button>
        </div>

        {/* 통계 3개 */}
        <div className="mt-16 grid w-full max-w-2xl grid-cols-3 gap-8 border-t pt-10">
          <Stat label="계약 프로세스" value="3단계" desc="A 계약 전 · B 온보딩 · C 관리 중" />
          <Stat label="자동 분기 로직" value="업종별" desc="요식업·뷰티 vs 병의원·약국" />
          <Stat label="업무 추적" value="100%" desc="누락 없이 단일 진실 원천" />
        </div>
      </section>

      {/* 기능 */}
      <section id="features" className="border-t bg-muted/30 px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold">핵심 기능</h2>
          <p className="mt-3 text-center text-muted-foreground">
            영업·마케터가 매일 열어볼 만큼 유용한 매장 관리 도구
          </p>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <Feature
              icon={Layers}
              title="간트차트 메인 뷰"
              desc="한 달치 매장×일자 매트릭스로 전체 진행 상황을 한 눈에. 시작일·마감·미팅 모두 표시."
            />
            <Feature
              icon={PinIcon}
              title="퀘스트 자동 생성"
              desc="매장 등록 = A.1 자동 발급. 단계 완료 시 다음 단계 자동 활성. 누락 불가능."
            />
            <Feature
              icon={CheckCircle2}
              title="우선순위 + 핀 고정"
              desc="긴급/보통/낮음 라벨 자동 정렬 + 사용자 임의 핀 고정. 오늘 할 일이 항상 위에."
            />
            <Feature
              icon={Activity}
              title="활동 히트맵"
              desc="26주치 깃허브 contribution 스타일. 내 작업·업주 소통 시각화."
            />
            <Feature
              icon={Workflow}
              title="업주 연락 트래킹"
              desc="통화·카톡·이메일·미팅을 한 곳에. 다음 액션 메모·자동 알림 후보."
            />
            <Feature
              icon={Calendar}
              title="팀 공유 캘린더"
              desc="미팅·방문·보고 마감 한 뷰에서. 김민재·김재원·반민성 일정 통합."
            />
          </div>
        </div>
      </section>

      {/* 프로세스 */}
      <section id="process" className="border-t px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold">3단계 프로세스</h2>
          <p className="mt-3 text-center text-muted-foreground">
            비즈하이 구글 SEO 상품의 표준 흐름
          </p>
          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            <Phase
              code="A"
              title="계약 전"
              steps={[
                "정보 수집 (개월·키워드·단가·할인·결제수단)",
                "견적서 작성 → 본사 컨펌",
                "업주 전송 → 사등본·이메일 수취",
                "계약서 전자서명 발송",
                "입금확인 양식 기록",
              ]}
              tone="bg-blue-50 border-blue-200"
            />
            <Phase
              code="B"
              title="계약 후"
              steps={[
                "업주 톡방 + GBP 권한",
                "매장 자료 요청",
                "(병의원·약국) 4주치 아티클 컨펌",
                "리뷰 작업자 구인 + 톡방",
                "시작일 확정 → 업주 포워딩",
              ]}
              tone="bg-violet-50 border-violet-200"
            />
            <Phase
              code="C"
              title="관리 중"
              steps={[
                "D+15일 업주 안부 연락",
                "주간보고 / 중간등수 / 월간보고",
                "매장·리뷰 체크리스트 (정기)",
                "월간보고 미팅",
                "이슈·클레임 대응",
              ]}
              tone="bg-emerald-50 border-emerald-200"
            />
          </div>
        </div>
      </section>

      {/* 캘린더 안내 */}
      <section id="calendar" className="border-t bg-muted/30 px-6 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold">팀원의 일정을 한눈에</h2>
          <p className="mt-3 text-muted-foreground">
            미팅, 보고, 방문 일정을 한 뷰에서 공유하고 조율하세요.
          </p>
          <div className="mt-8 inline-flex items-center gap-3 rounded-xl border bg-card p-4 text-sm">
            <Calendar className="size-5 text-violet-500" />
            <span>
              <strong>대시보드</strong>에서 캘린더와 간트차트를 동시에 확인할 수
              있습니다
            </span>
            <Button asChild size="sm" variant="outline">
              <Link href="/app">바로가기</Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t px-6 py-8 text-center text-xs text-muted-foreground">
        © 비즈하이 · BizHigh SalesOps · 김민재 · 김재원 · 반민성
      </footer>
    </main>
  );
}

function Stat({ label, value, desc }: { label: string; value: string; desc: string }) {
  return (
    <div className="text-center">
      <div className="text-2xl font-bold">{value}</div>
      <div className="mt-1 text-sm font-medium">{label}</div>
      <div className="mt-1 text-xs text-muted-foreground">{desc}</div>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  desc,
}: {
  icon: typeof CheckCircle2;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-6">
      <Icon className="size-6 text-foreground/70" />
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

function Phase({
  code,
  title,
  steps,
  tone,
}: {
  code: string;
  title: string;
  steps: string[];
  tone: string;
}) {
  return (
    <div className={`rounded-xl border p-6 ${tone}`}>
      <div className="flex items-baseline gap-2">
        <span className="rounded bg-background px-2 py-0.5 font-mono text-xs">{code}</span>
        <h3 className="text-lg font-semibold">{title}</h3>
      </div>
      <ul className="mt-4 space-y-2 text-sm">
        {steps.map((s) => (
          <li key={s} className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-foreground/60" />
            <span>{s}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
