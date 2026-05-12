# 최종 검증 번들 (작업 완료 직후 필수)

> 모든 편집 완료 후 사용자 보고 전 **반드시** 실행. `get_node_info(nodeId=프레임ID, depth=2)` 1회로 구조 스냅샷 확보 후 아래 체크리스트 전수 확인.

## 이미지 레이어

- [ ] type RECTANGLE + `fills`에 IMAGE type 존재
- [ ] 프레임 children[0] 위치 (맨 아래)

## overlay-dark

- [ ] type RECTANGLE
- [ ] `fills[0].color = #000000` (⚠️ `#d9d9d9`면 Anti-pattern #1 재현 → `set_fill_color` 재실행)
- [ ] opacity ≈ 0.4
- [ ] children 중 이미지 바로 위

## overlay-gradient

- [ ] type RECTANGLE
- [ ] `fills[0].type = GRADIENT_LINEAR`
- [ ] `gradientStops` 3개 (검정 a=1 / 검정 a=0 / 검정 a=1)
- [ ] opacity ≈ 0.2

## 텍스트 노드 (6개 @ 3언어 / 4개 @ 2언어)

- [ ] 각 노드 `fontFamily = Noto Sans KR`, `fontStyle = Black`
- [ ] desc 노드 `fontSize = 45`, title 노드 `fontSize = 60`
- [ ] 각 노드 `fills[0].color = #ffffff`
- [ ] 각 노드 `effects`에 DROP_SHADOW 존재 (radius 20, offset 0,0, spread 0, #000000 a=1)
- [ ] `textAlignHorizontal = CENTER`
- [ ] 모든 텍스트 노드가 overlay-gradient보다 위 (z-order)

## 배치

- [ ] `x = 60` (모든 텍스트 공통)
- [ ] `start_y` 계산값: `(1000 - total_height) / 2`
- [ ] `inner_gap = 5`, `outer_gap = 80` 간격 준수
- [ ] lang1-desc.y = start_y 일치

## 실패 대응

문제 발견 시 즉시 해당 단계 재실행 후 다시 검증. **사용자 보고 전 100% 통과 필수.**

## MCP 제약

`opacity`·`effects` 필드가 `get_node_info` 응답에 노출되지 않는 케이스 존재. 이 경우:
- Clone-based로 작업했다면 원본(마스터)에서 보존됐을 것으로 간주
- Create-based라면 set 직후 즉시 시각 확인 필요
- 의심되면 `get_nodes_info` 단건 호출로 재확인
