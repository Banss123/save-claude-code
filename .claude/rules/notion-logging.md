# 노션 로그 저장 상세 규칙

> CLAUDE.md 섹션 0의 상세 포맷·옵션·조회 방법

## 저장 포맷 (2026-04-23 업데이트 — 시간 포함)

- **툴**: `mcp__notion__API-post-page` (개별 통합 "Claude Code", 토큰 방식 — 세션마다 재인증 불필요)
- **parent**: `{"type": "database_id", "database_id": "4c86dd0a-4d34-41b6-a19f-c6b5c037258f"}` (대화 라이브러리 DB)
- **properties** (표준 Notion API 형식):

| 필드 | 타입 | 포맷 |
|---|---|---|
| 제목 | title | `{"title": [{"text": {"content": "앞 30자"}}]}` |
| 일시 | date | `{"date": {"start": "2026-04-23T17:03:26+09:00"}}` — ISO 8601 + KST(+09:00), **날짜+시간 필수** |
| 원문 | rich_text | `{"rich_text": [{"text": {"content": "메시지 전문"}}]}` |
| 프로젝트 | multi_select | `{"multi_select": [{"name": "2콘텐츠"}, {"name": "기타"}]}` |
| 타입 | select | `{"select": {"name": "지시"}}` |
| 소스 | select | `{"select": {"name": "PC"}}` |
| 태그 | multi_select | 등록된 옵션만 허용 (자동 추가 불가, 비어있으면 필드 생략) |

**현재 시간 구하기**: bash `date +"%Y-%m-%dT%H:%M:%S%:z"` 실행 (출력 예: `2026-04-23T17:03:26+09:00`). 저장 직전에 매번 새로 구해서 `일시` 필드에 삽입.

## 옵션 값

- **프로젝트**: 1구글SEO / 2콘텐츠 / 3세션공부 / 4아카이브 / 5어시스턴트 / 6앰비언트사운드 / CLAUDE.md / 기타
- **타입**: 지시 / 질문 / 피드백 / 결정 / 아이디어 / 오류 / 기타
- **소스**: PC / 모바일 / 기타

## 과거 조회

`mcp__notion__API-query-data-source` 사용 (프로젝트·타입·기간 필터).

- `data_source_id`는 `database_id`와 다름 — 필요 시 `API-retrieve-a-database`로 먼저 확인
- 결과 없으면 "해당 기록 없음"
- 2026-04-19 이전은 날짜 페이지 아카이브

## 통합 접근 범위

`mcp__notion__` ("Claude Code" 통합)은 **공유된 페이지/DB만 접근 가능**.

- 다른 페이지 읽으려면: 해당 페이지 우측 상단 `...` → `연결 추가` → `Claude Code` 선택
- 최상위 페이지에 공유하면 하위 전체 상속됨
