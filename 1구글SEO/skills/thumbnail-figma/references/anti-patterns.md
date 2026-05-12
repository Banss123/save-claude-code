# Anti-pattern & 회피법 (누적 테이블)

작업 전 반드시 훑기. 발견된 MCP 버그·툴 행동 이상 누적 기록.

| # | 증상 | 원인 | 회피법 | 발견 |
|---|------|------|--------|------|
| 1 | `create_rectangle`에 `fillColor` 전달했는데 `#d9d9d9` 연회색으로 생성됨 | MCP 서버가 `fillColor` 파라미터 무시 | `create_rectangle`은 색상 없이 호출 → `set_fill_color` 별도 호출 | 2026-04-23 Frame 134 |
| 2 | `clone_node`에 `parentId` 전달했는데 원본 부모에 clone됨 (타겟 프레임에 안 들어감) | MCP 서버가 `parentId`를 "위치 기준"만 쓰고 실제 reparent 안 함 | clone 직후 `insert_child`로 명시적 reparent | 2026-04-22 Frame 133 |
| 3 | 6개 텍스트 노드를 1개 통합 텍스트로 덮어쓰면 multi-size(45/60) 구조 붕괴 | `set_text_content`는 전체 문자열 교체 (스타일 세그먼트 보존 안 됨) | 플레이스홀더 삭제 후 `create_text` ×6으로 재생성 | 2026-04-22 Frame 133 |
| 4 | 배경 이미지가 Group으로 묶인 프레임에서 오버레이 효과가 보이지 않음 | FAST PATH 적용 시 Group을 단순 이미지 노드로 인식해 overlay 삽입을 건너뜀 | 타겟 프레임 children[0]이 GROUP 타입이면 Group 위(index 1~2)에 overlay-dark·overlay-gradient clone 후 `insert_child` | 2026-05-09 나미브로우 Frame 194/195 |

## 추가 규칙

- 새 버그 발견 시 이 테이블에 즉시 추가 (번호 순차)
- 각 이슈마다 `증상 / 원인 / 회피법 / 발견 일자·컨텍스트` 4필드 모두 채울 것
- MCP 서버·Figma 플러그인 업데이트로 해결되면 `해결 완료 (일자)` 추가해 아카이브 표시
