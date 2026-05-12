# 카톡 데이터 보관 정책

목표: 카톡 원문은 안전하게 남기되, 운영 화면과 live table이 무거워지지 않게 한다.

## 원칙

- `kakao_notification_events`는 최근 원문 조회용 live table이다.
- 매장 상세와 포워딩 어시스턴트는 항상 최근 N건만 조회한다.
- 오래된 원문은 삭제하지 않고 `kakao_notification_event_archives`로 이동한다.
- 퀘스트 제안, 말투 학습, 감사 추적에 필요한 요약/가공 데이터는 별도 테이블에 남긴다.
- 자동 archive cron은 실제 운영량을 확인한 뒤 켠다.

## 기본 보관 기준

| 데이터 | live 보관 | 이후 처리 |
|---|---:|---|
| `kakao_notification_events` | 180일 | archive table 이동 |
| `kakao_ingest_batches` | 365일 | 집계만 남기고 정리 검토 |
| `kakao_conversation_messages` | 매장 운영 기간 | 대화 내보내기 원본 학습용이라 별도 판단 |
| `store_tone_profiles` | 계속 보관 | 포워딩 어시스턴트 기준 데이터 |
| `store_tone_examples` | 계속 보관 | 원문 일부지만 학습 예시라 별도 정리 |

## 실행 함수

마이그레이션 `20260509000007_kakao_retention_policy.sql`은 다음 함수를 만든다.

```sql
select *
from public.archive_old_kakao_notification_events(
  now() - interval '180 days',
  5000
);
```

이 함수는 cutoff 이전의 `kakao_notification_events`를 archive table로 옮긴 뒤 live table에서 제거한다. `service_role`만 실행할 수 있다.
단, `store_tone_examples`에서 말투 학습 예시로 참조 중인 이벤트는 live table에 남긴다.

## 운영 절차

1. 매주 live row 수와 최근 화면 속도를 확인한다.
2. live row가 많아지거나 조회가 느려지면 cutoff 180일로 수동 실행한다.
3. 문제가 없으면 월 1회 cron 실행으로 전환한다.
4. archive 실행 전후 row count를 기록한다.

## 금지

- live table 전체 조회 금지
- 클라이언트에서 archive 함수 직접 호출 금지
- 원문을 `communications`에 대량 복사 금지
- archive 없이 원문 바로 삭제 금지
