# 카카오톡 인박스 — Phase 1: 알림 캡처 PoC

> **목적**: 다른 PC에서 카톡 PC 알림을 Python으로 잡을 수 있는지 검증.
> 통과해야 Phase 2(Supabase 적재) → Phase 3(AI 분류) → Phase 4(공용 패키지)로 진행.

---

## 0. 전체 그림 (참고)

```
[미니PC/NAS - 24/7]                [메인 PC - 작업 환경]
 카톡 PC                            Python worker (cron 5분)
  ↓ Toast 알림                       └ Supabase 폴링 → Claude API
 Python ingester (이번 PoC)              → 분류/요약/할일 생성
  ↓ POST                            └ 공용 패키지 kakao_inbox
 Supabase                          ┌────────────────────┐
  kakao_messages                   │ 2SaaS, 다른 SaaS    │
  kakao_classifications            │ Claude Code 슬래시  │
  kakao_tasks                      └────────────────────┘
```

**이번 PoC 범위**: 위 그림에서 "Python ingester" 부분만. Supabase 안 씀. 콘솔에 카톡 메시지 출력되면 통과.

---

## 1. 사전 요구사항

### 시스템
- Windows 10 빌드 17763 (1809) 이상 또는 Windows 11
- Python 3.11+ (`python --version` 확인)

### 카카오톡 PC
- 본인 계정으로 로그인된 상태
- **알림 미리보기 ON 필수** — 카톡 PC → 설정(톱니바퀴) → 알림 → "메시지 미리보기" 체크
  - OFF면 알림에 "카카오톡 메시지가 도착했습니다"만 떠서 발신자/내용 못 잡음

### Windows 설정
- **알림 활성화**: 설정 → 시스템 → 알림 → "알림" ON
- **집중 지원(Focus Assist) OFF**: 설정 → 시스템 → 집중 지원 → "끄기"
  - 집중 지원이 켜져 있으면 카톡 알림이 토스트로 안 뜨고 알림 센터로만 감

---

## 2. Python 환경 셋업

### 2-1. 작업 폴더 만들기
```powershell
mkdir C:\kakao-inbox
cd C:\kakao-inbox
```

### 2-2. 가상환경 생성
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

> **PowerShell 실행정책 에러 시**:
> ```powershell
> Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
> ```

### 2-3. 의존성 설치
```powershell
pip install winsdk
```

> `winsdk`는 Microsoft가 권장하는 Python WinRT 바인딩 (구 `winrt` 패키지의 후속).
> `pip install winsdk` 가 실패하면 폴백으로 분리 패키지 사용:
> ```powershell
> pip install "winrt-Windows.UI.Notifications" "winrt-Windows.UI.Notifications.Management" "winrt-runtime"
> ```
> 그 경우 코드 import 경로의 `winsdk` → `winrt`로 바꿔야 함.

---

## 3. PoC 코드

`C:\kakao-inbox\listener_poc.py` 파일 생성:

```python
"""
카카오톡 PC 알림 캡처 PoC.

실행: python listener_poc.py
중지: Ctrl+C
"""
import asyncio
from winsdk.windows.ui.notifications.management import (
    UserNotificationListener,
    UserNotificationListenerAccessStatus,
)
from winsdk.windows.ui.notifications import NotificationKinds


KAKAO_KEYWORDS = ("Kakao", "카카오", "KakaoTalk")


def is_kakao(notification) -> bool:
    """알림이 카카오톡에서 온 건지 판단."""
    try:
        app_info = notification.app_info
        if not app_info:
            return False
        aumid = app_info.app_user_model_id or ""
        display = (app_info.display_info.display_name or "") if app_info.display_info else ""
        return any(k in aumid or k in display for k in KAKAO_KEYWORDS)
    except Exception:
        return False


def extract_texts(notification) -> list[str]:
    """토스트 알림에서 텍스트 요소들 추출. 보통 [발신자/방, 메시지] 순."""
    texts: list[str] = []
    try:
        visual = notification.notification.visual
        # generic 또는 첫 번째 binding
        for binding in visual.bindings:
            for element in binding.get_text_elements():
                t = (element.text or "").strip()
                if t:
                    texts.append(t)
    except Exception as e:
        print(f"  (텍스트 추출 실패: {e})")
    return texts


async def main():
    listener = UserNotificationListener.current

    # 1. 권한 요청
    access = await listener.request_access_async()
    if access != UserNotificationListenerAccessStatus.ALLOWED:
        print(f"❌ 알림 접근 거부됨: {access}")
        print("   Windows 설정 → 개인 정보 및 보안 → 알림에 액세스 → 허용 필요")
        return

    print("✓ 알림 접근 허용됨. 이제 카톡으로 메시지를 받아보세요. (Ctrl+C로 종료)")
    print("-" * 60)

    seen: set[int] = set()

    while True:
        try:
            notifications = await listener.get_notifications_async(NotificationKinds.TOAST)
            for n in notifications:
                if n.id in seen:
                    continue
                seen.add(n.id)

                if not is_kakao(n):
                    continue

                texts = extract_texts(n)
                if not texts:
                    continue

                # 보통 카톡 알림 구조: [방이름 or 발신자] → [메시지 본문]
                sender_or_room = texts[0] if texts else "?"
                body = " | ".join(texts[1:]) if len(texts) > 1 else "(empty)"

                print(f"[카톡] {sender_or_room}")
                print(f"   → {body}")
                print(f"   id={n.id} aumid={n.app_info.app_user_model_id}")
                print()

            await asyncio.sleep(1)
        except KeyboardInterrupt:
            print("\n종료.")
            break
        except Exception as e:
            print(f"⚠ 루프 에러: {e}")
            await asyncio.sleep(2)


if __name__ == "__main__":
    asyncio.run(main())
```

---

## 4. 실행 + 검증

### 4-1. 실행
```powershell
python listener_poc.py
```

첫 실행 시 Windows가 권한 팝업을 띄울 수 있음. **"허용"** 클릭.

권한 팝업이 안 뜨고 바로 거부 메시지가 나오면 → 6번 트러블슈팅 참조.

### 4-2. 카톡으로 본인에게 메시지 받기
- 다른 사람한테 부탁해서 메시지 받기, 또는
- 다른 폰/디바이스에서 본인 카톡으로 메시지 보내기, 또는
- 카톡 본인 채팅방에 메시지 작성

### 4-3. 콘솔 출력 예시
```
✓ 알림 접근 허용됨. 이제 카톡으로 메시지를 받아보세요. (Ctrl+C로 종료)
------------------------------------------------------------
[카톡] 홍길동 사장님
   → 메뉴판 사진 보내드렸어요
   id=12345 aumid=Kakao.KakaoTalk
```

여기까지 보이면 **PoC 통과**. Phase 2로 진행 가능.

---

## 5. 검증 체크리스트

- [ ] Python 3.11+ 설치됨
- [ ] `winsdk` import 에러 없음
- [ ] 알림 접근 권한 ALLOWED
- [ ] 카톡 메시지 받았을 때 콘솔에 발신자/내용 출력됨
- [ ] 일반 채팅 + 단톡방 둘 다 잡힘
- [ ] PC 절전/잠금 후 깨어나도 정상 작동

---

## 6. 트러블슈팅

### 6-1. `request_access_async()`가 DENIED 반환
- 설정 → 개인 정보 및 보안 → **알림에 액세스** → "앱이 알림에 액세스할 수 있도록 허용" ON
- Python.exe 자체는 별도 앱으로 등록되지 않음. 시스템 전역 설정만 보면 됨
- Windows S 모드에서는 일부 WinRT API 차단됨 → S 모드 해제 필요

### 6-2. 알림 권한은 ALLOWED인데 카톡 알림이 안 잡힘
순서대로 점검:
1. **카톡 PC 알림 설정**: 설정 → 알림 → "메시지 알림" + "메시지 미리보기" 둘 다 ON
2. **Windows 알림 ON**: 설정 → 시스템 → 알림 → "카카오톡" 앱별 알림 ON
3. **집중 지원 OFF**: 설정 → 시스템 → 집중 지원 → 끄기
4. **카톡 PC 시스템 트레이 모드**: 카톡이 트레이로만 알림을 보낼 수 있음.
   카톡 설정 → "토스트 알림 표시" 비슷한 옵션 확인

### 6-3. AUMID가 "Kakao"로 시작 안 함
카톡 PC 버전에 따라 AUMID가 다를 수 있음. 우선 필터 없이 모든 토스트를 출력하게 해서 카톡 AUMID를 직접 확인:

```python
# is_kakao() 호출 부분을 임시 주석 처리하고
# 모든 알림 출력하도록 변경 후 실행
print(f"AUMID: {n.app_info.app_user_model_id}")
print(f"DisplayName: {n.app_info.display_info.display_name}")
```

확인된 AUMID를 `KAKAO_KEYWORDS`에 추가.

### 6-4. 텍스트가 "카카오톡 메시지가 도착했습니다"만 잡힘
카톡 설정에서 **"메시지 미리보기" OFF** 상태. ON으로 변경.
잠금 화면에서만 미리보기 가리는 옵션도 확인.

### 6-5. `winsdk` 설치 실패
- Python 32-bit/64-bit 미스매치: `python -c "import platform; print(platform.architecture())"` 확인
- Windows SDK 없음: Visual Studio Build Tools 설치 또는 폴백 패키지 사용
  ```powershell
  pip install "winrt-Windows.UI.Notifications" "winrt-Windows.UI.Notifications.Management" "winrt-runtime"
  ```
  이 경우 코드의 `from winsdk.windows...` → `from winrt.windows...`로 변경.

### 6-6. 알림이 한 번만 잡히고 그 다음부터 안 잡힘
`seen` 세트가 무한 커지는 건 아니지만, 같은 ID 중복 방지 로직이 너무 공격적일 수 있음.
대안: `notification_changed` 이벤트 구독 방식으로 전환 (Phase 2에서 도입 예정).

### 6-7. PC 절전 후 멈춤
이번 PoC는 단순 폴링이라 절전 → 깨어남에 살아남음. 하지만 카톡 PC가 절전 중에 받은 메시지를 깨어난 직후 한 번에 알림으로 띄워서 처리량이 잠시 튐. 정상.

24/7 운영 시에는:
- 미니PC 전원 옵션 → 절대 절전 안 함
- 작업 스케줄러로 부팅 시 자동 실행 등록 (Phase 2에서 안내)

---

## 7. 보안 / 정책 참고

- **Anthropic 정책**: 카톡 데이터에 개인정보(전화번호/주소/매출)가 있으면 처리 시 동의 필요. Usage Policy §"privacy rights".
- **카톡 약관**: 카톡 PC 클라이언트의 알림을 OS 레벨에서 읽는 건 **카카오 서버에 어떤 호출도 안 보냄**. 메신저봇R 같은 비공식 클라이언트보다 약관 위반 위험이 훨씬 낮은 회색지대. 단, 자동 응답까지 가면 명백한 약관 위반.
- **본 PoC는 읽기 전용** — BAN 위험 매우 낮음.

---

## 8. 다음 단계 (PoC 통과 후)

다른 PC에서 PoC가 정상 작동하면, 메인 PC에서 다음을 요청:

> **"카톡 인박스 Phase 2 가이드 줘"**

Phase 2 내용:
- Supabase 프로젝트 생성 + SQL (테이블 + RLS)
- ingester를 Supabase로 POST하도록 확장
- Windows 작업 스케줄러로 부팅 시 자동 실행
- 메시지 중복 방지 (DB unique constraint)

Phase 3:
- Python worker (cron) → Claude API 분류/요약/할일 추출
- 매장/업주 명단 매칭

Phase 4:
- `kakao_inbox` 공용 패키지 (2SaaS + 다른 SaaS에서 import)
- Claude Code 슬래시 커맨드 `/카톡`

---

## 참고 출처

- [Microsoft Learn: Notification Listener](https://learn.microsoft.com/en-us/windows/apps/develop/notifications/app-notifications/notification-listener)
- [UserNotificationListener Class](https://learn.microsoft.com/en-us/uwp/api/windows.ui.notifications.management.usernotificationlistener)
- [pywinrt/python-winsdk](https://github.com/pywinrt/python-winsdk)
- [win11toast (참고용 Python 토스트 라이브러리)](https://pypi.org/project/win11toast/)
