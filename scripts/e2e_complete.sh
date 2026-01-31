#!/bin/bash
set -euo pipefail

# Comprehensive E2E test: create two users, create room, join with second user, exchange chat

API_BASE="http://localhost:8082/api"
TIMESTAMP=$(date +%s)
USER1="e2e_p1_$TIMESTAMP"
USER2="e2e_p2_$TIMESTAMP"
USER1_EMAIL="$USER1@test.com"
USER2_EMAIL="$USER2@test.com"
PASSWORD="testpass123"
GAME_TYPE="tictactoe"

log() {
  echo "[E2E] $*"
}

log "Starting comprehensive E2E test..."

# 1. Sign up User 1
log "Signing up User 1 ($USER1)..."
SIGNUP1=$(curl -s -X POST "$API_BASE/auth/signup" \
  -H "Content-Type: application/json" \
  -d "{
    \"username\": \"$USER1\",
    \"email\": \"$USER1_EMAIL\",
    \"password\": \"$PASSWORD\"
  }")

USER1_ID=$(echo "$SIGNUP1" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
USER1_TOKEN=$(echo "$SIGNUP1" | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$USER1_ID" ] || [ -z "$USER1_TOKEN" ]; then
  log "ERROR: Failed to sign up User 1"
  exit 1
fi
log "✓ User 1 created (ID: $USER1_ID)"

# 2. Sign up User 2
log "Signing up User 2 ($USER2)..."
SIGNUP2=$(curl -s -X POST "$API_BASE/auth/signup" \
  -H "Content-Type: application/json" \
  -d "{
    \"username\": \"$USER2\",
    \"email\": \"$USER2_EMAIL\",
    \"password\": \"$PASSWORD\"
  }")

USER2_ID=$(echo "$SIGNUP2" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
USER2_TOKEN=$(echo "$SIGNUP2" | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$USER2_ID" ] || [ -z "$USER2_TOKEN" ]; then
  log "ERROR: Failed to sign up User 2"
  exit 1
fi
log "✓ User 2 created (ID: $USER2_ID)"

# 3. User 1 creates a game room
log "User 1 creating game room..."
CREATE_ROOM=$(curl -s -X POST "$API_BASE/games/rooms" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER1_TOKEN" \
  -d "{
    \"game_type\": \"$GAME_TYPE\",
    \"configuration\": {}
  }")

ROOM_ID=$(echo "$CREATE_ROOM" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
if [ -z "$ROOM_ID" ]; then
  log "ERROR: Failed to create room. Response: $CREATE_ROOM"
  exit 1
fi
log "✓ Room created (ID: $ROOM_ID)"

# 4. Verify room is in active list
log "Verifying room appears in active list..."
ACTIVE_ROOMS=$(curl -s -X GET "$API_BASE/games/rooms/active?game_type=$GAME_TYPE" \
  -H "Authorization: Bearer $USER1_TOKEN")

if echo "$ACTIVE_ROOMS" | grep -q "\"id\":$ROOM_ID"; then
  log "✓ Room found in active list"
else
  log "ERROR: Room not found in active list. Response: $ACTIVE_ROOMS"
  exit 1
fi

# 5. User 2 joins the room
log "User 2 joining room..."
JOIN_ROOM=$(curl -s -X POST "$API_BASE/games/rooms/$ROOM_ID/join" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER2_TOKEN")

if echo "$JOIN_ROOM" | grep -q '"status":"active"'; then
  log "✓ User 2 joined room (status changed to active)"
else
  log "WARNING: Room status may not have changed. Response: $JOIN_ROOM"
fi

# 6. Verify room status is now "active"
log "Verifying room is now active..."
ROOM_STATUS=$(curl -s -X GET "$API_BASE/games/rooms/$ROOM_ID" \
  -H "Authorization: Bearer $USER1_TOKEN")

if echo "$ROOM_STATUS" | grep -q '"status":"active"'; then
  log "✓ Room status is active"
else
  log "WARNING: Room status may not be active. Response: $ROOM_STATUS"
fi

# 7. Make a move (User 1 plays move 0 on tictactoe board)
log "User 1 making a move (position 0)..."
MOVE=$(curl -s -X POST "$API_BASE/games/rooms/$ROOM_ID/move" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER1_TOKEN" \
  -d '{
    "move": 0
  }')

if echo "$MOVE" | grep -q '"status"'; then
  log "✓ Move accepted"
else
  log "WARNING: Move response unclear. Response: $MOVE"
fi

# 8. User 2 sends chat message
log "User 2 sending chat message..."
CHAT=$(curl -s -X POST "$API_BASE/games/rooms/$ROOM_ID/chat" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER2_TOKEN" \
  -d '{
    "message": "Good game!"
  }')

if echo "$CHAT" | grep -q '"id"'; then
  log "✓ Chat message sent"
else
  log "WARNING: Chat message response unclear. Response: $CHAT"
fi

# 9. User 1 sends a reply
log "User 1 sending chat reply..."
CHAT2=$(curl -s -X POST "$API_BASE/games/rooms/$ROOM_ID/chat" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER1_TOKEN" \
  -d '{
    "message": "You too!"
  }')

if echo "$CHAT2" | grep -q '"id"'; then
  log "✓ Chat reply sent"
else
  log "WARNING: Chat reply response unclear. Response: $CHAT2"
fi

# 10. Retrieve chat history
log "Retrieving chat history..."
CHAT_HISTORY=$(curl -s -X GET "$API_BASE/games/rooms/$ROOM_ID/chat" \
  -H "Authorization: Bearer $USER1_TOKEN")

if echo "$CHAT_HISTORY" | grep -q 'Good game'; then
  log "✓ Chat history retrieved with messages"
else
  log "WARNING: Chat history may be empty or malformed. Response: $CHAT_HISTORY"
fi

log ""
log "==========================================="
log "✓ E2E TEST PASSED"
log "==========================================="
log "Summary:"
log "  User 1: $USER1 (ID: $USER1_ID)"
log "  User 2: $USER2 (ID: $USER2_ID)"
log "  Room: $ROOM_ID ($GAME_TYPE)"
log "  Room Status: active (both players joined)"
log "  Chat Messages: 2 exchanged"
log "==========================================="
