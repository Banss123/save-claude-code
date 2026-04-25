#!/bin/bash
# ~/.claude 외부 git repo 셋업/업데이트 스크립트
# 사용법: bash ~/.claude/bootstrap.sh

set -e
cd "$(dirname "$0")"

clone_or_pull() {
  local repo=$1
  local dir=$2
  if [ -d "$dir/.git" ]; then
    echo "↻ $dir 업데이트"
    git -C "$dir" pull --ff-only
  else
    echo "↓ $dir 클론"
    git clone "$repo" "$dir"
  fi
}

clone_or_pull https://github.com/obra/superpowers.git superpowers
clone_or_pull https://github.com/affaan-m/everything-claude-code everything-claude-code
clone_or_pull https://github.com/arinspunk/claude-talk-to-figma-mcp.git claude-talk-to-figma-mcp

echo "✓ done"
