#!/usr/bin/env bash
set -euo pipefail

# Simple multi-client WebSocket stress wrapper that uses the backend chattest tool.
# - Sources .env files if present for credentials
# - Builds/executes the Go chattest program under backend/cmd/chattest

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Load environment files if present (root .env then frontend/.env)
if [ -f "$ROOT_DIR/.env" ]; then
  # shellcheck disable=SC1090
  set -a; source "$ROOT_DIR/.env"; set +a
fi
if [ -f "$ROOT_DIR/frontend/.env" ]; then
  set -a; source "$ROOT_DIR/frontend/.env"; set +a
fi

# CLI args / env overrides
CLIENTS="${CLIENTS:-50}"
DURATION="${DURATION:-30s}"
MAX_CONNS_PER_USER="${MAX_CONNS_PER_USER:-12}"
WORKER_START_STAGGER_SEC="${WORKER_START_STAGGER_SEC:-0.2}"
EMAIL="${PERF_WS_EMAIL:-${PERF_EMAIL:-${E2E_EMAIL:-admin@example.com}}}"
PASSWORD="${PERF_WS_PASSWORD:-${PERF_PASSWORD:-${E2E_PASSWORD:-password123}}}"

# Derive API host (host:port) from environment variables if present
# Prefer PLAYWRIGHT_API_URL, then VITE_API_URL, then fallback
API_URL="${PLAYWRIGHT_API_URL:-${VITE_API_URL:-http://localhost:8375/api}}"
AUTH_API_URL="${API_URL%/}"

# Normalize to host:port
# remove protocol
HOST_PART=$(echo "$API_URL" | sed -E 's~^https?://~~')
# strip trailing /api or /api/
HOST_PART=$(echo "$HOST_PART" | sed -E 's~/api/?$~~')
# strip any trailing slash
HOST_PART=${HOST_PART%%/}

if [ -z "$HOST_PART" ]; then
  echo "Failed to derive host from API_URL ($API_URL)"
  exit 1
fi

echo "Running chattest against host: $HOST_PART with $CLIENTS clients for $DURATION"
echo "Using email: $EMAIL"

login_status_code() {
  local login_email="$1"
  local login_password="$2"
  curl -sS -o /tmp/ws-login-check.json -w "%{http_code}" \
    -H "Content-Type: application/json" \
    -X POST "$AUTH_API_URL/auth/login" \
    -d "{\"email\":\"$login_email\",\"password\":\"$login_password\"}"
}

ensure_login_credentials() {
  local status
  status="$(login_status_code "$EMAIL" "$PASSWORD" || true)"
  if [ "$status" = "200" ]; then
    return 0
  fi

  echo "Login failed for $EMAIL (status=$status). Creating a temporary perf user..."
  local suffix
  suffix="$(date +%s)-$RANDOM"
  local fallback_email="perfws-${suffix}@example.com"
  local fallback_password="${PERF_WS_FALLBACK_PASSWORD:-TestPass123!@#}"
  local fallback_username
  fallback_username="perfws${suffix}"
  fallback_username="${fallback_username:0:20}"

  local signup_status
  signup_status="$(curl -sS -o /tmp/ws-signup-check.json -w "%{http_code}" \
    -H "Content-Type: application/json" \
    -X POST "$AUTH_API_URL/auth/signup" \
    -d "{\"username\":\"$fallback_username\",\"email\":\"$fallback_email\",\"password\":\"$fallback_password\"}" || true)"

  if [ "$signup_status" != "200" ] && [ "$signup_status" != "201" ]; then
    echo "Failed to create fallback perf user (status=$signup_status)." >&2
    echo "Set PERF_WS_EMAIL and PERF_WS_PASSWORD to valid credentials and retry." >&2
    exit 2
  fi

  EMAIL="$fallback_email"
  PASSWORD="$fallback_password"
  echo "Using generated perf user: $EMAIL"

  status="$(login_status_code "$EMAIL" "$PASSWORD" || true)"
  if [ "$status" != "200" ]; then
    echo "Generated user login still failed (status=$status)." >&2
    echo "Set PERF_WS_EMAIL and PERF_WS_PASSWORD to valid credentials and retry." >&2
    exit 2
  fi
}

ensure_login_credentials

get_auth_token() {
  local login_email="$1"
  local login_password="$2"
  local status
  status="$(curl -sS -o /tmp/ws-login-token.json -w "%{http_code}" \
    -H "Content-Type: application/json" \
    -X POST "$AUTH_API_URL/auth/login" \
    -d "{\"email\":\"$login_email\",\"password\":\"$login_password\"}" || true)"
  if [ "$status" != "200" ]; then
    return 1
  fi
  python3 - <<'PY'
import json
from pathlib import Path
payload = json.loads(Path("/tmp/ws-login-token.json").read_text(encoding="utf-8"))
print(payload.get("token",""))
PY
}

extract_first_id() {
  local file="$1"
  python3 - "$file" <<'PY'
import json, sys
from pathlib import Path
arr = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
if isinstance(arr, list) and arr:
    first = arr[0]
    if isinstance(first, dict) and "id" in first:
        print(first["id"])
PY
}

resolve_conversation_id() {
  local token="$1"
  local status
  status="$(curl -sS -o /tmp/ws-joined-chatrooms.json -w "%{http_code}" \
    -H "Authorization: Bearer $token" \
    "$AUTH_API_URL/chatrooms/joined" || true)"
  if [ "$status" = "200" ]; then
    local joined_id
    joined_id="$(extract_first_id /tmp/ws-joined-chatrooms.json)"
    if [ -n "$joined_id" ]; then
      echo "$joined_id"
      return 0
    fi
  fi

  status="$(curl -sS -o /tmp/ws-all-chatrooms.json -w "%{http_code}" \
    -H "Authorization: Bearer $token" \
    "$AUTH_API_URL/chatrooms" || true)"
  if [ "$status" != "200" ]; then
    return 1
  fi

  local room_id
  room_id="$(extract_first_id /tmp/ws-all-chatrooms.json)"
  if [ -z "$room_id" ]; then
    return 1
  fi

  status="$(curl -sS -o /tmp/ws-join-room.json -w "%{http_code}" \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    -X POST "$AUTH_API_URL/chatrooms/$room_id/join" \
    -d "{}" || true)"
  if [ "$status" != "200" ] && [ "$status" != "201" ]; then
    return 1
  fi

  echo "$room_id"
}

join_room() {
  local token="$1"
  local room_id="$2"
  local status
  status="$(curl -sS -o /tmp/ws-join-room-explicit.json -w "%{http_code}" \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    -X POST "$AUTH_API_URL/chatrooms/$room_id/join" \
    -d "{}" || true)"
  if [ "$status" = "200" ] || [ "$status" = "201" ]; then
    return 0
  fi
  return 1
}

# Execute chattest using prebuilt binary when available, fallback to go run.
CHATT_TEST_PKG="./cmd/chattest"
if [ -x "$ROOT_DIR/backend/bin/chattest" ]; then
  CHATT_CMD="$ROOT_DIR/backend/bin/chattest"
  CHATT_MODE="binary"
elif command -v go >/dev/null 2>&1; then
  CHATT_CMD="go_run"
  CHATT_MODE="go_run"
else
  echo "Go is not installed and no prebuilt binary found at backend/bin/chattest. Install Go or build the binary." >&2
  exit 2
fi

run_chattest() {
  local run_email="$1"
  local run_password="$2"
  local run_clients="$3"
  local run_conversation_id="$4"

  if [ "$CHATT_MODE" = "binary" ]; then
    "$CHATT_CMD" -host "$HOST_PART" -email "$run_email" -password "$run_password" -clients "$run_clients" -duration "$DURATION" -conversation-id "$run_conversation_id"
  else
    (
      cd "$ROOT_DIR/backend"
      go run "$CHATT_TEST_PKG" -host "$HOST_PART" -email "$run_email" -password "$run_password" -clients "$run_clients" -duration "$DURATION" -conversation-id "$run_conversation_id"
    )
  fi
}

create_perf_user() {
  local index="$1"
  local attempts=5
  local user_password="${PERF_WS_FALLBACK_PASSWORD:-TestPass123!@#}"
  for attempt in $(seq 1 "$attempts"); do
    local suffix
    suffix="$(date +%s)-$RANDOM-$index-$attempt"
    local user_email="perfws-${suffix}@example.com"
    local user_name="perfws${suffix}"
    user_name="${user_name:0:20}"

    local signup_status
    signup_status="$(curl -sS -o /tmp/ws-signup-check-${index}.json -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -X POST "$AUTH_API_URL/auth/signup" \
      -d "{\"username\":\"$user_name\",\"email\":\"$user_email\",\"password\":\"$user_password\"}" || true)"

    if [ "$signup_status" = "200" ] || [ "$signup_status" = "201" ]; then
      echo "$user_email:$user_password"
      return 0
    fi
    sleep "$attempt"
  done
  echo "Failed to create perf user #$index after $attempts attempts." >&2
  return 1
}

AUTH_TOKEN="$(get_auth_token "$EMAIL" "$PASSWORD")"
if [ -z "$AUTH_TOKEN" ]; then
  echo "Failed to obtain auth token for $EMAIL" >&2
  exit 2
fi

CONVERSATION_ID=""
for _ in 1 2 3 4 5; do
  CONVERSATION_ID="$(resolve_conversation_id "$AUTH_TOKEN" || true)"
  if [ -n "$CONVERSATION_ID" ]; then
    break
  fi
  sleep 1
done
if [ -z "$CONVERSATION_ID" ]; then
  echo "Failed to resolve target conversation ID for WS stress test." >&2
  exit 2
fi
echo "Using conversation ID: $CONVERSATION_ID"

if [ "$CLIENTS" -le "$MAX_CONNS_PER_USER" ]; then
  run_chattest "$EMAIL" "$PASSWORD" "$CLIENTS" "$CONVERSATION_ID"
  echo "chattest finished"
  exit 0
fi

USERS_NEEDED=$(( (CLIENTS + MAX_CONNS_PER_USER - 1) / MAX_CONNS_PER_USER ))
echo "Distributing $CLIENTS clients across $USERS_NEEDED users (max $MAX_CONNS_PER_USER connections/user)"

declare -a PIDS=()
declare -a LOGS=()

remaining_clients="$CLIENTS"
for i in $(seq 1 "$USERS_NEEDED"); do
  clients_for_user="$MAX_CONNS_PER_USER"
  if [ "$remaining_clients" -lt "$MAX_CONNS_PER_USER" ]; then
    clients_for_user="$remaining_clients"
  fi

  user_email="$EMAIL"
  user_password="$PASSWORD"
  if [ "$i" -gt 1 ]; then
    user_creds="$(create_perf_user "$i")" || exit 2
    user_email="${user_creds%%:*}"
    user_password="${user_creds#*:}"
    
    # Join the new user to the conversation so they can participate
    user_token="$(get_auth_token "$user_email" "$user_password")"
    if [ -n "$user_token" ]; then
      if ! join_room "$user_token" "$CONVERSATION_ID"; then
        echo "Error: User $user_email failed to join $CONVERSATION_ID" >&2
        exit 2
      fi
    else
      echo "Error: Failed to get token for user $user_email" >&2
      exit 2
    fi
  fi

  log_file="/tmp/chattest-user-${i}.log"
  echo "Starting user #$i ($user_email) with $clients_for_user clients (log: $log_file)"
  run_chattest "$user_email" "$user_password" "$clients_for_user" "$CONVERSATION_ID" >"$log_file" 2>&1 &
  PIDS+=("$!")
  LOGS+=("$log_file")
  sleep "$WORKER_START_STAGGER_SEC"

  remaining_clients=$(( remaining_clients - clients_for_user ))
done

overall_status=0
for pid in "${PIDS[@]}"; do
  if ! wait "$pid"; then
    overall_status=1
  fi
done

total_attempted=0
total_success=0
total_failed=0
total_sent=0
total_received=0
total_errors=0
for log_file in "${LOGS[@]}"; do
  attempted="$(grep -E "Connections Attempted:" "$log_file" | tail -1 | awk '{print $NF}' || true)"
  success="$(grep -E "Connections Successful:" "$log_file" | tail -1 | awk '{print $NF}' || true)"
  failed="$(grep -E "Connections Failed:" "$log_file" | tail -1 | awk '{print $NF}' || true)"
  sent="$(grep -E "Messages Sent:" "$log_file" | tail -1 | awk '{print $NF}' || true)"
  received="$(grep -E "Messages Received:" "$log_file" | tail -1 | awk '{print $NF}' || true)"
  errors="$(grep -E "Total Errors:" "$log_file" | tail -1 | awk '{print $NF}' || true)"
  total_attempted=$(( total_attempted + ${attempted:-0} ))
  total_success=$(( total_success + ${success:-0} ))
  total_failed=$(( total_failed + ${failed:-0} ))
  total_sent=$(( total_sent + ${sent:-0} ))
  total_received=$(( total_received + ${received:-0} ))
  total_errors=$(( total_errors + ${errors:-0} ))
done

echo ""
echo "Aggregated chattest results"
echo "Connections Attempted: $total_attempted"
echo "Connections Successful: $total_success"
echo "Connections Failed: $total_failed"
echo "Messages Sent: $total_sent"
echo "Messages Received: $total_received"
echo "Total Errors: $total_errors"

if [ "$overall_status" -ne 0 ]; then
  echo "One or more chattest workers failed. Check /tmp/chattest-user-*.log" >&2
  exit 2
fi

echo "chattest finished"
