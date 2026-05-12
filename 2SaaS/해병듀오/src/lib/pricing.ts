export const BASE_KEYWORD_COUNT = 3;
export const VAT_RATE = 0.1;

export const CONTRACT_MONTH_OPTIONS = [1, 3, 6, 12] as const;

type ContractMonth = (typeof CONTRACT_MONTH_OPTIONS)[number];
type PricingGroup = "food_beauty" | "medical";

const BASE_MONTHLY_PRICE: Record<PricingGroup, Record<ContractMonth, number>> = {
  food_beauty: {
    1: 1_300_000,
    3: 1_100_000,
    6: 950_000,
    12: 800_000,
  },
  medical: {
    1: 1_500_000,
    3: 1_300_000,
    6: 1_150_000,
    12: 1_000_000,
  },
};

const EXTRA_KEYWORD_PRICE: Record<PricingGroup, number> = {
  food_beauty: 100_000,
  medical: 200_000,
};

export const SERVICE_OPTIONS = [
  { code: "google_gbp", label: "구글 SEO/GBP 관리", priced: true },
  { code: "xhs_food_trial_500_10", label: "샤오홍슈 요식업 체험단 500팔 10팀", priced: false },
  { code: "xhs_food_press_500_10", label: "샤오홍슈 요식업 기자단 500팔 10팀", priced: false },
  { code: "xhs_beauty_pharm_mix_1000_5_10000_5", label: "샤오홍슈 뷰티&약국 1000팔 5팀 + 10000팔 5팀", priced: false },
  { code: "xhs_beauty_pharm_trial_1000_10", label: "샤오홍슈 뷰티&약국 체험단 1000팔 10팀", priced: false },
  { code: "xhs_beauty_pharm_10000_10", label: "샤오홍슈 뷰티&약국 10000팔 10팀", priced: false },
  { code: "xhs_beauty_pharm_press_mix_1000_5_10000_5", label: "샤오홍슈 뷰티&약국 기자단 1000팔 5팀 + 10000팔 5팀", priced: false },
  { code: "xhs_beauty_pharm_press_1000_10", label: "샤오홍슈 뷰티&약국 기자단 1000팔 10팀", priced: false },
  { code: "xhs_beauty_pharm_press_10000_10", label: "샤오홍슈 뷰티&약국 기자단 10000팔 10팀", priced: false },
  { code: "xhs_food_trial_premium_30cr", label: "샤오홍슈 요식업 체험단 프리미엄 30Cr", priced: false },
  { code: "xhs_beauty_trial_premium_20cr", label: "샤오홍슈 뷰티 체험단 프리미엄 20Cr", priced: false },
  { code: "xhs_beauty_trial_premium_40cr", label: "샤오홍슈 뷰티 체험단 프리미엄 40Cr", priced: false },
  { code: "naver_cmo_place", label: "네이버CMO - 네이버플레이스", priced: false },
  { code: "naver_cmo_instagram_ppl", label: "네이버CMO - 인스타그램 PPL", priced: false },
  { code: "naver_cmo_instagram_meta_ads", label: "네이버CMO - 인스타그램 메타광고", priced: false },
  { code: "goduk_map", label: "고덕지도", priced: false },
  { code: "taiwan_trial", label: "대만 체험단", priced: false },
  { code: "japan_trial", label: "일본 체험단", priced: false },
] as const;

export type ServiceCode = (typeof SERVICE_OPTIONS)[number]["code"];

export const XHS_SERVICE_OPTIONS = SERVICE_OPTIONS.filter((service) =>
  service.code.startsWith("xhs_"),
);

export const NAVER_CMO_SERVICE_OPTIONS = SERVICE_OPTIONS.filter((service) =>
  service.code.startsWith("naver_cmo_"),
);

const LEGACY_SERVICE_LABELS: Record<string, string> = {
  local_seo: "구글 SEO/GBP 관리",
  xhs_trial: "샤오홍슈 체험단",
  xhs_press: "샤오홍슈 기자단",
  meta_ads: "메타 광고",
  naver_service_tool: "네이버CMO - 네이버플레이스",
  instagram_ppl: "네이버CMO - 인스타그램 PPL",
  instagram_meta_ads: "네이버CMO - 인스타그램 메타광고",
};

export function serviceLabel(code: string) {
  return (
    SERVICE_OPTIONS.find((service) => service.code === code)?.label ??
    LEGACY_SERVICE_LABELS[code] ??
    code
  );
}

export function pricingGroupForType(typeCode: string): PricingGroup {
  return typeCode === "clinic" || typeCode === "pharm" ? "medical" : "food_beauty";
}

export function pricingGroupLabel(group: PricingGroup) {
  return group === "medical" ? "병의원·약국" : "요식업·뷰티";
}

export function calculateMonthlyQuote({
  typeCode,
  contractMonths,
  keywordsCount,
}: {
  typeCode: string;
  contractMonths: number;
  keywordsCount: number;
}) {
  const group = pricingGroupForType(typeCode);
  const normalizedMonths = CONTRACT_MONTH_OPTIONS.includes(
    contractMonths as ContractMonth,
  )
    ? (contractMonths as ContractMonth)
    : 1;
  const safeKeywords = Number.isFinite(keywordsCount)
    ? Math.max(1, Math.floor(keywordsCount))
    : BASE_KEYWORD_COUNT;
  const extraKeywordCount = Math.max(0, safeKeywords - BASE_KEYWORD_COUNT);
  const baseMonthlyFee = BASE_MONTHLY_PRICE[group][normalizedMonths];
  const extraKeywordUnitFee = EXTRA_KEYWORD_PRICE[group];
  const extraKeywordMonthlyFee = extraKeywordCount * extraKeywordUnitFee;

  return {
    group,
    contractMonths: normalizedMonths,
    keywordsCount: safeKeywords,
    baseKeywordCount: BASE_KEYWORD_COUNT,
    baseMonthlyFee,
    extraKeywordCount,
    extraKeywordUnitFee,
    extraKeywordMonthlyFee,
    monthlyFee: baseMonthlyFee + extraKeywordMonthlyFee,
  };
}
