# CLAUDE.md — 밸류체인 자동화 프로젝트

## 프로젝트 개요

- **사업**: 요식업 배달 컨설팅 업체의 온보딩 업무 자동화
- **대상 플랫폼**: 배민, 쿠팡이츠, 요기요, 땡겨요 (배달 4사)
- **핵심 목표**: 솔루션 담당자 1명의 수동 업무를 Claude API 기반 파이프라인으로 자동화
- **최우선 원칙**: 정확성 — 실수 없는 산출물 + 자동 검수

---

## 기술 스택

| 영역 | 도구 | 비고 |
|------|------|------|
| 언어 | Python 3.11+ | 전체 파이프라인 |
| 인터페이스 | **Slack Bot (Bolt for Python)** | 비개발자 실행 — 슬래시 커맨드로 파이프라인 트리거 |
| 브라우저 자동화 | Playwright (Python) | 배민 사장님사이트 스크래핑 |
| 데이터 모델 | Pydantic v2 | 타입 안전 JSON 스키마 |
| AI | Claude API (Structured Output) | 판단 전용, 포맷팅 금지 |
| XLSX 생성 | openpyxl | 결정적 엑셀 생성 |
| DOCX 생성 | python-docx | 결정적 워드 생성 |
| 비용 최적화 | Prompt Caching + Batch API | 캐싱 90% 절감, 배치 50% 할인 |
| 미래 전환 | Anthropic Managed Agents | Beta 졸업 후 오케스트레이터 전환 검토 |

### 아키텍처 결정 근거

Python 선택 이유 (2026-04-09 비교 분석 완료):
- **문서 생성 정밀도**: openpyxl/python-docx가 한글 폰트 + 셀 단위 스타일링에서 최강
- **기존 자산 호환**: 배민 로그인 Python 스크립트 재활용
- **Claude SDK 통합**: Pydantic ↔ Structured Output 직접 연동
- **TS/Go는 탈락**: 문서 라이브러리 성숙도 부족, 기존 스크립트 재작성 필요
- **노코드(n8n, Make) 탈락**: XLSX/DOCX 정밀 포맷팅 불가, Structured Output 직접 지원 제한

슬랙 봇 선택 이유:
- 이미 슬랙을 업무 도구로 사용 중 — 학습 비용 제로
- 별도 웹앱(Streamlit 등) 대비 배포/유지 간단
- 파일 첨부 + 스레드 알림 = 자연스러운 업무 흐름

### 컨벤션

- 패키지 관리: `pyproject.toml` + `uv` (pip 대신)
- 타입 힌트 필수 (mypy strict 호환)
- 테스트: pytest + fixtures
- 린트: ruff
- 디렉토리 구조는 아래 아키텍처 섹션 참조

---

## 파이프라인 아키텍처 (6단계)

```
[슬랙] /온보딩 홍콩반점
    │
    ▼
⓪ 슬랙 봇 수신 ── Bolt for Python → 요청 파싱 + 진행 상태 스레드 생성
    │
    ▼
① 데이터 수집 ──── Playwright → 배민 사장님사이트 자동 스크래핑
    │                → 출력: RawMenuData (Pydantic 모델)
    │                → 슬랙: "데이터 수집 완료 (메뉴 32건, 옵션 48건)"
    ▼
② AI 분석 ──────── Claude API + Structured Output
    │                → 입력: RawMenuData + 솔루션 규칙
    │                → 출력: SolutionJSON (Pydantic 모델)
    │                → AI는 "판단"만, 포맷팅 절대 안 함
    │                → 슬랙: "AI 분석 완료"
    ▼
③ JSON 검증 ────── 스키마 검증 + 비즈니스 룰 검증
    │                → 이상 발견 시 즉시 플래그 + 슬랙 경고
    ▼
④ 문서 생성 ────── 검증된 JSON → XLSX/DOCX
    │                → openpyxl / python-docx
    │                → 디자인 규칙은 코드로 고정 (아래 참조)
    ▼
⑤ 문서 검수 ────── 입력 JSON ↔ 출력 문서 교차 검증
    │                → 체크리스트 자동 적용
    ▼
⑥ 슬랙 배달 ────── 파일 첨부 + 검수 리포트 메시지
    │                → 정상: "✅ 검수 통과" + XLSX/DOCX 첨부
    │                → 이상: "⚠️ 검수 이상 N건" + 상세 리포트
    ▼
[완료]

배치 모드: /온보딩-배치 업장1, 업장2, 업장3
    → Batch API 동시 처리 (50% 할인)
    → 완료 시 슬랙 스레드에 일괄 보고
```

### 핵심 원칙: AI와 코드의 역할 분리

- **Claude API**: 솔루션 판단(메뉴 가안, 광고 전략 등)만 담당 → Structured Output으로 JSON 반환
- **Python 코드**: JSON → 문서 변환은 결정적 코드로 처리 → 동일 입력 = 동일 출력 보장
- 이 분리를 절대 섞지 마라. Claude에게 포맷팅/스타일링을 시키지 마라.

---

## 데이터 스키마 규칙

### 네이밍

- Pydantic 모델: PascalCase (`MenuGroup`, `SolutionPlan`)
- 필드: snake_case (`menu_name`, `option_price`)
- JSON 키: snake_case (Pydantic alias 불필요)

### 필수 스키마 (구축 시 정의)

| 모델명 | 용도 | 위치 |
|--------|------|------|
| `RawMenuData` | 스크래핑 원본 데이터 | `schemas/raw.py` |
| `MenuSheet` | 현안/가안 메뉴판 구조 | `schemas/menu.py` |
| `SolutionPlan` | 솔루션 계획서 구조 | `schemas/solution.py` |
| `ValidationReport` | 검수 결과 리포트 | `schemas/validation.py` |

### 검증 원칙

- 모든 스키마에 Pydantic `field_validator` 사용
- 가격 필드: `int` (문자열 금지, 원 단위)
- 메뉴명/옵션명: `str`, 빈 문자열 금지
- 열거형 값(배달/포장, 필수/선택 등): `Literal` 또는 `Enum` 사용

---

## 문서 디자인 규칙 (코드 고정값)

### 메뉴판 가안 XLSX

```python
XLSX_CONFIG = {
    "start_col": "C",           # A-B는 여백
    "columns": [                 # C열부터 순서대로
        "메뉴그룹명",
        "메뉴명(가격/배달)",
        "구성(설명)",
        "옵션명",
        "옵션그룹명(조건)",
        "옵션목록(속성/추가격)",
        "가격가",
    ],
    "sheets": ["현안", "가안"],
    "bold_changed_cells": True,  # 가안에서 변경된 셀만 볼드
    "font": "맑은 고딕",
    "font_size": 10,
}
```

### 솔루션 계획서 DOCX

```python
DOCX_CONFIG = {
    "page": {"size": "A4", "margin_cm": 2.0},
    "fonts": {
        "body": ("Malgun Gothic", 10),
        "title": ("Malgun Gothic", 26, "bold"),
        "section": ("Malgun Gothic", 13, "bold"),
    },
    "colors": {
        "section_divider": "#F2F2F2",
        "comparison_dark": "#1E1E1E",
        "key_message": "#2B7A4B",
    },
    "page1": {
        "kpi_boxes_min": 4,      # KPI 최소 4건
        "comparison_table": True, # "지금" vs "앞으로"
        "key_message_box": True,
    },
    "sections": [
        "배민 기본 세팅",
        "광고 전략: 배민 (CPC)",
        "광고 전략: 쿠팡이츠 (CMG)",
        "대표메뉴 시장",
        "수수료 구조",
        "운영 원칙",
    ],
}
```

---

## 검수 체크리스트 (자동화 대상)

### 메뉴판 가안 XLSX

- [ ] 현안 메뉴 수 == 원본 데이터 메뉴 수
- [ ] 가안 메뉴 수 == 현안 메뉴 수 (추가/삭제 없는 한)
- [ ] 옵션그룹 번호가 올바른 메뉴에 할당
- [ ] 변경된 셀만 볼드, 미변경 셀은 현안과 동일
- [ ] 가격 필드가 숫자 타입 (문자열 아님)
- [ ] 사이즈별 분리 메뉴 올바르게 분리

### 솔루션 계획서 DOCX

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

---

## Claude API 비용 최적화 규칙

### Prompt Caching 적용 대상

- 시스템 프롬프트 (솔루션 규칙, 메뉴 분석 규칙)
- 공통 예시 데이터
- `cache_control: {"type": "ephemeral"}` 블록으로 감싸기
- 캐시 히트 시 입력 토큰 비용 90% 절감

### Batch API 적용 기준

- 동시 처리 업장 2건 이상 → Batch API 사용
- 50% 비용 할인, 24시간 내 완료
- 급하지 않은 대량 처리에 적합

### 모델 선택

- 솔루션 판단 (메뉴 가안, 광고 전략): `claude-opus-4-6` + adaptive thinking
- 단순 데이터 정리/변환: `claude-haiku-4-5-20251001`
- 비용 민감 시: Haiku로 시작, 품질 부족 시 상위 모델로 전환

---

## 스킬 구성

### 기존 스킬 활용

| 스킬 | 용도 |
|------|------|
| `claude-api` | Claude API 파이프라인 코드 작성 |
| `xlsx` | XLSX 생성 코드 작성 |
| `docx` | DOCX 생성 코드 작성 |
| `pdf` | 기존 매뉴얼 PDF 분석 |
| `webapp-testing` | Playwright 브라우저 자동화 |
| `skill-creator` | 커스텀 스킬 생성 |

### 커스텀 스킬 (구축 예정)

| 스킬 | 역할 |
|------|------|
| `baemin-scraper` | 배민 사장님사이트 데이터 자동 수집 |
| `menu-builder` | 메뉴 데이터 → 현안/가안 비교 JSON |
| `solution-planner` | 솔루션방향 → 계획서 JSON |
| `quality-checker` | 자동 검수 (스키마 + 비즈니스 룰 + 교차 검증) |
| `doc-generator` | JSON → XLSX/DOCX 결정적 변환 |

---

## 프로젝트 디렉토리 구조 (목표)

```
밸류체인/
├── CLAUDE.md                  ← 이 파일
├── 밸류체인_자동화_프로젝트.md    ← 기획 문서
├── pyproject.toml
├── src/
│   ├── bot/                   ← ⓪ 슬랙 봇 인터페이스
│   │   ├── app.py             ← Bolt 앱 초기화 + 이벤트 라우팅
│   │   ├── commands.py        ← /온보딩, /온보딩-배치 슬래시 커맨드
│   │   └── messages.py        ← 슬랙 메시지 포맷 (진행 상태, 리포트)
│   ├── schemas/               ← Pydantic 모델 (데이터 스키마)
│   │   ├── raw.py
│   │   ├── menu.py
│   │   ├── solution.py
│   │   └── validation.py
│   ├── scraper/               ← Phase 1: 배민 스크래핑
│   │   ├── browser.py
│   │   └── parser.py
│   ├── analyzer/              ← Phase 2: Claude API 분석
│   │   ├── menu_analyzer.py
│   │   └── solution_analyzer.py
│   ├── generator/             ← Phase 4: 문서 생성
│   │   ├── xlsx_builder.py
│   │   └── docx_builder.py
│   ├── validator/             ← Phase 3+5: 검증/검수
│   │   ├── schema_check.py
│   │   ├── business_rules.py
│   │   └── cross_check.py
│   └── pipeline.py            ← 전체 파이프라인 오케스트레이터
├── prompts/                   ← Claude API 시스템 프롬프트
│   ├── menu_analysis.md
│   └── solution_planning.md
├── templates/                 ← 문서 템플릿/참조
├── tests/
│   ├── test_schemas.py
│   ├── test_scraper.py
│   ├── test_generator.py
│   ├── test_validator.py
│   └── test_bot.py
├── data/                      ← 테스트/샘플 데이터
│   └── samples/
└── output/                    ← 생성된 문서 출력
```

---

## 슬랙 봇 설계

### 슬래시 커맨드

| 커맨드 | 기능 | 예시 |
|--------|------|------|
| `/온보딩 [업장명]` | 단건 파이프라인 실행 | `/온보딩 홍콩반점` |
| `/온보딩-배치 [업장1, 업장2, ...]` | 다건 Batch API 처리 | `/온보딩-배치 홍콩반점, 맛나분식` |
| `/온보딩-상태` | 현재 진행 중인 작업 확인 | `/온보딩-상태` |

### 슬랙 메시지 흐름

```
사용자: /온보딩 홍콩반점
봇:     🔄 홍콩반점 온보딩 시작합니다
  ├── 📊 데이터 수집 완료 (메뉴 32건, 옵션 48건)
  ├── 🤖 AI 분석 완료
  ├── ✅ JSON 검증 통과
  ├── 📄 문서 생성 완료
  ├── 🔍 검수 결과: 통과 (이상 0건)
  └── 📎 [홍콩반점_메뉴판_가안.xlsx] [홍콩반점_솔루션_계획서.docx]
```

### 에러 처리

- 스크래핑 실패: "❌ 배민 사장님사이트 접속 실패 — [상세]"
- AI 분석 실패: "❌ Claude API 오류 — 재시도 중 (1/3)"
- 검수 이상: "⚠️ 검수 이상 2건 발견" + 상세 항목 나열 + 문서는 첨부하되 "검토 필요" 표시

### 필요 설정

- Slack App: Bot Token Scopes — `commands`, `chat:write`, `files:write`
- 환경 변수: `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `ANTHROPIC_API_KEY`

---

## 미래 전환 경로: Managed Agents

Anthropic Managed Agents가 GA 되면 (현재 Public Beta 2026-04-08):
- 슬랙 봇 → Managed Agent 트리거로 전환 가능
- 파이프라인 오케스트레이션을 Agent에 위임
- 현재 Python 코어 모듈은 Agent의 도구(tool)로 등록
- 전환 시점: GA + 3개월 안정화 후 평가

---

## 미결 사항

- [ ] 기존 Python 로그인 스크립트 위치/파일 확인
- [ ] 과거 완성 사례 4-5건 수집 (txt + XLSX/DOCX)
- [ ] 솔루션 판단 규칙 문서화 (담당자 논의 필요)
- [ ] 배민 외 플랫폼(쿠팡이츠, 요기요, 땡겨요) 적용 범위 결정
- [ ] 슬랙 워크스페이스 App 생성 + Bot Token 발급

---

## 참고 자료

- 기획 문서: `밸류체인_자동화_프로젝트.md`
- 사용자 가이드: `README.md`
- 메뉴판 가안 매뉴얼 PDF: (담당자 로컬 경로 별도 보관)
- 솔루션 계획서 매뉴얼 PDF: (담당자 로컬 경로 별도 보관)
