"""parse_ugk_impression_click / parse_ad_detail 단위 테스트.

대상: 배민 우리가게클릭 광고 분석 페이지 텍스트에서 노출수·클릭수·CTR 파싱.
"""
from __future__ import annotations

from src.scraper.baemin_metrics import parse_ad_detail, parse_ugk_impression_click


def test_정상_18639회_595회_3_2퍼센트():
    """실제 파스타앤포크 안성점 ad_analysis_2.txt 발췌 — 정상 포맷."""
    text = """3월

광고비의 8.82배 매출을 얻었어요

광고비 226,695원으로 1,998,700원 주문이 발생했어요.

노출수: 18,639회
클릭수(클릭률 3.2%): 595회
주문수(전환율 16%): 94회
주문금액(광고매출): 1,998,700원
"""
    result = parse_ugk_impression_click(text)
    assert result["impression_count"] == 18639
    assert result["click_count"] == 595
    assert result["ctr_pct"] == 3.2
    assert result["conversion_count"] == 94
    assert result["cvr_pct"] == 16.0


def test_다른매장_10000회_이상():
    """반복 재현성 — 다른 수치 조합에서도 동일 패턴 매칭."""
    text = """노출수: 42,100회
클릭수(클릭률 2.5%): 1,052회
주문수(전환율 8.1%): 85회
"""
    result = parse_ugk_impression_click(text)
    assert result["impression_count"] == 42100
    assert result["click_count"] == 1052
    assert result["ctr_pct"] == 2.5
    assert result["conversion_count"] == 85
    assert result["cvr_pct"] == 8.1


def test_누락_노출있고_클릭없음():
    """클릭수 라인이 없으면 click=None (노출은 정상)."""
    text = """노출수: 5,000회
주문수(전환율 10%): 20회
"""
    result = parse_ugk_impression_click(text)
    assert result["impression_count"] == 5000
    assert result["click_count"] is None
    assert result["ctr_pct"] is None
    assert result["conversion_count"] == 20
    assert result["cvr_pct"] == 10.0


def test_포맷변이_쉼표없음_공백변이():
    """쉼표 없는 숫자 + 콜론 주변 공백 변이."""
    text = """노출수 :  900 회
클릭수 ( 클릭률 1.5 % ) :  30 회
"""
    result = parse_ugk_impression_click(text)
    assert result["impression_count"] == 900
    assert result["click_count"] == 30
    assert result["ctr_pct"] == 1.5


def test_빈텍스트_전부_None():
    """빈 / 공백만 있는 텍스트 → 전부 None (크래시 없음)."""
    for empty in ("", "   ", "\n\n\t"):
        result = parse_ugk_impression_click(empty)
        assert result["impression_count"] is None
        assert result["click_count"] is None
        assert result["ctr_pct"] is None
        assert result["conversion_count"] is None
        assert result["cvr_pct"] is None


def test_parse_ad_detail_legacy_키_호환():
    """parse_ad_detail 은 레거시 impression/click 키(solution_builder 의존)도 병기."""
    text = """노출수: 18,639회
클릭수(클릭률 3.2%): 595회
주문수(전환율 16%): 94회
"""
    m = parse_ad_detail(text)
    # 새 스키마
    assert m["impression_count"] == 18639
    assert m["click_count"] == 595
    assert m["ctr_pct"] == 3.2
    assert m["conversion_count"] == 94
    assert m["cvr_pct"] == 16.0
    # 레거시 키 (solution_builder._try_build_lever_input 가 stat.ugk_detail 에서 읽는 이름)
    assert m["impression"] == 18639
    assert m["click"] == 595
    assert m["conversion"] == 94


def test_parse_ad_detail_즉시할인페이지_오매칭_없음():
    """즉시할인·배민클럽 페이지는 '노출수/클릭수' 라인이 없다 — 오매칭 방지 회귀 테스트.

    (기존 버그: `r"클릭\\s*([\\d,]+)"` 가 '3.2%' 의 '3' 을 click 으로 캡처했던 문제)
    """
    text = """즉시할인
3월
주문금액
2,626,800원
124건
비용
302,200원
즉시할인 비용 대비 20.4배 매출
을 얻었어요
"""
    m = parse_ad_detail(text)
    assert "impression" not in m
    assert "click" not in m
    assert "impression_count" not in m
    assert "click_count" not in m


def test_ctr_누락시_클릭수만_추출():
    """CTR 괄호 표기 없는 변이 포맷 — 폴백 패턴 확인."""
    text = """노출수: 1,200회
클릭수: 45회
"""
    result = parse_ugk_impression_click(text)
    assert result["impression_count"] == 1200
    assert result["click_count"] == 45
    assert result["ctr_pct"] is None
