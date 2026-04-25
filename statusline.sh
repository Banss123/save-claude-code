#!/usr/bin/env bash
input=$(cat)
model=$(echo "$input" | jq -r '.model.display_name // "Unknown"')
used_pct=$(echo "$input" | jq -r '.context_window.used_percentage // empty')

if [ -z "$used_pct" ]; then
  printf "%s | 컨텍스트: 대기중" "$model"
else
  used_int=$(printf '%.0f' "$used_pct")
  if [ "$used_int" -ge 80 ]; then
    color="\033[31m"
  elif [ "$used_int" -ge 50 ]; then
    color="\033[33m"
  else
    color="\033[32m"
  fi

  input_tokens=$(echo "$input" | jq -r '.context_window.current_usage.input_tokens // 0')
  ctx_size=$(echo "$input" | jq -r '.context_window.context_window_size // 0')

  fmt_tokens=$(echo "$input_tokens" | awk '{if($1>=1000) printf "%.1fk",$1/1000; else print $1}')
  fmt_ctx=$(echo "$ctx_size" | awk '{if($1>=1000) printf "%.0fk",$1/1000; else print $1}')

  printf "%s | ${color}컨텍스트: %d%% (%s / %s)\033[0m" \
    "$model" "$used_int" "$fmt_tokens" "$fmt_ctx"
fi
