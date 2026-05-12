# CLAUDE.md — 8HyperFrames (영상 그래픽 인프라)

## 프로젝트 정의

영상 제작용 반복 그래픽(훅 타이틀, 하단 자막, CTA 카드, 아웃트로, 텍스트 비하인드 피플 효과) 자동화 인프라.
HyperFrames(HTML/CSS/JS 기반 모션그래픽 렌더러)를 사용해 코드로 영상 그래픽을 만들고 MP4로 출력한다.

원본 가이드: `C:\Users\반민성\Desktop\영상_촬영_편집_HyperFrames_가이드.txt`

---

## 적용 대상 프로젝트 (공용 인프라)

| 프로젝트 | 활용 |
|---|---|
| 1구글SEO | 메타 광고 소재 (훅/CTA 변형 A/B/C) |
| 2콘텐츠 | 본편/숏폼 그래픽 (모든 콘텐츠 채널 공통) |
| 5어시스턴트 | 영업/제안 영상 |
| 6앰비언트사운드 | YouTube 채널 그래픽 |

---

## 기술 스택

| 영역 | 도구 |
|---|---|
| 런타임 | Node.js 22+ |
| 렌더러 | hyperframes 0.5.3 (npm) |
| 인코더 | FFmpeg 8.1 |
| 헤드리스 브라우저 | Chrome Headless Shell (자동 설치) |
| Claude Code skill | heygen-com/hyperframes (`/hyperframes` 명령) |

미사용 (의도적 제외):
- Docker — `remove-background` 기능 전용. 도입은 4순위 작업 시점에 재검토
- Remotion — React 부담 큼. 데이터 기반 대량 렌더링 필요해질 때 검토

---

## 디렉토리 구조

```
8HyperFrames/
├── CLAUDE.md                   # 이 파일 (Claude가 자동 로드)
├── README.md                   # 사용법 빠른 참조
├── package.json                # hyperframes 의존성
├── skills-lock.json            # npx skills CLI 버전 락
├── skills/                     # hyperframes 13개 skill (gsap, tailwind, registry 등)
├── .claude/
│   ├── commands/               # 전용 슬래시 명령 (예: /outro-render)
│   └── skills/ → ../skills/    # junction (Claude Code 인식용)
├── templates/                  # 마스터 템플릿 (재사용, 코드 자산)
│   ├── outro/                  # 5초 아웃트로 (1순위)
│   │   ├── composition.html
│   │   ├── input.json          # 기본값 + 예시
│   │   └── out/                # 마스터 템플릿 자체 테스트 렌더
│   ├── hook-title/             # 3초 훅 타이틀 (2순위)
│   ├── cta-card/               # CTA 카드 3종 (3순위)
│   └── captions/               # 하단 자막 (4순위, 가장 어려움)
└── _renders/                   # 일회성 테스트 렌더 (영상 프로젝트와 무관)
```

skill 위치 메모: 실물은 `skills/`에, Claude Code 인식용 junction은 `.claude/skills/`. 향후 `npx skills add`가 `.agents/skills/`에 새로 만들면 같은 방식으로 합치기.

---

## 영상 프로젝트와 연결 방식

각 영상 작업 폴더(예: `2콘텐츠/2026-05-07_광고비/`)에서는:
- `05_hyperframes_renders/` 안에 영상별 `input.json`만 만든다
- 8HyperFrames/templates의 마스터 HTML/CSS/JS는 수정하지 않는다
- 렌더 결과 mp4만 영상 폴더에 저장 → Premiere에서 import

**핵심 분리**:
- 마스터 템플릿(코드) = 8HyperFrames/templates/
- 영상별 인스턴스(input.json + 결과 mp4) = 영상 작업 폴더

---

## 표준 렌더 명령

```bash
# 단일 렌더 (8HyperFrames 디렉토리에서)
npx hyperframes render templates/outro/composition.html \
  --input templates/outro/input.json \
  --output _renders/outro_test.mp4

# 영상 프로젝트용 (input은 영상 폴더, 결과도 영상 폴더)
npx hyperframes render templates/hook-title/composition.html \
  --input ../2콘텐츠/2026-05-07_광고비/05_hyperframes_renders/hook.input.json \
  --output ../2콘텐츠/2026-05-07_광고비/05_hyperframes_renders/hook.mp4

# 메타 광고 A/B/C 변형 (input.json만 다르게)
for v in problem contrarian result; do
  npx hyperframes render templates/hook-title/composition.html \
    --input variants/hook_${v}.json \
    --output _renders/hook_${v}.mp4
done
```

옵션이 헷갈릴 땐:
```bash
npx hyperframes --help
npx hyperframes render --help
```

---

## input.json 컨벤션

모든 템플릿은 같은 패턴:

```json
{
  "title": "광고비를 더 쓰기 전에",
  "highlight": "카피부터",
  "subtitle": "전환율이 막힌 진짜 이유",
  "brandColor": "#ff3b30",
  "duration": 3,
  "format": "9:16"
}
```

영상별 차이는 input.json에서만 표현. composition.html은 절대 영상별로 수정하지 않는다.

---

## 작업 우선순위 (가이드 §10)

1. **아웃트로** — 가장 단순, 환경 검증용
2. **훅 타이틀** — 숏폼 성과에 직결, 메타 광고 변형 핵심
3. **CTA 카드** — 메타 광고 A/B 테스트
4. **하단 자막** — 가장 어려움. 10초 테스트부터

위 순서를 건너뛰지 않는다. 자막부터 시도하면 한국어 줄바꿈/강조어/타이밍에서 막힌다.

---

## 핵심 원칙

- **Premiere가 정본 편집기, HyperFrames는 그래픽 렌더러**. 영상 자체를 HyperFrames로 만들지 않는다
- **새 효과는 10초짜리 테스트 영상으로 먼저 검증**. 통과 후 본편 적용
- **마스터 템플릿은 브랜드 룩 갱신 시에만 수정**. 영상별 차이는 input.json
- **자막 자동화는 첫 작업으로 하지 않는다**. 어렵고 가독성 변수 많음
- **메타 광고 변형은 같은 컷 + 다른 input.json**. 컷부터 다르게 하지 않는다

---

## 참고

- 원본 가이드: `Desktop/영상_촬영_편집_HyperFrames_가이드.txt`
- HyperFrames Docs: https://hyperframes.heygen.com
- HyperFrames GitHub: https://github.com/heygen-com/hyperframes (15.6k stars)
- Remove Background: https://hyperframes.heygen.com/guides/remove-background (Docker 필요, 보류)
