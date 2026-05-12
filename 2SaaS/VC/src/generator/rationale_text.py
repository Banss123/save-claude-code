"""DEPRECATED — 2026-04-22 담당자 피드백에 따라 XLSX 버전으로 대체.

신규 경로: src/generator/rationale_xlsx.py
이 모듈은 파이프라인에서 호출되지 않습니다. 과거 로직 참조용으로만 남겨둡니다.

────────────────────────────────────────────────
원문 문서:
목표매출 산정 근거 텍스트 파일 생성 — 담당자 내부용.

원본 수치(반올림 전), 레버 분석 4개 상세, TAM 상태, 계절성,
REF 검증 결과, 산정 한계 및 가정을 평문 .txt로 출력.

담당자 피드백(2026-04-22): XLSX "목표매출_근거" 시트 제거 대신
동일 정보를 별도 txt로 분리 — 업주 제공 파일에 내부 수치 노출 방지.

이 파일은 업주에게 전달되지 않는다. 바탕화면 복사 대상도 아니다 (orchestrator.py 에서
XLSX/DOCX 만 복사).
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from src.schemas.solution import SolutionPlan
from src.validator.reference_check import check_reference

# ─────────────────────────────────────────────
# 표시 유틸
# ─────────────────────────────────────────────
_BAR = "─" * 64
_DBAR = "=" * 64
_NA = "-"


def _round_down_to_500k(amount: int) -> int:
    """50만원 단위 내림 — docx_builder 와 동일 규칙 (담당자 내부용도 동일 기준).

    10만원 미만은 그대로.
    """
    if amount < 100_000:
        return amount
    return (amount // 500_000) * 500_000


def _won(value: Any) -> str:
    """정수 → '1,234,567원' / None → '-'."""
    if value is None:
        return _NA
    try:
        return f"{int(value):,}원"
    except (TypeError, ValueError):
        return _NA


def _pct(value: Any, digits: int = 1) -> str:
    """소수 → 'N.N%' / None → '-'."""
    if value is None:
        return _NA
    try:
        return f"{float(value):.{digits}f}%"
    except (TypeError, ValueError):
        return _NA


def _multiplier_pct(value: Any) -> str:
    """레버 delta (0~1 소수) → '+NN.N%' 형태. None → '-'."""
    if value is None:
        return _NA
    try:
        return f"+{float(value) * 100:.1f}%"
    except (TypeError, ValueError):
        return _NA


def _ok_or_adjust(ok: Any) -> str:
    if ok is True:
        return "적합"
    if ok is False:
        return "재조정 필요"
    return _NA


def _section(title: str) -> list[str]:
    return [_BAR, title, _BAR, ""]


# ─────────────────────────────────────────────
# 렌더러
# ─────────────────────────────────────────────
def _render_header(plan: SolutionPlan) -> list[str]:
    store = plan.store
    return [
        _DBAR,
        "목표매출 산정 근거 — 담당자 내부용",
        _DBAR,
        "",
        f"매장: {store.name}",
        f"업종: {store.business_type or _NA}",
        f"위치: {store.location or _NA}",
        f"산정일: {store.document_date or _NA}",
        "",
        "※ 업주 제공 파일(XLSX·DOCX)과 별개 — 내부 검토·의사결정용입니다.",
        "",
    ]


def _case_label(target_case: str | None) -> str:
    labels = {
        "LEVER": "4-레버 곱셈 산정 (정본)",
        "A": "A 케이스",
        "B": "B 케이스",
        "C": "C 케이스",
        "D": "D 케이스 (운영 정비)",
        "E": "E 케이스 (신규·소형)",
        "manual": "수동 입력",
    }
    if target_case is None:
        return "-"
    return labels.get(target_case, target_case)


def _render_summary(
    plan: SolutionPlan,
    lr: dict[str, Any] | None,
) -> list[str]:
    target_meta = plan.target_meta
    lines = _section("1. 케이스 및 요약")

    target_case = target_meta.target_case if target_meta else None
    target_rationale = target_meta.target_rationale if target_meta else None
    lines.append(f"케이스: {target_case or _NA}  ({_case_label(target_case)})")

    if lr is not None:
        bench = (lr.get("analysis") or {}).get("cuisine_benchmark")
        lines.append(f"카테고리 벤치마크: {bench or _NA}")
    lines.append("")

    targets = (lr or {}).get("targets") or {}
    tier_1_raw = targets.get("tier_1_revenue_won")
    tier_2_raw = targets.get("tier_2_revenue_won")

    if tier_1_raw is not None:
        lines.append(f"1차 목표 (3개월, 3% 구간): {_won(tier_1_raw)} ({_pct(targets.get('tier_1_growth_pct'))} 증가)")
        lines.append(f"  -> 반올림(업주 표시): {_won(_round_down_to_500k(int(tier_1_raw)))}")
        lines.append(f"  -> 달성 확률: {targets.get('tier_1_probability_pct', _NA)}%")
        lines.append(f"  -> 예상 월 수수료: {_won(targets.get('tier_1_monthly_fee_won'))}")
        lines.append("")

    if tier_2_raw is not None:
        lines.append(f"2차 목표 (6개월, 5% 구간): {_won(tier_2_raw)} ({_pct(targets.get('tier_2_growth_pct'))} 증가)")
        lines.append(f"  -> 반올림(업주 표시): {_won(_round_down_to_500k(int(tier_2_raw)))}")
        lines.append(f"  -> 달성 확률: {targets.get('tier_2_probability_pct', _NA)}%")
        lines.append(f"  -> 예상 월 수수료: {_won(targets.get('tier_2_monthly_fee_won'))}")
        lines.append(f"  -> 수수료 상한 200만원: {_ok_or_adjust(targets.get('fee_cap_ok'))}")
        adj_note = targets.get("adjustment_note")
        if adj_note:
            lines.append(f"  -> 조정 사유: {adj_note}")
        lines.append("")

    # tier_plan 에서 간이 요약 (A/B/C 케이스에서 tier_plan 이 있는 경우)
    tp = plan.tier_plan
    if tp is not None:
        lines.append("[tier_plan 요약 — DOCX 표 기준]")
        for tier_label, tier in (
            ("3개월차", tp.tier1_3m),
            ("6개월차", tp.tier2_6m),
            ("12개월차", tp.tier3_12m),
        ):
            lines.append(
                f"  {tier_label}: {_won(tier.target)} "
                f"(배수 {tier.multiplier:.2f} / season {tier.season_factor:.2f})"
            )
        lines.append("")

    # target_rationale
    if target_rationale:
        lines.append("[산정 근거 요약]")
        lines.append(f"  {target_rationale}")
        lines.append("")

    return lines


def _render_levers(lr: dict[str, Any] | None) -> list[str]:
    lines = _section("2. 레버별 현황 및 개선 여력")
    if lr is None:
        lines.append("lever_report 미존재 — 레버 경로 아님 (E 가드 또는 수동 케이스).")
        lines.append("")
        return lines

    analysis = lr.get("analysis") or {}
    current_impressions = lr.get("current_impressions_31d")

    # 레버 1 — 노출수
    imp = analysis.get("impression_delta") or {}
    lines.append("[레버 1 — 노출수]")
    lines.append(f"  현재(최근 31일): {current_impressions:,}건" if isinstance(current_impressions, int) else f"  현재(최근 31일): {_NA}")
    lines.append(f"  단기 개선 여력: {_multiplier_pct(imp.get('short_term_pct'))}")
    lines.append(f"  중기 개선 여력: {_multiplier_pct(imp.get('mid_term_pct'))}")
    lines.append(f"  근거: {imp.get('basis') or _NA}")
    lines.append("")

    # 레버 2 — CTR
    ctr = analysis.get("ctr_delta") or {}
    lines.append("[레버 2 — CTR]")
    lines.append(f"  현재: {_pct(analysis.get('current_ctr_pct'), 2)}")
    lines.append(f"  단기 개선 여력: {_multiplier_pct(ctr.get('short_term_pct'))}")
    lines.append(f"  중기 개선 여력: {_multiplier_pct(ctr.get('mid_term_pct'))}")
    lines.append(f"  근거: {ctr.get('basis') or _NA}")
    lines.append("")

    # 레버 3 — CVR
    cvr = analysis.get("cvr_delta") or {}
    lines.append("[레버 3 — CVR]")
    lines.append(f"  현재: {_pct(analysis.get('current_cvr_pct'), 2)}")
    lines.append(f"  단기 개선 여력: {_multiplier_pct(cvr.get('short_term_pct'))}")
    lines.append(f"  중기 개선 여력: {_multiplier_pct(cvr.get('mid_term_pct'))}")
    lines.append(f"  근거: {cvr.get('basis') or _NA}")
    lines.append("")

    # 레버 4 — AOV
    aov = analysis.get("aov_delta") or {}
    lines.append("[레버 4 — 객단가]")
    lines.append(f"  현재: {_won(analysis.get('current_aov_won'))}")
    lines.append(f"  단기 개선 여력: {_multiplier_pct(aov.get('short_term_pct'))}")
    lines.append(f"  중기 개선 여력: {_multiplier_pct(aov.get('mid_term_pct'))}")
    lines.append(f"  근거: {aov.get('basis') or _NA}")
    lines.append("")

    return lines


def _render_assumptions(
    plan: SolutionPlan,
    lr: dict[str, Any] | None,
) -> list[str]:
    lines = _section("3. 산정 한계 및 가정")

    analysis = (lr or {}).get("analysis") or {}
    bench = analysis.get("cuisine_benchmark")
    ctr = analysis.get("current_ctr_pct")
    cvr = analysis.get("current_cvr_pct")
    aov = analysis.get("current_aov_won")

    idx = 1
    lines.append(
        f"{idx}. 카테고리 벤치마크: {bench or _NA} "
        f"(CTR {_pct(ctr, 2)} · CVR {_pct(cvr, 2)} · AOV {_won(aov)})"
    )
    idx += 1

    # TAM
    tam_meta = plan.tam_meta
    if tam_meta is None:
        tam_line = "미연동 (tam_meta 없음)"
    elif tam_meta.available:
        if tam_meta.tam_monthly_revenue_won is not None:
            tam_line = f"연동됨 (월 추정 {_won(tam_meta.tam_monthly_revenue_won)})"
        else:
            tam_line = "연동됨"
    else:
        tam_line = f"미연동 — {tam_meta.reason or '사유 미상'}"
    lines.append(f"{idx}. 상권 경쟁도(TAM): {tam_line}")
    idx += 1

    # 계절성
    season = (lr or {}).get("season_factors")
    if season:
        lines.append(
            f"{idx}. 계절성 반영: tier1 ×{season.get('tier_1', 1.0):.2f} / "
            f"tier2 ×{season.get('tier_2', 1.0):.2f}"
        )
    else:
        lines.append(f"{idx}. 계절성 반영: 미반영 (담당자 검토 필요)")
    idx += 1

    # TAM 캡
    tam_cap = bool((lr or {}).get("tam_cap_applied"))
    lines.append(f"{idx}. TAM 캡(25%): {'적용' if tam_cap else '미적용'}")
    idx += 1

    # 매장주 실행 준수 가정
    lines.append(f"{idx}. 매장주 실행 준수: 주 1회 이상 협조 전제로 확률 산정")
    idx += 1

    # 내부 실적 sanity
    hs = (lr or {}).get("historical_sanity")
    if isinstance(hs, dict):
        if hs.get("available"):
            lines.append(
                f"{idx}. 내부 실적 대비(sanity): n={hs.get('n')}건, "
                f"P50 {hs.get('p50_growth')}% / P80 {hs.get('p80_growth')}% / "
                f"레버 {hs.get('lever_growth')}% — {hs.get('verdict', _NA)}"
            )
        else:
            lines.append(
                f"{idx}. 내부 실적 대비(sanity): 비교 불가 "
                f"({hs.get('reason', _NA)})"
            )
    else:
        lines.append(f"{idx}. 내부 실적 대비(sanity): 데이터 없음")
    idx += 1

    # 가드
    guard_note = (lr or {}).get("guard_note")
    if guard_note:
        lines.append(f"{idx}. 가드: {guard_note}")
        idx += 1

    lines.append("")
    lines.append("[데이터 부족 / 추가 주의사항]")
    disclaimers = (lr or {}).get("disclaimers") or []
    if disclaimers:
        for d in disclaimers:
            lines.append(f"  - {d}")
    else:
        lines.append(f"  ({_NA})")
    lines.append("")

    return lines


def _render_reference_check(plan: SolutionPlan) -> list[str]:
    lines = _section("4. 정본 §필수 준수 REF 검증")
    report = check_reference(plan)
    for r in report.results:
        mark = "OK" if r.passed else ("FAIL" if r.severity == "error" else "WARN")
        lines.append(f"  {r.rule_id} [{mark}] {r.rule_name} — {r.detail or ''}")
    lines.append("")
    lines.append(
        f"종합: {'전체 PASS (error 급 실패 없음)' if report.all_passed else '주의 필요 — error 급 실패 존재'}"
    )
    lines.append("")
    return lines


def _render_handoff(
    plan: SolutionPlan,
    lr: dict[str, Any] | None,
) -> list[str]:
    lines = _section("5. 담당자 전달 시 참고")
    targets = (lr or {}).get("targets") or {}
    t1 = targets.get("tier_1_revenue_won")
    t2 = targets.get("tier_2_revenue_won")

    lines.append("- 업주 제공 DOCX/XLSX 에는 반올림된 금액으로만 노출됨.")
    if isinstance(t1, int):
        lines.append(
            f"  · 1차 목표 업주 표시값: {_won(_round_down_to_500k(t1))} "
            f"(원본 {_won(t1)})"
        )
    if isinstance(t2, int):
        lines.append(
            f"  · 2차 목표 업주 표시값: {_won(_round_down_to_500k(t2))} "
            f"(원본 {_won(t2)})"
        )
    lines.append("- 이 산정 근거 문서는 담당자 내부 검토용 — 업주 공유 금지.")
    lines.append("- 업주용 산정서(DOCX)와 메뉴판 가안(XLSX)은 별도 파일로 제공됨.")
    lines.append("")
    return lines


# ─────────────────────────────────────────────
# 공개 API
# ─────────────────────────────────────────────
def build_rationale_text(plan: SolutionPlan) -> str:
    """담당자 내부용 산정 근거 텍스트 생성.

    lever_report 가 없으면(D/E 케이스) 섹션 2·일부 한계 항목은 축약되고,
    REF 검증은 항상 포함된다.
    """
    target_meta = plan.target_meta
    lr: dict[str, Any] | None = None
    if target_meta is not None and isinstance(target_meta.lever_report, dict):
        lr = target_meta.lever_report

    blocks: list[str] = []
    blocks.extend(_render_header(plan))
    blocks.extend(_render_summary(plan, lr))
    blocks.extend(_render_levers(lr))
    blocks.extend(_render_assumptions(plan, lr))
    blocks.extend(_render_reference_check(plan))
    blocks.extend(_render_handoff(plan, lr))
    blocks.append(_DBAR)
    blocks.append("생성: src.generator.rationale_text")
    blocks.append(_DBAR)
    return "\n".join(blocks) + "\n"


def write_rationale_text(plan: SolutionPlan, out_path: str | Path) -> Path:
    """산정 근거 텍스트를 UTF-8 txt 파일로 저장.

    Args:
        plan: SolutionPlan (검증 통과 모델).
        out_path: 저장 경로 (.txt). 부모 디렉토리 자동 생성.

    Returns:
        실제 저장된 Path.
    """
    path = Path(out_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(build_rationale_text(plan), encoding="utf-8")
    return path
