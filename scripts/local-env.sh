#!/usr/bin/env bash
# 로컬 Supabase 접속값을 SEED_* 환경변수로 내보낸다. 값을 화면에 출력하지 않는다.
while IFS='=' read -r k v; do
  v="${v%$'\r'}"; v="${v%\"}"; v="${v#\"}"
  case "$k" in
    API_URL) export SEED_SUPABASE_URL="$v" ;;
    SERVICE_ROLE_KEY) export SEED_SERVICE_ROLE_KEY="$v" ;;
  esac
done < <(supabase status -o env 2>/dev/null)
export SEED_KEYS_FILE="${SEED_KEYS_FILE:-supabase/functions/.env}"
