# Create-based Fallback 워크플로

> FAST PATH(Clone-based) 불가할 때만 사용. 일반적으로는 SKILL.md의 FAST PATH 먼저 시도. 마스터 프레임 없거나 스타일 변경이 필요한 커스텀 작업에 적용.

## Step 0. 사진 효과 적용 (프레임 안에 이미지 노드가 있는 경우만)

scan_text_nodes 전에 프레임 자식 노드를 확인해 이미지 노드 유무를 체크한다.

이미지 노드가 있으면 아래 순서로 오버레이 생성:

> MCP 제약: `set_fill_color`/`set_gradient`는 기존 fills 전체 교체. image fill 유지하면서 추가 fill 불가 → 별도 overlay 레이어 방식 사용. 시각적 결과는 fills-on-image 방식과 동일.

### 0-1. 검정 오버레이 사각형 생성

> ⚠️ **Anti-pattern #1 경고**: `create_rectangle`에 `fillColor` 파라미터 전달 금지. 상세: `anti-patterns.md`.

```
create_rectangle:
  parentId: 프레임 ID
  name: overlay-dark
  x: 0, y: 0
  width: 1000, height: 1000
  ← fillColor 파라미터 전달 금지
set_fill_color:
  nodeId: overlay-dark 노드 ID
  r: 0, g: 0, b: 0, a: 1.0
set_node_properties:
  nodeId: overlay-dark 노드 ID
  opacity: 0.4
```

**생성 직후 검증 필수**: `get_node_info`로 `fills[0].color` 값이 `#000000`인지 확인. `#d9d9d9`면 `set_fill_color` 재실행.

### 0-2. 그라디언트 오버레이 사각형 생성

```
create_rectangle:
  parentId: 프레임 ID
  name: overlay-gradient
  x: 0, y: 0
  width: 1000, height: 1000
  ← fillColor 파라미터 전달 금지
set_gradient:
  nodeId: overlay-gradient 노드 ID
  type: GRADIENT_LINEAR
  gradientTransform: [[0, 1, 0], [1, 0, 0]]  ← 위→아래 수직
  stops:  ← stop alpha 1.0 고정. 투명도는 node opacity로 조절.
    - position: 0.1,  color: #000000, alpha: 1.0
    - position: 0.5,  color: #000000, alpha: 0.0
    - position: 0.9,  color: #000000, alpha: 1.0
set_node_properties:
  nodeId: overlay-gradient 노드 ID
  opacity: 0.2
```

### 0-3. z순서 정렬

reorder_node로 아래 순서 보장 (반드시 순차 처리, 동시 실행 금지):

1. 이미지 노드 → index 0 (맨 아래)
2. overlay-dark → index 1
3. overlay-gradient → index 2
4. 텍스트 노드들 → index 3~n (맨 위)

## Step 1. 미수정 프레임 탐색

- `get_document_info`로 전체 프레임 목록 조회
- 각 프레임의 텍스트 노드 스캔 (`scan_text_nodes`)
- 텍스트 내용이 "언어1-1" 또는 "언어1-2"인 노드가 있는 프레임 = 미수정
- 프레임 번호순 정렬 후 순차 탐색, 발견 시 즉시 중단

## Step 2. 언어 수 확인 및 텍스트 적용

대화에서 생성된 썸네일 문구를 파싱:
- 각 언어의 설명줄, 제목줄 추출
- 언어 순서: 한국어 > 영어 > 일본어 > 중국어(간체) > 중국어(번체)

폰트 로드 → 텍스트 교체 → 폰트 재적용 → Drop Shadow:

```
load_font_async: Noto Sans KR, Black
set_text_content: lang1-desc ← 1번째 언어 설명줄
set_text_content: lang1-title ← 1번째 언어 제목줄
set_text_content: lang2-desc ← 2번째 언어 설명줄
set_text_content: lang2-title ← 2번째 언어 제목줄
set_font_name: 각 노드에 Noto Sans KR Black 재적용
set_effects: 각 노드에 DROP_SHADOW (x=0, y=0, blur=20, spread=0, #000000 a=1)
```

3언어: `lang3-desc`, `lang3-title` 동일 처리.
2언어: `lang3-desc`, `lang3-title` 삭제 (`delete_node`).

## Step 3. 중앙 정렬 (실측 기반)

텍스트 교체 후 각 노드의 실제 높이를 `scan_text_nodes`로 재측정.

### 간격 상수
- `inner_gap = 5` (desc–title)
- `outer_gap = 80` (언어 블록 사이)

### 총 높이 계산

```
lang_count = 언어 수 (2 또는 3)
block_height = desc_height + inner_gap + title_height (블록별 실측)
total_height = sum(block_heights) + (lang_count - 1) * outer_gap
start_y = (1000 - total_height) / 2
```

### y 좌표 계산 후 move_node로 재배치

```
lang1-desc:  y = start_y
lang1-title: y = start_y + desc1_height + inner_gap
lang2-desc:  y = lang1_title_y + title1_height + outer_gap
lang2-title: y = lang2_desc_y + desc2_height + inner_gap
lang3-desc:  y = lang2_title_y + title2_height + outer_gap  (3언어만)
lang3-title: y = lang3_desc_y + desc3_height + inner_gap    (3언어만)
```

x 고정: 60

## Step 4. 완료 보고

- 적용된 프레임명, 프레임 ID
- 사진 효과 적용 여부 (이미지 노드 감지 여부)
- 언어별 기입 내용 (설명줄 / 제목줄)
- 2언어인 경우 lang3 노드 삭제 여부

---

## 미수정 프레임 템플릿 생성 (단일 통합 텍스트 → 노드 구조 변환)

기존 단일 텍스트 노드(혼합 사이즈) 프레임을 발견하면, 자동으로 새 구조로 변환:

1. 기존 텍스트 노드 삭제
2. 새 텍스트 노드 6개 생성 (`create_text`):
   - parentId: 해당 프레임 ID
   - name: `lang1-desc`, `lang1-title`, `lang2-desc`, `lang2-title`, `lang3-desc`, `lang3-title`
   - text: `언어1-1`, `언어1-2`, `언어2-1`, `언어2-2`, `언어3-1`, `언어3-2`
   - fontSize: desc=45, title=60
   - fontWeight: 900
   - fontColor: r=1, g=1, b=1, a=1
   - textAlignHorizontal: CENTER
   - textAutoResize: HEIGHT
   - width: 880
   - x: 60
3. `set_font_name`으로 각 노드에 Noto Sans KR Black 적용
4. `set_effects`로 각 노드에 Drop Shadow 적용 (X=0, Y=0, Blur=20, Spread=0, #000000 a=1)
5. Step 3 중앙 정렬 수행
