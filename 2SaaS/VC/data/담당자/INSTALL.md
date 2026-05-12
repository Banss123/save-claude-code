# 설치 가이드 (Claude Code 메인)

> **메인 흐름은 이 파일 = Claude Code가 통제하는 안전한 설치.**
> setup.bat은 빠른 설치 옵션 (Claude 부담 없을 때).

---

## 설치 위치 (필수)

```
C:\Users\[사용자명]\.claude\valuechain\
```

→ Claude Code 프로젝트 표준 위치. 다른 곳에 두지 마세요.

---

## 담당자 → Claude Code에 입력할 문장

**최초 설치**:
```
~/.claude/valuechain 폴더에 새로 받은 zip 풀었어.
INSTALL.md 보고 설치 진행해줘.
```

**업데이트** (기존 폴더 위에 덮어쓴 경우):
```
valuechain 새 버전으로 업데이트했어.
INSTALL.md "업데이트" 섹션 보고 안전하게 갱신해줘.
data/references/, output/ 폴더 절대 건들지 마.
```

---

## Claude가 자동으로 수행할 절차

### 1. 환경 진단
- OS 확인 (Windows / macOS / Linux)
- Python 3.11+ 설치 여부
- uv 설치 여부
- 현재 폴더가 valuechain 프로젝트 루트인지 확인 (`pyproject.toml` 존재)

### 2. uv 설치 (없는 경우)

**Windows**:
```powershell
powershell -ExecutionPolicy Bypass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

**macOS / Linux**:
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

설치 후 PATH 갱신 필요 → 새 셸 세션에서 `uv --version` 확인.

### 3. 의존성 설치

```bash
uv sync
```

`uv.lock`에 고정된 버전(python-docx, openpyxl, pydantic 등) 자동 설치.
약 1-2분 소요. `.venv/` 폴더 자동 생성.

### 4. 작동 확인

```bash
uv run python -c "from src.pipeline import run_pipeline; print('OK')"
```

`OK` 출력되면 설치 완료.

### 5. (선택) 샘플 파이프라인 1회 실행

```bash
uv run python -m src.pipeline \
  --menu data/samples/대흥육회_menu_plan.json \
  --solution output/대흥육회_솔루션.json \
  --output-dir output/test_install
```

`output/test_install/`에 xlsx + docx 생성되면 정상.

---

## 흔한 에러 + 해결

### "uv: command not found"
- uv 설치 후 새 PowerShell/터미널 열기 (PATH 갱신)
- 그래도 안 되면 PATH에 `%USERPROFILE%\.cargo\bin` 또는 `~/.local/bin` 추가

### "Permission denied" (PowerShell)
- 관리자 권한으로 PowerShell 실행
- 또는 `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

### "uv sync" 실패
- 인터넷 연결 확인
- 방화벽이 PyPI 차단하는지 확인
- `--offline` 모드: `uv sync --offline` (lock에 캐시된 패키지만)

### Python 3.11 미설치
- uv가 자동으로 적절한 Python 다운로드함
- 수동 설치: https://www.python.org/downloads/

---

## 설치 후 첫 사용

1. Claude Code 실행
2. 이 폴더(`valuechain/`)를 작업 디렉토리로 열기
3. 자연어 입력: `온보딩 시작 [업장명]`
4. AI가 가안/솔루션 생성 → 검토 → 결과물 받기

자세한 사용법: `README.md`

---

## 업데이트 (기존 버전 위에 새 버전) — 마이그레이션 모드

> ⚠️ **단순 zip 덮어쓰기 금지**. 담당자가 추가/수정한 자료가 날아갈 수 있음.

### 안전 절차

**1. 새 zip을 임시 폴더에 풀기**
```
~/.claude/valuechain        ← 기존 (담당자 작업물 포함)
~/.claude/valuechain_new    ← 새 zip 푼 곳 (임시)
```

**2. Claude Code에 다음 문장 입력**
```
~/.claude/valuechain (기존) 와 ~/.claude/valuechain_new (신규) 비교해서
안전 머지 해줘. INSTALL.md "마이그레이션" 정책 따라.
```

**3. Claude가 자동 수행**
- 두 폴더 diff (어떤 파일이 다른지 식별)
- 보존 영역 자동 격리:
  - `data/references/` (담당자 추가 정답)
  - `output/` (담당자 결과물)
  - `prompts/` 중 담당자 수정분
  - `.claude/skills/`, `.claude/commands/` 중 담당자 커스텀
  - `.venv/` (의존성 캐시)
- 갱신 영역만 적용:
  - `src/` (코드)
  - `pyproject.toml`, `uv.lock`
  - `INSTALL.md`, `README.md`, `CLAUDE.md` (우리 매뉴얼)
  - `docs/` 중 우리가 관리하는 부분
- 충돌(우리도 갱신 + 담당자도 수정) 시 → 사용자 컨펌
- 완료 후 `valuechain_new/` 임시 폴더 정리

### 보존/덮어쓰기 정책 (참조)

| 영역 | 정책 | 이유 |
|------|------|------|
| `src/`, `pyproject.toml`, `uv.lock` | **덮어쓰기** | 코드 갱신 |
| `INSTALL.md`, `README.md`, `CLAUDE.md` | **덮어쓰기** | 우리 매뉴얼 갱신 |
| `prompts/` 우리 기본 파일 | **덮어쓰기 (담당자 수정 시 컨펌)** | 노하우 갱신 |
| `data/samples/` | **덮어쓰기** | 우리 샘플 |
| `data/references/` | **보존** ⭐ | 담당자 추가 정답 |
| `output/` | **보존** ⭐ | 담당자 결과물 |
| `.venv/` | **보존** | 재생성 비용 |
| `.claude/skills/`, `.claude/commands/` | **보존 (신규만 추가)** | 담당자 커스텀 |
| `tasks/`, `lessons.md` | **담당자 자유** | 담당자 메모 |

### 충돌 발생 시 (예시)

같은 파일을 우리도 갱신 + 담당자도 수정 → Claude가:
1. 두 버전 diff 보여줌
2. "어느 쪽 채택할지 또는 머지할지" 사용자 컨펌
3. 머지 어려우면 양쪽 다 보존 (`xxx.our.md`, `xxx.your.md`)

---

## 첫 만남 — 기존 환경 진단 (담당자 인계 시)

담당자가 이미 우리 시스템 이전 버전 사용 중이라면:

```
Claude Code에 입력:
"~/.claude/valuechain 폴더 진단해줘.
- 우리 표준에서 벗어난 부분
- 담당자가 추가한 자료 (references, skills, prompts 수정분)
- 마이그레이션 시 보존해야 할 것
정리해서 보여줘."
```

→ Claude가 폴더 스캔 + 담당자 자산 카탈로그 → 새 버전 적용 시 무엇을 보존해야 할지 사전 식별.
