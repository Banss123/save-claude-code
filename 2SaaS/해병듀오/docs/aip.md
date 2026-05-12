# AIP 도입 기준선

> 상태: 2026-05-10 기준 서버 전용 context builder와 포워딩/제안 초안 LLM adapter 준비.
> `KIMI_API_KEY`/`OPENAI_API_KEY`가 없거나 실패하면 룰 기반 fallback으로 계속 동작한다.

## 원칙

AIP는 챗봇부터 만들지 않는다. 이 SaaS에서는 `Decision Brief → 추천 액션 → 사용자 승인 → Server Action` 순서가 맞다.

모델은 DB를 직접 수정하지 않는다. 모델은 제안만 만들고, 실행은 기존 typed Server Action이 담당한다.

## 현재 구현

- `src/lib/aip/context.ts`
  - `getAipContextForQuest(questId)`
  - `getAipContextForStore(storeId)`
- `src/lib/aip/openai.ts`
  - AIP LLM provider adapter. Kimi Chat Completions 또는 OpenAI Responses API structured JSON 호출
- `src/lib/aip/forwarding.ts`
  - 포워딩 어시스턴트 초안 생성. LLM 사용 가능 시 AI 초안, 아니면 룰 기반 초안
- `src/lib/aip/proposed-quest.ts`
  - 수동 입력/카톡 알림을 퀘스트 후보로 정리. 자동 실행 없이 `proposed_actions`로만 저장
- `src/lib/actions/aip.ts`
  - 클라이언트에서 직접 LLM key를 보지 않도록 Server Action으로만 호출
- `aip_execution_logs`
  - 초안 생성 감사 로그. 전체 원문 대신 hash + 짧은 preview + provider/model/metadata를 저장
- 원본 연락처는 모델 context에 넣지 않는다.
- 업주 연락처는 `contactAvailable.phone/email` boolean만 노출한다.
- Google Sheet/Drive 같은 private URL은 원문 URL 대신 `hasExternalUrl` 또는 `missingLinks`로만 전달한다.
- 허용 액션은 `completeQuest`, `delegateQuest`, `skipQuest`, `addQuestNote`, `draft_owner_message`로 제한한다.

## 환경 변수

```bash
AIP_PROVIDER=auto
KIMI_API_KEY=
KIMI_MODEL=kimi-k2.5
KIMI_THINKING=disabled
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5-mini
AIP_DISABLE_LLM=false
AIP_ENABLE_KAKAO_PROPOSAL_AI=false
```

- `AIP_PROVIDER=auto`는 Kimi 키가 있으면 Kimi를 우선 사용하고, 없으면 OpenAI, 둘 다 없으면 룰 기반 fallback으로 처리한다.
- `AIP_PROVIDER=kimi`로 고정하면 `KIMI_API_KEY` 또는 `MOONSHOT_API_KEY`가 필요하다.
- 기본 운영 모델은 `kimi-k2.5`다. 포워딩 초안/퀘스트 제안처럼 짧은 내부 문안 생성은 K2.6의 장기 코딩 안정성보다 비용 효율을 우선한다.
- `KIMI_THINKING=disabled`는 짧은 포워딩/분류 초안 비용과 지연을 줄이기 위한 기본값이다.
- `AIP_ENABLE_KAKAO_PROPOSAL_AI`는 카톡 알림 자동 수집 중 LLM 보강을 켜는 스위치다. 비용·지연 방지를 위해 기본은 false.
- 수동 포워딩 어시스턴트와 수동 제안 생성은 사용자가 버튼을 누른 경우라 키가 있으면 LLM을 사용한다.

## 다음 도입 순서

1. 사용자 피드백으로 Decision Brief에 실제로 필요한 필드를 확정한다.
2. `AipContext`에서 불필요한 필드를 줄이고 필요한 필드만 추가한다.
3. ~~서버 Route Handler 또는 Server Action에서 LLM provider adapter를 붙인다.~~ 완료
4. ~~모델 출력은 JSON schema로 검증한다.~~ 완료
5. UI에는 초안/제안만 보여준다.
6. 사용자가 확인한 액션만 Server Action으로 실행한다.
7. 실행 결과와 모델 버전, context version, action proposal을 audit log에 남긴다.

## 실행 로그 정책

- 포워딩 초안과 퀘스트 제안 초안 생성 시 `aip_execution_logs`에 기록한다.
- 입력/출력 전체를 장기 보관하는 용도가 아니다.
- `input_hash`, `output_hash`로 중복/추적을 하고, `input_preview`, `output_preview`는 품질 점검용 짧은 미리보기만 남긴다.
- provider는 `openai`, `kimi`, `fallback`으로 구분한다.

## 금지

- 클라이언트에서 LLM API key 사용 금지
- 클라이언트에 `service_role` 노출 금지
- 모델이 직접 Supabase write 호출 금지
- 사용자 승인 없는 quest 완료/위임/스킵 금지
- 원본 전화번호, 이메일, private sheet URL을 기본 context에 포함 금지
