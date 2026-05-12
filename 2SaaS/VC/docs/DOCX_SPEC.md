# 솔루션 계획서 DOCX 생성 규칙 (v1.0)

> 작성일: 2026-04-10
> 근거: 레퍼런스 6건 구조 분석
> 기준 파일: 더피플버거 (2026-03-27, 최신)

---

## 페이지 설정

```python
PAGE_CONFIG = {
    "size": "A4",
    "margin_cm": 2.0,  # 상하좌우 동일
}
```

---

## 폰트

```python
FONT_CONFIG = {
    "family": "Pretendard Variable",  # 최신 기준
    "fallback": "Malgun Gothic",      # Pretendard 없을 시
    "title": {"size_pt": 26, "bold": True, "color": "#1E3A32"},
    "subtitle": {"size_pt": 22, "bold": True, "color": "#1E3A32"},
    "section_header": {"size_pt": 13, "bold": True, "color": "#FFFFFF"},
    "body": {"size_pt": 10, "bold": False, "color": "#4A4A4A"},
    "emphasis": {"size_pt": 10, "bold": True, "color": "#2B7A4B"},
    "warning": {"size_pt": 10, "bold": True, "color": "#C0392B"},
}
```

---

## 색상 팔레트

```python
COLOR_PALETTE = {
    "primary_dark": "#1E3A32",       # 제목, 진녹색
    "primary_accent": "#2B7A4B",     # 핵심 강조 (6건 공통)
    "kpi_background": "#D4E8DD",     # KPI 박스 연한 초록
    "section_header_bg": "#1E3A32",  # 섹션 제목 배경
    "table_header_bg": "#1E3A32",    # 비교표 헤더
    "body_gray": "#4A4A4A",
    "warning_red": "#C0392B",
    "cell_alt_bg": "#F2F2F2",        # 테이블 교대 배경
    "white": "#FFFFFF",
}
```

---

## 문서 구조

### 표지 (별도 페이지)

```python
COVER_PAGE = {
    "title": "솔루션 계획서",
    "title_size_pt": 26,
    "meta_format": "{업장명} | 배달앱 매출 최적화 컨설팅",
    "date_format": "YY.MM.DD.요일 기준",
    "alignment": "center",
}
```

### 1페이지: 요약

```python
SUMMARY_PAGE = {
    "kpi_boxes": {
        "count": 4,                   # 6건 모두 4개 고정
        "layout": "horizontal_row",   # 가로 1행 4열
        "bg_color": "#D4E8DD",
        # 내용은 AI가 판단 (CPC단가/광고예산/CMG비율/최소주문금액 등)
    },
    "comparison_table": {
        "title": "그래서, 배달 앱 이렇게 바뀝니다",
        "columns": ["구분", "지금", "앞으로"],  # 3열
        "rows": ["메뉴판", "광고", "운영"],      # 3행 고정
        "header_bg": "#1E3A32",
        "header_text_color": "#FFFFFF",
    },
    "key_message": {
        "enabled": True,
        "color": "#2B7A4B",
        # 내용은 AI가 판단
    },
}
```

### 섹션 구조

```python
SECTION_CONFIG = {
    "style": "numbered_header_box",    # ①②③... + 진녹배경 박스
    "header_bg": "#1E3A32",
    "header_text": "#FFFFFF",
    "numbering": "circled",            # ① ② ③ ④ ⑤ ⑥ ⑦ ⑧

    # 기본 섹션 (입력에 따라 유동적, 최대 8개)
    "default_order": [
        "배민 기본 세팅",
        "광고 전략: 배민 (CPC)",
        "광고 전략: 쿠팡이츠 (CMG)",
        "대표메뉴 시장",           # 선택
        "기타 플랫폼",             # 선택
        "수수료 구조",
        "한그루 입점 구성",        # 선택
        "운영 원칙",
    ],

    "item_format": "numbered_bullet",  # 1. 항목명 + 들여쓰기 설명
    "arrow_symbol": "→",              # 현재→개선 표기
}
```

### 수수료 테이블

```python
FEE_TABLE = {
    "columns": 2,
    "rows": 2,
    "header_bg": "#1E3A32",
    "highlight_row": "목표 매출 미달성 시 수수료 미발생",  # 볼드 강조
}
```

---

## 줄간격/여백

```python
PARAGRAPH_CONFIG = {
    "line_spacing": "auto",    # ~276 twip (11.5pt)
    "space_after_pt": 6,
}
```

---

## 검수 체크리스트

- [ ] 1페이지 KPI 4건 이상 표시
- [ ] 비교표 "지금/앞으로" 내용이 원본과 일치
- [ ] 핵심 메시지가 박스 안에 존재
- [ ] 섹션 구분자 전체 포함
- [ ] 항목 번호 연속성
- [ ] 수수료 구조 테이블 정확성
- [ ] "목표 매출 미달성 시 수수료 미발생" 강조
- [ ] 운영 원칙 경고 문구 볼드
- [ ] 폰트 통일
- [ ] 원본에 없는 내용 임의 추가 여부
