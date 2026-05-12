# 카톡 알림 수집 PoC

목표: Android에서 사용자가 알림 접근 권한을 켠 뒤 카카오톡 알림만 읽어 SaaS로 보낸다. SaaS는 raw 로그를 보관하고, 액션성 문장만 `퀘스트 제안함`으로 올린다.

## 경계

- 개인 카톡 DB를 직접 뜯지 않는다.
- Root, Xposed, 비공식 앱 내부 Hook은 쓰지 않는다.
- Android `NotificationListenerService` 또는 MessengerBotR처럼 사용자가 권한을 켜는 알림 읽기 경로만 쓴다.
- 자동 전송은 하지 않는다. 현재 단계는 읽기 전용이다.
- 서비스 키는 모바일에 넣지 않는다. 모바일은 ingest token만 들고, Supabase write는 서버 Route Handler가 한다.

## SaaS 수신 엔드포인트

```text
POST /api/integrations/kakao-notifications
Authorization: Bearer $KAKAO_NOTIFICATION_INGEST_TOKEN
Content-Type: application/json
```

로컬 개발에서 `KAKAO_NOTIFICATION_INGEST_TOKEN`이 없으면 `dev-kakao-test-token`만 허용한다. 운영에서는 반드시 긴 랜덤 토큰을 환경변수로 설정한다.

단건 payload:

```json
{
  "deviceId": "sales-phone-1",
  "eventKey": "android-notification-key",
  "packageName": "com.kakao.talk",
  "roomTitle": "강남역 한우다이닝",
  "senderName": "박사장",
  "messageText": "오늘 견적서 다시 보내주세요. 바로 확인하겠습니다.",
  "postedAt": "2026-05-08T12:10:00+09:00"
}
```

배치 payload:

```json
{
  "deviceId": "sales-tablet-1",
  "events": [
    {
      "eventKey": "android-notification-key-1",
      "packageName": "com.kakao.talk",
      "roomTitle": "[SEO] 강남역 한우다이닝",
      "senderName": "박사장",
      "messageText": "오늘 견적서 다시 보내주세요.",
      "postedAt": "2026-05-08T12:10:00+09:00"
    }
  ]
}
```

한 번에 최대 50건까지 받는다. 모바일 쪽 큐가 밀렸을 때는 여러 건을 묶어 보내면 된다.

## DB 흐름

1. API 호출 단위는 `kakao_ingest_batches`에 저장한다.
2. 모든 카톡 알림은 `kakao_notification_events`에 저장한다.
3. `source_hash`로 중복 알림을 막는다. 모바일이 같은 큐를 재전송해도 같은 이벤트는 한 번만 저장된다.
4. `raw_payload`는 저장하되 base64 이미지·토큰·쿠키·큰 객체는 제거/축약한다.
5. `message_text`는 본문 원문, `message_text_hash`는 본문 해시, `message_text_length`는 길이를 보관한다.
6. `kakao_room_mappings.room_title`이 있으면 매장을 자동 연결한다.
7. 수동 매핑이 없으면 표준 방 이름을 파싱한다.
   - `[SEO] 업장명`: 업주가 있는 팀채팅방. `stores.name = 업장명`이면 해당 매장에 자동 연결한다.
   - `[작업] 업장명`: 리뷰어 작업방. `stores.name = 업장명`이면 해당 매장에 자동 연결한다.
8. 요청/확인/컨펌/자료/일정/클레임 같은 액션성 문장이면 `proposed_actions(source='kakao')`로 승격한다.
9. `[작업]` 방은 잡음 방지를 위해 보낸 사람이 민재/재원/업주/원장/대표/사장/담당자/직원/실장/매니저 계열일 때만 제안함으로 올린다.
10. 단, 리뷰어가 보낸 메시지라도 `리뷰 원고 컨펌`, `리뷰 답글 컨펌`, `리뷰 대댓글 확인/검수/승인` 계열 요청은 제안함으로 올린다.
11. 사용자가 대시보드 `퀘스트 제안함`에서 승인하면 `AI.proposed` 퀘스트가 생성된다.

## 저장 안전장치

- Authorization Bearer token이 맞아야만 수신한다.
- 운영 환경에서는 `KAKAO_NOTIFICATION_INGEST_TOKEN`이 없으면 수신하지 않는다.
- `packageName !== com.kakao.talk` 이벤트는 저장하지 않고 무시한다.
- 단건/배치 모두 중복 이벤트는 `duplicate`로 처리한다.
- 배치 전체 결과는 `kakao_ingest_batches`에 남는다.
- 이벤트 처리 상태는 `received`, `ignored`, `proposed`, `failed`로 남긴다.
- `processed_at`, `error_message`, `store_match_method`, `room_kind`를 남겨 나중에 왜 제안이 생성됐는지 추적한다.

기존 단건 API 응답도 유지한다. 배치 응답은 `summary`와 `results[]`를 반환한다.

```json
{
  "ok": true,
  "batchId": "uuid",
  "summary": {
    "received": 10,
    "inserted": 8,
    "duplicate": 2,
    "proposed": 3,
    "ignored": 5,
    "failed": 0
  },
  "results": []
}
```

## 공기계 운영 세팅

현재 운영 테스트 스크립트는 repo 루트의 `messengerbotr-kakao-ingest-v2.txt`를 사용한다.

권장 기기 세팅:

1. Android 공기계에 카카오톡과 MessengerBotR을 설치한다.
2. 카카오톡은 업무 계정으로 로그인하고, 메시지 알림과 메시지 미리보기를 켠다.
3. MessengerBotR 알림 접근 권한을 허용한다.
4. 배터리 최적화/절전 예외에 카카오톡과 MessengerBotR을 추가한다.
5. 화면 잠금 중에도 Wi-Fi가 유지되도록 설정한다.
6. 스크립트의 `ENDPOINT`, `TOKEN`, `DEVICE_ID`를 환경에 맞게 설정한다.

스크립트는 수신 즉시 로컬 `queue-v2.jsonl`에 먼저 저장한 뒤 `events: []` 배치로 SaaS에 전송한다. 전송 실패 시 큐에 남기고 60초마다 재전송한다. 따라서 Wi-Fi가 잠깐 끊겨도, 그 사이 카카오톡 알림이 기기에 도착했다면 재연결 후 서버로 밀어넣을 수 있다.

v2 송신부는 `clientEventId`를 직접 생성한다. 같은 시간에 여러 알림이 겹쳐도 `deviceId + timestamp + sequence + message hash` 조합으로 서버가 서로 다른 이벤트를 구분한다.

## 대화 내보내기 import

실제 운영 시작 전에는 매장별 기존 카톡방에서 대화 내보내기 파일을 받아 `/app/settings`의 `대화 내보내기 import`에 넣는다.

흐름:

1. 매장을 선택한다.
2. 카톡방 이름을 입력한다. 예: `[SEO] 강남역 한우다이닝`
3. TXT 파일을 올리거나 원문을 붙여넣는다.
4. 서버가 메시지 단위로 파싱해 `kakao_conversation_imports`, `kakao_conversation_messages`에 저장한다.
5. 민재·재원·민성 등 내부 발신 메시지는 `store_tone_examples(direction='internal_to_owner')`로 반영한다.
6. 업주/원장/대표/사장 계열 메시지는 `store_tone_examples(direction='owner_to_internal')`로 반영한다.
7. `store_tone_profiles`가 갱신되고 포워딩 어시스턴트가 해당 매장 말투를 우선 사용한다.

현재 파서는 아래 형식을 우선 지원한다.

```text
--------------- 2026년 5월 9일 토요일 ---------------
[반민성] [오후 1:23] 원장님 안녕하세요.
[원장님] [오후 1:25] 네 확인했습니다.
```

```text
2026. 5. 9. 오후 1:23, 반민성 : 원장님 안녕하세요.
```

## 한계

- 알림에 뜬 이후의 메시지만 수집한다. 과거 대화 전체를 읽는 구조가 아니다.
- 카톡방 알림이 꺼져 있거나 미리보기 내용 숨김이면 내용 수집이 안 된다.
- 긴 메시지, 사진, 파일, 이모티콘은 알림 payload 한계에 따라 일부만 들어올 수 있다.
- 방 제목이 바뀌면 `kakao_room_mappings`도 다시 맞춰야 한다.
