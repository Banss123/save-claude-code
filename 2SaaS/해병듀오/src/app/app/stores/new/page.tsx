"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  FileText,
  Info,
  LinkIcon,
  Loader2,
  ReceiptText,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { createStore as createStoreAction } from "@/lib/actions/store";
import {
  BASE_KEYWORD_COUNT,
  CONTRACT_MONTH_OPTIONS,
  NAVER_CMO_SERVICE_OPTIONS,
  VAT_RATE,
  XHS_SERVICE_OPTIONS,
  calculateMonthlyQuote,
  pricingGroupLabel,
  type ServiceCode,
} from "@/lib/pricing";

// label → DB code 매핑 (lookup 테이블과 정합)
const types = [
  { code: "food", label: "요식업" },
  { code: "beauty", label: "뷰티" },
  { code: "clinic", label: "병의원" },
  { code: "pharm", label: "약국" },
  { code: "etc", label: "기타" },
] as const;

const paymentMethods = [
  { code: "card_corp", label: "법인카드" },
  { code: "card_personal", label: "개인카드" },
  { code: "transfer", label: "계좌이체" },
  { code: "cash", label: "현금" },
  { code: "etc", label: "기타" },
] as const;

// 업주 우선시 옵션
const OWNER_PRIORITY_OPTIONS = [
  { code: "", label: "(선택 안 함)" },
  { code: "revenue", label: "💰 매출 우선" },
  { code: "authority", label: "👔 권위·격식 우선" },
  { code: "rapport", label: "🤝 라포·친근 우선" },
  { code: "quality", label: "✨ 퀄리티 우선" },
  { code: "speed", label: "⚡ 속도 우선" },
] as const;

type StaffMember = { id: string; name: string };

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

function ServiceGroupCard({
  label,
  desc,
  checked,
  disabled,
  onCheckedChange,
  children,
}: {
  label: string;
  desc: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-md border bg-background p-3 text-sm transition-colors",
        checked ? "border-primary bg-primary/5 shadow-sm" : "hover:bg-muted/40",
      )}
    >
      <label
        className={cn(
          "flex items-start gap-2",
          disabled ? "cursor-default" : "cursor-pointer",
        )}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onCheckedChange?.(e.target.checked)}
          className="mt-0.5 size-3.5"
        />
        <span className="min-w-0">
          <span className={cn("block font-medium", checked && "text-primary")}>
            {label}
          </span>
          <span className="block text-xs text-muted-foreground">{desc}</span>
        </span>
      </label>
      {checked && children && <div className="mt-3">{children}</div>}
    </div>
  );
}

function FormSection({
  icon: Icon,
  title,
  desc,
  tone = "info",
  children,
}: {
  icon: typeof Building2;
  title: string;
  desc?: string;
  tone?: "info" | "success" | "warning" | "brand" | "neutral";
  children: React.ReactNode;
}) {
  const toneClass = {
    info: "border-l-sky-400 bg-sky-50/30",
    success: "border-l-emerald-400 bg-emerald-50/30",
    warning: "border-l-amber-400 bg-amber-50/30",
    brand: "border-l-orange-400 bg-orange-50/30",
    neutral: "border-l-slate-300 bg-card",
  }[tone];

  return (
    <section className={cn("rounded-xl border border-l-4 bg-card p-5 shadow-sm", toneClass)}>
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-md border bg-background p-2 text-primary shadow-sm">
          <Icon className="size-4" />
        </div>
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {desc && <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function SummaryPill({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "info" | "success" | "warning";
}) {
  const toneClass = {
    neutral: "border-slate-200 bg-card",
    info: "border-sky-200 bg-sky-50 text-sky-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
  }[tone];
  return (
    <div className={cn("rounded-lg border px-3 py-2", toneClass)}>
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

const inputCls =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-foreground/30";

export default function StoreNewPage() {
  const router = useRouter();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [typeCode, setTypeCode] = useState<string>("food");
  const googleEnabled = true;
  const [xhsEnabled, setXhsEnabled] = useState(false);
  const [xhsService, setXhsService] = useState<ServiceCode>(
    XHS_SERVICE_OPTIONS[0].code,
  );
  const [naverCmoEnabled, setNaverCmoEnabled] = useState(false);
  const [naverCmoServices, setNaverCmoServices] = useState<ServiceCode[]>([
    NAVER_CMO_SERVICE_OPTIONS[0].code,
  ]);
  const [godukEnabled, setGodukEnabled] = useState(false);
  const [taiwanTrialEnabled, setTaiwanTrialEnabled] = useState(false);
  const [japanTrialEnabled, setJapanTrialEnabled] = useState(false);
  const [businessNumber, setBusinessNumber] = useState("");
  const [address, setAddress] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [contractMonths, setContractMonths] = useState(6);
  const [keywords, setKeywords] = useState(BASE_KEYWORD_COUNT);
  const [manualPricing, setManualPricing] = useState(false);
  const [monthlyFee, setMonthlyFee] = useState(950000);
  const [discountAmount, setDiscountAmount] = useState<string>("");  // 빈값=할인 없음
  const [paymentMethodCode, setPaymentMethodCode] = useState<string>("transfer");
  const [taxInvoice, setTaxInvoice] = useState(true);
  const [memo, setMemo] = useState("");
  // ─── 마케팅·링크 (마이그 20260506000006~007) ───
  const [keywordKo, setKeywordKo] = useState("");
  const [keywordEn, setKeywordEn] = useState("");
  const [keywordJa, setKeywordJa] = useState("");
  const [keywordZhTw, setKeywordZhTw] = useState("");
  const [naverPlaceUrl, setNaverPlaceUrl] = useState("");
  const [googleMapUrl, setGoogleMapUrl] = useState("");
  const [driveFolderUrl, setDriveFolderUrl] = useState("");
  const [onboardingSheetUrl, setOnboardingSheetUrl] = useState("");
  // ─── 업주 성향 (마이그 20260506000005) ───
  const [ownerPriority, setOwnerPriority] = useState<string>("");
  const [ownerMemo, setOwnerMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from("profiles").select("id, name").order("name"),
      supabase.auth.getUser(),
    ]).then(([profilesRes, userRes]) => {
      if (profilesRes.error) {
        setError(profilesRes.error.message);
        return;
      }
      const members = (profilesRes.data ?? []) as StaffMember[];
      setStaff(members);
      const currentUserId = userRes.data.user?.id;
      if (currentUserId && members.some((member) => member.id === currentUserId)) {
        setAssigneeIds([currentUserId]);
      }
    });
  }, []);

  const autoQuote = calculateMonthlyQuote({
    typeCode,
    contractMonths,
    keywordsCount: keywords,
  });
  const fullPriceQuote = calculateMonthlyQuote({
    typeCode,
    contractMonths: 1,
    keywordsCount: keywords,
  });
  const quoteMonthlyFee = manualPricing ? monthlyFee : autoQuote.monthlyFee;
  const depositMonthlyFee = manualPricing ? quoteMonthlyFee : fullPriceQuote.monthlyFee;
  const discountNum = discountAmount === "" ? 0 : Number(discountAmount);
  const effectiveMonthly =
    discountNum > 0 && discountNum < quoteMonthlyFee
      ? discountNum
      : quoteMonthlyFee;
  const computedDiscountPct =
    quoteMonthlyFee > 0 && effectiveMonthly < quoteMonthlyFee
      ? Math.round(((quoteMonthlyFee - effectiveMonthly) / quoteMonthlyFee) * 100)
      : 0;
  const monthlyVat = Math.round(effectiveMonthly * VAT_RATE);
  const monthlyWithVat = effectiveMonthly + monthlyVat;
  const contractTotal = monthlyWithVat * contractMonths;
  const contractSubtotal = effectiveMonthly * contractMonths;
  const paymentSchedule = Array.from({ length: contractMonths }, (_, index) => {
    const remainingBeforePayment = contractSubtotal - depositMonthlyFee * index;
    if (remainingBeforePayment <= 0) return 0;
    return Math.min(depositMonthlyFee, remainingBeforePayment);
  });
  const paymentScheduleWithVat = paymentSchedule.map((amount) =>
    Math.round(amount * (1 + VAT_RATE)),
  );
  const selectedServices: ServiceCode[] = [
    ...(googleEnabled ? (["google_gbp"] as ServiceCode[]) : []),
    ...(xhsEnabled ? [xhsService] : []),
    ...(naverCmoEnabled ? naverCmoServices : []),
    ...(godukEnabled ? (["goduk_map"] as ServiceCode[]) : []),
    ...(taiwanTrialEnabled ? (["taiwan_trial"] as ServiceCode[]) : []),
    ...(japanTrialEnabled ? (["japan_trial"] as ServiceCode[]) : []),
  ];
  const xhsServices = selectedServices.filter((service) =>
    service.startsWith("xhs_"),
  );
  const selectedServiceCount = selectedServices.length;

  const toggleNaverCmoService = (code: ServiceCode) => {
    setNaverCmoServices((prev) =>
      prev.includes(code)
        ? prev.filter((service) => service !== code)
        : [...prev, code],
    );
  };

  const enableManualPricing = (checked: boolean) => {
    setManualPricing(checked);
    if (checked) setMonthlyFee(autoQuote.monthlyFee);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    if (selectedServices.length === 0) {
      setError("서비스를 하나 이상 선택해주세요.");
      setSubmitting(false);
      return;
    }

    // 다국어 키워드 jsonb 빌드 (빈값 제외)
    const i18n: Record<string, string> = {};
    if (keywordKo.trim()) i18n.ko = keywordKo.trim();
    if (keywordEn.trim()) i18n.en = keywordEn.trim();
    if (keywordJa.trim()) i18n.ja = keywordJa.trim();
    if (keywordZhTw.trim()) i18n.zh_tw = keywordZhTw.trim();

    const result = await createStoreAction({
      name,
      typeCode,
      businessNumber: businessNumber || null,
      address: address || null,
      ownerName: ownerName || null,
      ownerEmail: ownerEmail || null,
      ownerPhone: ownerPhone || null,
      contractMonths,
      keywordsCount: keywords,
      monthlyFee: quoteMonthlyFee,
      discountAmount:
        discountNum > 0 && discountNum < quoteMonthlyFee ? discountNum : null,
      paymentMethodCode,
      taxInvoice,
      gbpAlreadyCreated: !googleEnabled,
      memo,
      selectedServices,
      pricingMetadata: {
        mode: manualPricing ? "manual" : "auto",
        pricingGroup: autoQuote.group,
        baseKeywordCount: autoQuote.baseKeywordCount,
        baseMonthlyFee: autoQuote.baseMonthlyFee,
        extraKeywordCount: autoQuote.extraKeywordCount,
        extraKeywordUnitFee: autoQuote.extraKeywordUnitFee,
        extraKeywordMonthlyFee: autoQuote.extraKeywordMonthlyFee,
        quotedMonthlyFee: quoteMonthlyFee,
        finalMonthlyFee: effectiveMonthly,
        depositMonthlyFee,
        contractSubtotal,
        paymentSchedule,
        vatRate: VAT_RATE,
      },
      currentRound: null,
      mainKeywordsI18n: Object.keys(i18n).length ? i18n : null,
      naverPlaceUrl,
      googleMapUrl,
      driveFolderUrl,
      onboardingSheetUrl,
      checklistSheetUrl: null,
      reviewSheetUrl: null,
      ownerPriority,
      ownerMemo,
      assigneeIds,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push("/app/stores");
  };

  return (
    <main className="flex flex-1 flex-col gap-5 overflow-y-auto p-6 lg:p-8">
      <header className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/app/stores">
            <ArrowLeft className="size-4" />
            목록
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">매장 등록</h1>
          <p className="text-sm text-muted-foreground">
            등록 시 A.1 (계약 정보 수집) 퀘스트가 자동 생성됩니다
          </p>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryPill label="월 청구액" value={`${monthlyWithVat.toLocaleString("ko-KR")}원`} tone="info" />
        <SummaryPill label="약정 합계" value={`${contractTotal.toLocaleString("ko-KR")}원`} tone="success" />
        <SummaryPill label="서비스" value={`${selectedServiceCount}개 선택`} tone="warning" />
        <SummaryPill label="견적 방식" value={manualPricing ? "수동 단가" : "자동 계산"} />
      </div>

      {error && (
        <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">
          저장 실패: {error}
        </div>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <div className="flex flex-1 flex-col gap-5">
          {/* 매장 기본 정보 */}
          <FormSection
            icon={Building2}
            title="매장 기본 정보"
            desc="계약서·견적서·퀘스트 기준이 되는 기본값입니다."
            tone="info"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="매장명" required>
                <input
                  className={inputCls}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="예: 강남역 한우다이닝"
                  required
                />
              </Field>
              <Field label="업종" required>
                <select
                  className={inputCls}
                  value={typeCode}
                  onChange={(e) => setTypeCode(e.target.value)}
                >
                  {types.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="사업자등록번호">
                <input
                  className={inputCls}
                  value={businessNumber}
                  onChange={(e) => setBusinessNumber(e.target.value)}
                  placeholder="000-00-00000"
                />
              </Field>
              <Field label="주소">
                <input
                  className={inputCls}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="서울 ..."
                />
              </Field>
              <Field label="업주 이름">
                <input
                  className={inputCls}
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="김사장"
                />
              </Field>
              <Field label="업주 연락처">
                <input
                  className={inputCls}
                  value={ownerPhone}
                  onChange={(e) => setOwnerPhone(e.target.value)}
                  placeholder="010-0000-0000"
                />
              </Field>
              <Field label="업주 이메일" hint="견적서·계약서 발송용">
                <input
                  className={inputCls}
                  type="email"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  placeholder="owner@example.com"
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="담당자" hint="여러 명 선택 가능. 첫 번째 선택자가 메인 담당자로 저장됩니다.">
                  <div className="flex flex-wrap gap-2 rounded-md border bg-background p-2">
                    {staff.length === 0 ? (
                      <span className="text-xs text-muted-foreground">담당자 불러오는 중...</span>
                    ) : (
                      staff.map((member) => {
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
                      })
                    )}
                  </div>
                </Field>
              </div>
            </div>
          </FormSection>

          {/* 서비스 */}
          <FormSection
            icon={CheckCircle2}
            title="서비스"
            desc="구글 SEO/GBP 관리는 기본 서비스로 고정하고, 필요한 서비스만 추가합니다."
            tone="success"
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <ServiceGroupCard
                label="구글"
                desc="SEO/GBP 관리 · 기본 고정"
                checked
                disabled
              />
              <ServiceGroupCard
                label="샤오홍슈"
                desc="체험단·기자단"
                checked={xhsEnabled}
                onCheckedChange={setXhsEnabled}
              >
                <select
                  className={inputCls}
                  value={xhsService}
                  onChange={(e) => setXhsService(e.target.value as ServiceCode)}
                >
                  {XHS_SERVICE_OPTIONS.map((service) => (
                    <option key={service.code} value={service.code}>
                      {service.label.replace("샤오홍슈 ", "")}
                    </option>
                  ))}
                </select>
              </ServiceGroupCard>
              <ServiceGroupCard
                label="네이버CMO"
                desc="플레이스·인스타 복수 선택"
                checked={naverCmoEnabled}
                onCheckedChange={setNaverCmoEnabled}
              >
                <div className="space-y-1.5">
                  {NAVER_CMO_SERVICE_OPTIONS.map((service) => (
                    <label
                      key={service.code}
                      className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={naverCmoServices.includes(service.code)}
                        onChange={() => toggleNaverCmoService(service.code)}
                        className="size-3"
                      />
                      {service.label.replace("네이버CMO - ", "")}
                    </label>
                  ))}
                </div>
              </ServiceGroupCard>
              <ServiceGroupCard
                label="고덕지도"
                desc="지도 노출 관리"
                checked={godukEnabled}
                onCheckedChange={setGodukEnabled}
              />
              <ServiceGroupCard
                label="대만 체험단"
                desc="해외 체험단"
                checked={taiwanTrialEnabled}
                onCheckedChange={setTaiwanTrialEnabled}
              />
              <ServiceGroupCard
                label="일본 체험단"
                desc="해외 체험단"
                checked={japanTrialEnabled}
                onCheckedChange={setJapanTrialEnabled}
              />
            </div>
            {xhsServices.length > 0 && (
              <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                샤오홍슈 서비스는 등록 시 일정양식 수취 퀘스트가 자동 생성됩니다. 실제 일정 자동 파싱은 본사 양식 컬럼을 받은 뒤 연결합니다.
              </p>
            )}
          </FormSection>

          {/* 계약 조건 */}
          <FormSection
            icon={ReceiptText}
            title="계약"
            desc="업종·기간·키워드 수에 따라 공급가를 자동 계산하고, 필요하면 수동 조정합니다."
            tone="warning"
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="약정 기간 (개월)" required>
                <select
                  className={inputCls}
                  value={contractMonths}
                  onChange={(e) => setContractMonths(Number(e.target.value))}
                >
                  {CONTRACT_MONTH_OPTIONS.map((months) => (
                    <option key={months} value={months}>
                      {months}개월
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="키워드 수"
                required
                hint={`기본 ${BASE_KEYWORD_COUNT}개 포함. 추가분은 자동 가산`}
              >
                <input
                  type="number"
                  min={1}
                  className={inputCls}
                  value={keywords}
                  onChange={(e) => setKeywords(Number(e.target.value))}
                />
              </Field>
              <Field
                label="월 단가 (공급가, 원)"
                required
                hint={
                  manualPricing
                    ? "수동 입력 중. VAT 별도"
                    : `${pricingGroupLabel(autoQuote.group)} 자동 계산. VAT 별도`
                }
              >
                <input
                  type="number"
                  min={0}
                  step={10000}
                  className={cn(
                    inputCls,
                    !manualPricing && "bg-muted/50 text-muted-foreground",
                  )}
                  value={quoteMonthlyFee}
                  onChange={(e) => setMonthlyFee(Number(e.target.value))}
                  readOnly={!manualPricing}
                />
              </Field>
              <Field label="월 단가 수동 입력">
                <label className="flex h-10 items-center gap-2 rounded-md border bg-background px-3 text-sm">
                  <input
                    type="checkbox"
                    checked={manualPricing}
                    onChange={(e) => enableManualPricing(e.target.checked)}
                    className="size-3.5"
                  />
                  직접 입력
                </label>
              </Field>
              <Field label="할인 단가 (원)" hint="비우면 할인 없음. 할인율은 자동 계산">
                <input
                  type="number"
                  min={0}
                  step={10000}
                  className={inputCls}
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(e.target.value)}
                  placeholder={`예: ${Math.round(quoteMonthlyFee * 0.9).toLocaleString("ko-KR")}`}
                />
              </Field>
              <Field label="결제 방식" required>
                <select
                  className={inputCls}
                  value={paymentMethodCode}
                  onChange={(e) => setPaymentMethodCode(e.target.value)}
                >
                  {paymentMethods.map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="세금계산서 발행">
                <label className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={taxInvoice}
                    onChange={(e) => setTaxInvoice(e.target.checked)}
                  />
                  발행
                </label>
              </Field>
            </div>
            <div className="mt-4 grid gap-1.5 rounded-md bg-muted/30 px-3 py-2.5 text-sm">
              <div className="flex items-baseline justify-between">
                <span className="text-muted-foreground">기본가 ({BASE_KEYWORD_COUNT}키워드 포함)</span>
                <span className="tabular-nums">{autoQuote.baseMonthlyFee.toLocaleString("ko-KR")}원</span>
              </div>
              {autoQuote.extraKeywordCount > 0 && (
                <div className="flex items-baseline justify-between">
                  <span className="text-muted-foreground">
                    추가 키워드 {autoQuote.extraKeywordCount}개 ×{" "}
                    {autoQuote.extraKeywordUnitFee.toLocaleString("ko-KR")}원
                  </span>
                  <span className="tabular-nums">
                    +{autoQuote.extraKeywordMonthlyFee.toLocaleString("ko-KR")}원
                  </span>
                </div>
              )}
              {manualPricing && (
                <div className="flex items-baseline justify-between text-amber-700">
                  <span>자동 계산가</span>
                  <span className="tabular-nums">
                    {autoQuote.monthlyFee.toLocaleString("ko-KR")}원
                  </span>
                </div>
              )}
              <div className="flex items-baseline justify-between">
                <span className="text-muted-foreground">월 공급가</span>
                <span className="tabular-nums">{quoteMonthlyFee.toLocaleString("ko-KR")}원</span>
              </div>
              {computedDiscountPct > 0 && (
                <div className="flex items-baseline justify-between text-rose-600">
                  <span>할인 ({computedDiscountPct}% 자동)</span>
                  <span className="tabular-nums">−{(quoteMonthlyFee - effectiveMonthly).toLocaleString("ko-KR")}원</span>
                </div>
              )}
              <div className="flex items-baseline justify-between">
                <span className="text-muted-foreground">VAT 10%</span>
                <span className="tabular-nums">+{monthlyVat.toLocaleString("ko-KR")}원</span>
              </div>
              <div className="flex items-baseline justify-between border-t pt-1.5">
                <span className="font-medium">월 청구액 (VAT 포함)</span>
                <span className="tabular-nums font-semibold">{monthlyWithVat.toLocaleString("ko-KR")}원</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-muted-foreground">약정 {contractMonths}개월 총액</span>
                <span className="tabular-nums font-semibold">{contractSubtotal.toLocaleString("ko-KR")}원</span>
              </div>
              <div className="flex items-baseline justify-between border-t pt-1.5">
                <span className="text-muted-foreground">VAT 포함 참고 합계</span>
                <span className="tabular-nums font-semibold">{contractTotal.toLocaleString("ko-KR")}원</span>
              </div>
              <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                <div className="font-medium">입금 스케줄 확인 (VAT 포함)</div>
                <div className="mt-0.5 text-muted-foreground">
                  입금 기준 단가: {(Math.round(depositMonthlyFee * (1 + VAT_RATE))).toLocaleString("ko-KR")}원
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {paymentScheduleWithVat.map((amount, index) => (
                    <span
                      key={index}
                      className="rounded border border-amber-200 bg-background px-2 py-0.5 tabular-nums"
                    >
                      {index + 1}회차{" "}
                      {amount > 0
                        ? `${amount.toLocaleString("ko-KR")}원`
                        : "무료관리"}
                    </span>
                  ))}
                </div>
                <div className="mt-1 text-muted-foreground">
                  공급가 기준으로는 할인 전 월 단가를 먼저 받고, 계약 총액에 도달하는 회차만
                  잔액으로 조정합니다.
                </div>
              </div>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              견적서 총액은 할인 단가 기준입니다. 실제 입금은 할인 전 월 단가로 먼저 받고,
              누적 입금액이 계약 총액에 도달한 뒤 남은 기간은 무료관리로 처리합니다.
            </p>
          </FormSection>

          {/* 마케팅·매장 링크 — 3분할 카드 좌측에 표시되는 정보 */}
          <FormSection
            icon={LinkIcon}
            title="마케팅·매장 링크"
            desc="퀘스트 카드 좌측 패널에 표시되는 키워드와 바로가기 링크입니다."
            tone="brand"
          >
            <h3 className="mb-2 text-sm font-medium">현재 메인 키워드 (다국어)</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="🇰🇷 한국어" hint="여러 개면 쉼표로 구분">
                <input
                  className={inputCls}
                  value={keywordKo}
                  onChange={(e) => setKeywordKo(e.target.value)}
                  placeholder="예: 강남 고기집, 강남 한우"
                />
              </Field>
              <Field label="🇺🇸 영어">
                <input
                  className={inputCls}
                  value={keywordEn}
                  onChange={(e) => setKeywordEn(e.target.value)}
                  placeholder="gangnam restaurants, korean bbq"
                />
              </Field>
              <Field label="🇯🇵 일본어">
                <input
                  className={inputCls}
                  value={keywordJa}
                  onChange={(e) => setKeywordJa(e.target.value)}
                  placeholder="江南 焼肉"
                />
              </Field>
              <Field label="🇹🇼 중국어 번체">
                <input
                  className={inputCls}
                  value={keywordZhTw}
                  onChange={(e) => setKeywordZhTw(e.target.value)}
                  placeholder="江南 烤肉店"
                />
              </Field>
            </div>

            <h3 className="mt-5 mb-2 text-sm font-medium">바로가기 링크</h3>
            <p className="mb-3 text-xs text-muted-foreground">
              체크리스트·리뷰 시트는 공용 링크라 매장별로 입력하지 않습니다. 공용 링크는 내 정보의 설정에서 관리합니다.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="네이버 플레이스 URL">
                <input
                  className={inputCls}
                  type="url"
                  value={naverPlaceUrl}
                  onChange={(e) => setNaverPlaceUrl(e.target.value)}
                  placeholder="https://map.naver.com/p/entry/place/..."
                />
              </Field>
              <Field label="구글 지도 URL">
                <input
                  className={inputCls}
                  type="url"
                  value={googleMapUrl}
                  onChange={(e) => setGoogleMapUrl(e.target.value)}
                  placeholder="https://maps.google.com/..."
                />
              </Field>
              <Field label="자료 모음 (구글 드라이브)" hint="매장 자료 폴더 공유 링크">
                <input
                  className={inputCls}
                  type="url"
                  value={driveFolderUrl}
                  onChange={(e) => setDriveFolderUrl(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/..."
                />
              </Field>
              <Field label="온보딩 시트 URL" hint="본사 작업 시트">
                <input
                  className={inputCls}
                  type="url"
                  value={onboardingSheetUrl}
                  onChange={(e) => setOnboardingSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                />
              </Field>
            </div>
          </FormSection>

          {/* 업주 성격 — 3분할 카드 중간에 표시되는 정보 */}
          <FormSection
            icon={UserRound}
            title="업주 성격"
            desc="미팅·통화로 알아낸 업주 응대 기준입니다. 퀘스트 카드 중간 패널에 표시됩니다."
            tone="info"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="업주가 우선시하는 것" hint="응대 톤 결정에 사용">
                <select
                  className={inputCls}
                  value={ownerPriority}
                  onChange={(e) => setOwnerPriority(e.target.value)}
                >
                  {OWNER_PRIORITY_OPTIONS.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="메모" hint="업주 응대 시 떠올려야 할 핵심 메모">
                <textarea
                  className={cn(inputCls, "min-h-[64px] resize-y")}
                  value={ownerMemo}
                  onChange={(e) => setOwnerMemo(e.target.value)}
                  placeholder="예: 실장님을 통해 응대 선호. 짧고 명확한 보고에 반응 좋음."
                />
              </Field>
            </div>
          </FormSection>

          {/* 비고 — 내부 영업자용 */}
          <FormSection icon={FileText} title="내부 비고" desc="영업자 내부 참고용입니다." tone="neutral">
            <Field label="메모" hint="영업자 내부 참고용. 카드에는 표시되지 않음 (업주 정보는 위 '업주 성격'에)">
              <textarea
                className={cn(inputCls, "min-h-[100px] resize-y")}
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="예: 사장님 통화 가능 시간, 사내 공유사항 등"
              />
            </Field>
          </FormSection>

          <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            <Info className="mt-0.5 size-4 shrink-0" />
            <div>
              등록 즉시 <strong>A.1 (계약 정보 수집)</strong> 퀘스트가 자동 생성되며, 계약 전 프로세스
              7단계가 순차 활성화됩니다.
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button asChild type="button" variant="outline">
              <Link href="/app/stores">취소</Link>
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              등록하기
            </Button>
          </div>
        </div>

      </form>
    </main>
  );
}
