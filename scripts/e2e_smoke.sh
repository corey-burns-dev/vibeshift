#!/usr/bin/env bash
set -euo pipefail
API_BASE=${API_BASE:-http://localhost:8375/api}
PASSWORD='Password123!'

u1="e2e_user1_$(date +%s)"
e1="$u1@example.com"

u2="e2e_user2_$(date +%s)"
e2="$u2@example.com"

echo "Signing up user1 ($u1)"
t1=$(curl -s -X POST "$API_BASE/auth/signup" -H 'Content-Type: application/json' -d "{\"username\": \"$u1\", \"email\": \"$e1\", \"password\": \"$PASSWORD\"}" | jq -r .token)
if [ "$t1" = "null" ] || [ -z "$t1" ]; then
  echo "signup user1 failed"; exit 1
fi

echo "Signing up user2 ($u2)"
t2=$(curl -s -X POST "$API_BASE/auth/signup" -H 'Content-Type: application/json' -d "{\"username\": \"$u2\", \"email\": \"$e2\", \"password\": \"$PASSWORD\"}" | jq -r .token)
if [ "$t2" = "null" ] || [ -z "$t2" ]; then
  echo "signup user2 failed"; exit 1
fi

echo "Creating room as user1"
room=$(curl -s -X POST "$API_BASE/games/rooms" -H "Authorization: Bearer $t1" -H 'Content-Type: application/json' -d '{"type":"tictactoe"}')
room_id=$(echo "$room" | jq -r .id)
if [ -z "$room_id" ] || [ "$room_id" = "null" ]; then
  echo "create room failed: $room"; exit 1
fi

echo "Room created: $room_id"

echo "Fetching active rooms"
active=$(curl -s -H "Authorization: Bearer $t1" "$API_BASE/games/rooms/active?type=tictactoe")

echo "$active" | jq '.'

# Check whether our room appears
count=$(echo "$active" | jq --arg rid "$room_id" '[.[] | select(.id|tostring == $rid)] | length')
if [ "$count" -ge 1 ]; then
  echo "Smoke test PASSED: room present in active list"
  exit 0
else
  echo "Smoke test FAILED: room not found in active list"
  exit 2
fi
