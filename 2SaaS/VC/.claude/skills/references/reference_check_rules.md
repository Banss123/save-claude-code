# reference_check 규칙 — 정본 §필수 준수 1~8

`src/validator/reference_check.py` 가 검증하는 8개 규칙. 정본 `data/references/목표매출_산정로직.md` §필수 준수 1~8 의 코드 매핑이며, `onboarding-full` / `quality-check` 두 스킬이 공유하는 단일 진실 출처(SoT)다.

## 규칙 목록

| ID | 규칙명 | 심각도 | 판정 기준 |
|----|--------|--------|----------|
| REF-1 | 희망매출 목표 수용 금지 | error | `owner_hope_won != tier_2_revenue_won` |
| REF-2 | 벤치마크 기반 개선폭 | warn | 4 레버 각 delta 에 `basis` 문자열 존재 |
| REF-3 | 달성 확률 수치 제시 | warn | `tier_1/2_probability_pct` int 1~100 |
| REF-4 | 수수료 상한 200만원 체크 | error | `fee_cap_ok` 필드 존재 + bool |
| REF-5 | 데이터 부족 항목 명시 | warn | targets.coupang_eats/yogiyo.status ∈ {데이터 부족, 현재 유지, 산정} |
| REF-6 | 1차/2차 목표 간격 ≥ 30% | error | `tier_2 / tier_1 - 1 >= 0.30` |
| REF-7 | 2차 달성 확률 ≤ 60% | error | `tier_2_probability_pct <= 60` |
| REF-8 | 매장주 실행 반영 | warn | analysis 현재값(CTR/CVR/AOV) 중 하나라도 0 초과 |

## 등급 영향

- **error 등급 FAIL 1건이라도 있으면**: `ReferenceCheckReport.all_passed=False` → ValidationReport `is_ok=False` → pipeline `exit=1` (문서는 생성되나 검수 미통과)
- **warn 등급 FAIL**: 리포트에 표기되나 게이트 차단은 하지 않음

## ValidationReport 체크리스트 형태

`detail_report()` 출력에서 "정본 §필수 준수 검증" 그룹을 확인할 때 사용:

- [ ] REF-1 (error): 희망매출을 목표로 수용하지 않음
- [ ] REF-2 (warn) : 레버별 개선폭이 벤치마크 기반 (basis 문자열 존재)
- [ ] REF-3 (warn) : 달성 확률이 1~100 int 로 제시됨
- [ ] REF-4 (error): `fee_cap_ok` 필드 포함
- [ ] REF-5 (warn) : 플랫폼별 status 표기 (또는 pre-L-3 disclaimer)
- [ ] REF-6 (error): tier_2 / tier_1 - 1 ≥ 30%
- [ ] REF-7 (error): tier_2 확률 ≤ 60%
- [ ] REF-8 (warn) : analysis 현재값(CTR/CVR/AOV) 존재
