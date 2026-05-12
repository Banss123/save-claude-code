---
name: thumbnail-figma
description: 생성된 썸네일 문구를 Figma 프레임에 자동 적용. thumbnail-copy 실행 후 사용.
allowed-tools: [Read, mcp__ClaudeTalkToFigma__join_channel, mcp__ClaudeTalkToFigma__scan_text_nodes, mcp__ClaudeTalkToFigma__get_node_info, mcp__ClaudeTalkToFigma__set_text_content, mcp__ClaudeTalkToFigma__set_font_name, mcp__ClaudeTalkToFigma__load_font_async, mcp__ClaudeTalkToFigma__move_node, mcp__ClaudeTalkToFigma__delete_node, mcp__ClaudeTalkToFigma__create_text, mcp__ClaudeTalkToFigma__get_document_info, mcp__ClaudeTalkToFigma__set_effects, mcp__ClaudeTalkToFigma__create_rectangle, mcp__ClaudeTalkToFigma__set_fill_color, mcp__ClaudeTalkToFigma__set_gradient, mcp__ClaudeTalkToFigma__reorder_node, mcp__ClaudeTalkToFigma__get_nodes_info, mcp__ClaudeTalkToFigma__set_node_properties, mcp__ClaudeTalkToFigma__clone_node, mcp__ClaudeTalkToFigma__insert_child, mcp__ClaudeTalkToFigma__export_node_as_image]
---

# 썸네일 문구 Figma 적용

## 🚫 MANDATORY PRE-EXECUTION GATE

Figma MCP 도구를 단 1회라도 호출하기 전에 반드시 확인:

1. ✅ 본 SKILL.md 전체 읽었는가?
2. ✅ Figma 채널 `join_channel` 완료했는가?
3. ✅ thumbnail-copy 썸네일 문구가 대화 컨텍스트에 존재하는가?
4. ✅ `references/anti-patterns.md` 훑고 누적 버그 회피법 인지했는가?

**위반 시 즉시 중단 후 재시작.** skillless 호출은 아래 실패를 재현:
- 1개 통합 텍스트로 덮어씌워 multi-size 구조 붕괴
- overlay 레이어 누락 → 가독성 붕괴
- Drop Shadow 누락 → 흰 텍스트 안 보임
- 실측 기반 중앙 정렬 누락 → 간격 어긋남

실패 사례: 2026-04-22 벨라르시 Frame 133 (게이트 미준수 → 재작업).

---

## references/ 인덱스

작업 전 필수:
- `references/anti-patterns.md` — MCP 버그·회피법 누적 테이블 (작업 전 훑기)
- `references/master-frames.md` — FAST PATH 마스터 프레임 Node ID·좌표

작업 완료 후 필수:
- `references/verification.md` — 최종 검증 체크리스트

Fallback 진입 시만:
- `references/create-fallback.md` — Create-based 상세 실행 절차

---

## 전제 조건

- thumbnail-copy 스킬로 썸네일 문구 이미 생성됨
- Figma 채널에 연결됨 (`join_channel` 완료)
- 사용자가 타겟 프레임에 사진 배치 완료

## 권장 작업 순서

1. 사용자가 사진을 프레임에 배치
2. 소식글 + 썸네일 문구 생성 (Claude)
3. 사진 효과 적용 + 썸네일 문구 기입 + 중앙 정렬 (Claude, FAST PATH)

z순서: 사진 → 검정 오버레이 → 그라디언트 오버레이 → 텍스트

## 프레임 템플릿 구조

- 1000x1000 프레임
- 텍스트 노드 6개 (3언어) 또는 4개 (2언어), 각각 별도 노드
- 노드 이름: `lang1-desc`, `lang1-title`, `lang2-desc`, `lang2-title`, `lang3-desc`, `lang3-title`
- desc: Noto Sans KR Black, 45px, 중앙 정렬, 흰색, width 880, Drop Shadow
- title: Noto Sans KR Black, 60px, 중앙 정렬, 흰색, width 880, Drop Shadow
- Drop Shadow 공통: X=0, Y=0, Blur=20, Spread=0, Color=#000000 100%
- x 고정: 60, textAutoResize: HEIGHT

## 미수정 프레임 판별

텍스트 내용이 "언어1-1" 또는 "언어1-2"인 단일 노드가 있는 프레임 = 미수정.

---

## ⚡ FAST PATH (권장, Clone-based)

**언제**: 파일에 검증된 완성 프레임(마스터)이 존재할 때. 대부분 반복 작업에 해당.

**장점**: create-based 대비 ~60% 호출 감소. overlay fill/opacity/Drop Shadow 자동 보존 → Anti-pattern #1 우회.

**실행 순서**:

1. **언어 수 확인**: 타겟 매장 작업 언어 수 파악 → 2언어면 Frame 133, 3언어면 Frame 134 마스터 선택 (ID·좌표: `references/master-frames.md`)
2. **타겟 프레임 플레이스홀더 삭제** (`delete_node`로 "언어1-1..." 단일 텍스트 제거)
3. **배경 구조 확인**: `get_node_info(depth=1)`으로 children[0] 타입 확인
   - RECTANGLE/IMAGE → 일반 구조: overlay를 index 1~2에 삽입
   - GROUP → Group 구조: **동일하게** overlay를 Group 위(index 1~2)에 삽입. Group 안에 넣지 않음. (Anti-pattern #4)
4. **마스터 노드들 clone**: `clone_node`로 overlay 2개 + 텍스트 4~6개 (parentId=타겟 프레임 ID, 좌표는 마스터 테이블 참조)
5. **`insert_child`로 reparent 보장**: Anti-pattern #2 회피 필수. overlay-dark → index 1, overlay-gradient → index 2, 텍스트 노드 → 그 이후
6. **텍스트 내용 교체**: `set_text_content`로 언어별 desc/title (2언어 4건, 3언어 6건)
7. **`references/verification.md` 전수 검증**

**예상 호출 수**: 2언어 ~19회 / 3언어 ~25회. 대부분 parallel 가능.

**Fallback 전환 조건**: 마스터 프레임 없거나 스타일 변경 필요한 커스텀 작업 → `references/create-fallback.md` 참조.

---

## 최종 검증 번들

모든 편집 완료 후 **사용자 보고 전** 반드시 `references/verification.md` 체크리스트 전수 확인.

---

## 주의사항

- 한 번에 하나의 프레임만 처리
- 폰트 로드(`load_font_async`)는 텍스트 교체 전 필수
- `set_text_content` 후 폰트가 리셋될 수 있으므로 `set_font_name` 재적용
- `create_text`는 기본 폰트(Inter)로 생성되므로 `set_font_name` 후속 실행 필수
- 이미지 노드 감지: type RECTANGLE + fills에 IMAGE 타입 기준
- 오버레이(`overlay-dark`, `overlay-gradient`)가 이미 존재하면 재생성하지 않고 업데이트
