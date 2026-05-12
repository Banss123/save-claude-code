# 8HyperFrames

영상 콘텐츠 제작 시 반복 그래픽(훅 타이틀, 하단 자막, CTA 카드, 아웃트로)을 코드로 만들고 MP4로 렌더하는 인프라.

## 빠른 시작

```bash
# 환경 점검
cd "C:\Users\반민성\.claude\8HyperFrames"
npx hyperframes doctor

# 첫 렌더 (아웃트로 테스트)
npx hyperframes render templates/outro/composition.html \
  --input templates/outro/input.json \
  --output _renders/outro_test.mp4
```

## 템플릿별 용도

| 템플릿 | 길이 | 비율 | 사용처 | 우선순위 |
|---|---|---|---|---|
| `outro/` | 5초 | 9:16 | 모든 영상 끝부분 | 1 |
| `hook-title/` | 3초 | 9:16 | 숏폼/광고 시작 0~3초 | 2 |
| `cta-card/` | 4초 | 9:16 | 메타 광고 CTA | 3 |
| `captions/` | 가변 | 9:16 | 하단 자막 | 4 (어려움) |

## 영상 프로젝트와 연결

각 영상 작업 폴더(예: `2콘텐츠/2026-05-07_광고비/`)에서:

```bash
cd "C:\Users\반민성\.claude\8HyperFrames"
npx hyperframes render templates/hook-title/composition.html \
  --input "../2콘텐츠/2026-05-07_광고비/05_hyperframes_renders/hook.input.json" \
  --output "../2콘텐츠/2026-05-07_광고비/05_hyperframes_renders/hook.mp4"
```

## Claude Code 사용

이 폴더에 들어가면 Claude가 `CLAUDE.md`를 자동 인식해서 HyperFrames 컨텍스트로 작업한다.

`/hyperframes` 슬래시 명령(skill 설치 후)으로 새 템플릿을 자연어로 요청 가능:

```
Using /hyperframes, create a 5-second Korean outro template for vertical 9:16 shorts.
Use brand colors black/white/red. Include logo, account name, CTA placeholders. Output MP4.
```

## 자세한 컨벤션

- `CLAUDE.md` — 작업 컨텍스트 (필수 일독)
- 원본 가이드: `Desktop/영상_촬영_편집_HyperFrames_가이드.txt`
