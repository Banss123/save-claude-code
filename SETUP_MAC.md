# Mac 셋업 가이드

> Windows → Mac 이전 후 ~/.claude를 처음 clone 받은 직후 진행하는 셋업.
> 모든 명령어는 `~/.claude` 디렉토리 기준.

---

## 사전 요구사항

```bash
# Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Bun (피그마 MCP 빌드/실행용)
brew install oven-sh/bun/bun

# Node.js (4HyperFrames + 2SaaS 빌드용)
brew install node

# FFmpeg (4HyperFrames 영상 인코딩)
brew install ffmpeg

# Claude Code 본체
# https://docs.anthropic.com/claude-code/install 참조
```

---

## 1. 시크릿 파일 수동 생성 (gitignore라 push 안 됨)

토큰은 사용자에게 직접 확인 (KakaoTalk·1Password·Notion 통합 페이지 등).

```bash
cat > ~/.claude/.secrets.json <<'EOF'
{"notion_token": "여기에_노션_통합_토큰_붙여넣기"}
EOF
chmod 600 ~/.claude/.secrets.json
```

토큰 위치: https://www.notion.so/profile/integrations → 본인 통합 → Internal Integration Secret

---

## 2. MCP 설정 파일 (Mac 경로)

`USER` 자리에 본인 Mac 사용자명 넣기 (`whoami`로 확인).

```bash
USER=$(whoami)
cat > ~/.claude/.mcp.json <<EOF
{
  "mcpServers": {
    "ClaudeTalkToFigma": {
      "command": "node",
      "args": ["/Users/$USER/.claude/claude-talk-to-figma-mcp/dist/talk_to_figma_mcp/server.js"]
    }
  }
}
EOF
```

---

## 3. 피그마 MCP 의존성 설치

```bash
cd ~/.claude/claude-talk-to-figma-mcp
bun install
# dist/ 는 이미 GitHub에 포함되어 있어 빌드 스킵 가능
# 빌드가 필요한 경우: bun run build
```

---

## 4. 피그마 MCP 소켓 서버 자동 시작 (launchd)

Mac 부팅/로그인 시마다 자동 실행되도록 등록.

```bash
USER=$(whoami)
BUN_PATH=$(which bun)

cat > ~/Library/LaunchAgents/com.banss.figma-socket.plist <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.banss.figma-socket</string>
    <key>ProgramArguments</key>
    <array>
        <string>$BUN_PATH</string>
        <string>run</string>
        <string>/Users/$USER/.claude/claude-talk-to-figma-mcp/dist/socket.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/$USER/.claude/claude-talk-to-figma-mcp</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/figma-socket.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/figma-socket-error.log</string>
</dict>
</plist>
EOF

launchctl load ~/Library/LaunchAgents/com.banss.figma-socket.plist
launchctl start com.banss.figma-socket
```

확인:
```bash
launchctl list | grep figma-socket   # 정상이면 PID 표시
cat /tmp/figma-socket.log
```

---

## 5. 피그마 데스크톱 플러그인 import

1. Figma 데스크톱 앱 실행
2. 상단 메뉴 → Plugins → Development → **Import plugin from manifest...**
3. 다음 파일 선택:
   ```
   ~/.claude/claude-talk-to-figma-mcp/src/claude_mcp_plugin/manifest.json
   ```
4. Figma에서 플러그인 실행 → 채널명 입력 (예: `mychannel`)
5. Claude Code에서 `mcp__ClaudeTalkToFigma__join_channel` 호출 시 같은 채널명 사용

---

## 6. 4HyperFrames 스킬 심볼릭 링크 생성

Windows에서는 junction이었던 게 Mac에서는 안 옮겨졌으므로 수동 생성:

```bash
cd ~/.claude/4HyperFrames/.claude
ln -s ../skills skills
```

---

## 7. 2SaaS 프로젝트 의존성 설치

```bash
cd ~/.claude/2SaaS/해병듀오
npm install   # 또는 bun install

cd ~/.claude/2SaaS/VC
npm install   # 또는 bun install
```

---

## 8. 노션 자동 로그 훅 동작 확인

```bash
# 테스트: 훅 직접 실행
echo '{"user_prompt":"test from mac","cwd":"/Users/$USER/.claude"}' | python3 ~/.claude/hooks/notion-save.py

# 노션 대화 라이브러리 DB에서 "소스: Mac" 으로 페이지가 새로 생기면 성공
```

문제 시:
- 에러 로그: `cat ~/.claude/hooks/notion-error.log`
- `.secrets.json` 존재·내용 확인

---

## 9. Claude Code 로그인 + 권한 모드

```bash
# Claude Code 실행
cd ~/.claude
claude   # 또는 claude code

# 첫 실행 시 OAuth 로그인 안내 따라가기
# settings.json 에 이미 skipDangerousModePermissionPrompt: true 가 있어 자동 적용됨
```

---

## 10. MCP 인증 (노션, Canva, Google Drive 등 OAuth 기반)

`.mcp.json` 외의 MCP들은 Claude Code 내장 ("Notion", "Canva" 등). Claude Code 실행 후 처음 사용 시 OAuth 인증 안내가 뜸. 각각 한 번씩 인증.

---

## 셋업 완료 체크리스트

- [ ] `.secrets.json` 존재
- [ ] `.mcp.json` 존재, Mac 경로
- [ ] `claude-talk-to-figma-mcp/node_modules/` 존재
- [ ] `launchctl list | grep figma-socket` → PID 표시
- [ ] `4HyperFrames/.claude/skills` 심볼릭 링크 존재 (`ls -la`로 확인)
- [ ] `2SaaS/해병듀오/node_modules/`, `2SaaS/VC/node_modules/` 존재
- [ ] Figma 플러그인 import 완료
- [ ] 노션 훅 테스트 페이지가 "Mac" 소스로 들어옴

---

## 알려진 차이 (Windows → Mac)

| 항목 | Windows | Mac |
|---|---|---|
| 피그마 소켓 자동 시작 | 작업 스케줄러 `FigmaMCPSocketServer` + `start-socket-silent.vbs` | launchd `com.banss.figma-socket.plist` |
| `4HyperFrames/.claude/skills` | Windows junction | 심볼릭 링크 |
| 노션 훅 소스 표기 | "윈도우" | "Mac" (notion-save.py `detect_source()` 자동) |
| 경로 구분자 | `\` | `/` (Python `os.path.expanduser("~/...")` 로 처리됨) |

---

## 트러블슈팅

**피그마 MCP 도구 호출이 안 됨**
1. `launchctl list | grep figma-socket` 으로 소켓 떠있는지 확인
2. Figma 플러그인이 같은 채널명으로 연결됐는지 확인
3. `/tmp/figma-socket.log` 확인

**노션 훅이 안 됨**
1. `~/.claude/.secrets.json` 존재·읽기 권한 확인
2. `~/.claude/hooks/notion-error.log` 확인
3. Python3 경로: `which python3` (settings.json 의 hook 명령어가 `python` 으로 시작하므로 alias 또는 symlink 필요할 수 있음)

**4HyperFrames 스킬 인식 안 됨**
- `ls -la ~/.claude/4HyperFrames/.claude/skills` 로 심볼릭 링크 확인
- 깨져있으면 6번 단계 다시 실행
