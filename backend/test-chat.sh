#!/bin/bash

# Test script for chat endpoints
# Make sure you have a valid JWT token from logging in

API_URL="http://localhost:8375/api"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Chat API Test Script ===${NC}\n"

# Get token from user
echo "Enter your JWT token (get it from logging in):"
read -r TOKEN

if [ -z "$TOKEN" ]; then
    echo -e "${RED}Error: Token is required${NC}"
    exit 1
fi

# Test 1: Get all conversations
echo -e "\n${BLUE}1. Getting all conversations...${NC}"
curl -s -X GET "$API_URL/chat/conversations" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" | jq '.'

# Test 2: Create a new conversation
echo -e "\n${BLUE}2. Creating a new conversation...${NC}"
echo "Enter user ID to chat with (comma-separated for group):"
read -r USER_IDS

# Convert comma-separated IDs to JSON array
IDS_ARRAY=$(echo "$USER_IDS" | tr ',' '\n' | jq -R '.' | jq -s '.')

CONVERSATION=$(curl -s -X POST "$API_URL/chat/conversations" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
        \"participant_ids\": $IDS_ARRAY,
        \"is_group\": false,
        \"name\": \"Test Chat\"
    }" | jq '.')

echo "$CONVERSATION"
CONVERSATION_ID=$(echo "$CONVERSATION" | jq -r '.id')

if [ "$CONVERSATION_ID" != "null" ] && [ -n "$CONVERSATION_ID" ]; then
    echo -e "${GREEN}Conversation created with ID: $CONVERSATION_ID${NC}"
    
    # Test 3: Send a message
    echo -e "\n${BLUE}3. Sending a test message...${NC}"
    MESSAGE=$(curl -s -X POST "$API_URL/chat/conversations/$CONVERSATION_ID/messages" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d '{
            "content": "Hello! This is a test message from the chat API.",
            "message_type": "text"
        }' | jq '.')
    echo "$MESSAGE"
    
    # Test 4: Get messages for this conversation
    echo -e "\n${BLUE}4. Getting messages from conversation...${NC}"
    curl -s -X GET "$API_URL/chat/conversations/$CONVERSATION_ID/messages" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" | jq '.'
    
    # Test 5: Mark conversation as read
    echo -e "\n${BLUE}5. Marking conversation as read...${NC}"
    curl -s -X POST "$API_URL/chat/conversations/$CONVERSATION_ID/read" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" | jq '.'
    
    # Test 6: Get conversation details
    echo -e "\n${BLUE}6. Getting conversation details...${NC}"
    curl -s -X GET "$API_URL/chat/conversations/$CONVERSATION_ID" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" | jq '.'
else
    echo -e "${RED}Failed to create conversation${NC}"
fi

echo -e "\n${GREEN}=== Test Complete ===${NC}"
