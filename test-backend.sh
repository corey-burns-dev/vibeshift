#!/bin/bash

API="http://localhost:8375/api"

# Create test user
echo "Creating test user..."
USER=$(curl -s -X POST "$API/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{"username":"apitest'"$(date +%s)"'","email":"api@test.com","password":"Test123!"}')

TOKEN=$(echo "$USER" | jq -r '.token // empty')

if [ -z "$TOKEN" ]; then
  echo "❌ Failed to create user or get token"
  echo "Response: $USER"
  exit 1
fi

echo "✓ User created, token: ${TOKEN:0:30}..."
echo ""

# Test conversations endpoint
echo "Testing GET /conversations..."
RESPONSE=$(curl -s -X GET "$API/conversations" \
  -H "Authorization: Bearer $TOKEN")

echo "Response:"
echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
