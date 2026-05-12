# Lessons

## 셀린의원 홍대점 소식글 맺음말 금지

- 실패 모드: 결론이 "유동적"인 매장에 임의로 📍 위치 안내 + 예약 CTA 맺음말 삽입
- 감지 신호: store-info.md 결론이 "없음" 또는 "유동적"인데 📍, "Book your consultation", "ご予約" 등 맺음말 문구 작성
- 예방 규칙: 결론이 명시되지 않은 매장은 맺음말 없이 본문 내용으로 자연스럽게 마무리. 임의로 위치/예약 CTA 추가 금지.

## 썸네일 설명줄 길이 초과 금지

- 실패 모드: 설명줄에 "~에서 만나는", "~에 맞춰 자연스러운" 등 연결어/부연 삽입 → 2줄로 넘어가 레이아웃 깨짐
- 감지 신호: 한국어 10자 초과, 영어 20자 초과
- 예방 규칙: 설명줄은 핵심 키워드만. 한국어 10자 이내, 영어 20자 이내 (45px 1줄 기준). "~에서", "~에 맞춰", "~으로" 같은 연결어 붙이지 마라.

## 소식글 영어 대쉬(—) 금지

- 실패 모드: 영어 원고 작성 시 em dash 문체를 자연스럽게 사용 → CLAUDE.md 대시 금지 규칙 위반. post-check Step 3에 항목이 없어서 검수에서도 두 번 다 통과됨.
- 감지 신호: 영어 소식글에 — 또는 – 포함된 경우
- 예방 규칙: 영어 작성 시 em dash 사용 금지. 쉼표 또는 마침표로 대체. post-check Step 3에 대시 체크 항목 추가 완료.

## 소식글 수정 시 서론/결론 포맷 누락 금지

- 실패 모드: 이전 소식글 스타일로 수정하면서 영어 서론 포맷 누락
- 감지 신호: 다국어 소식글 수정 시 각 언어 서론/결론 포맷이 그대로 유지되었는지 검토 안 함
- 예방 규칙: 소식글 수정 후 반드시 각 언어별 서론/결론 포맷(store-info.md 기준) 삽입 여부 확인. 본문 내용 수정 시 서론/결론은 절대 건드리지 않음.

## thumbnail-figma: SKILL.md 읽기 전 피그마 작업 금지

- 실패 모드: thumbnail-figma 스킬 SKILL.md를 확인하지 않고 바로 set_text_content 실행 → Step 0(사진 효과 오버레이) 누락
- 감지 신호: 피그마 프레임 작업 시작 직후 scan_text_nodes나 set_text_content를 SKILL.md 확인 없이 바로 호출
- 예방 규칙: thumbnail-figma 작업 시작 전 반드시 SKILL.md 로드 및 확인 후 진행. 특히 이미지 노드 존재 여부 → Step 0 실행 여부를 첫 번째로 체크.

## overlay 투명도 설정 방식 (확정)

- 실패 모드: set_gradient stop alpha를 0.2로 낮추면 그라디언트 자체가 너무 약해짐. 반대로 1.0이면 가장자리 완전 검정.
- 감지 신호: stop alpha와 node opacity를 혼동하거나 둘 중 하나만 설정하는 경우
- 예방 규칙:
  - overlay-dark: fill alpha=1.0(100%) + set_node_properties opacity=0.4(40%)
  - overlay-gradient: stop alpha=1.0(100%) + set_node_properties opacity=0.2(20%)
  - fill-level opacity는 MCP 미지원. 반드시 set_node_properties로 노드 레벨에서 투명도 조절.
