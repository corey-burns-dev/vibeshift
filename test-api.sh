#!/bin/bash

echo "==================================="
echo "Vibeshift API - Test All Routes"
echo "==================================="
echo ""

# Default port (matches docker-compose)
PORT=${PORT:-8080}
BASE_URL="http://localhost:${PORT}"

# Verbose mode flag
VERBOSE=${VERBOSE:-false}

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Test counter
PASSED=0
FAILED=0
TOTAL=0

# Array to store failed tests
declare -a FAILED_TESTS

# Helper function to run a test
run_test() {
    local test_name=$1
    local test_command=$2
    local expected_result=$3
    
    ((TOTAL++))
    echo -e "${BLUE}Testing $test_name...${NC}"
    
    if [ "$VERBOSE" = "true" ]; then
        echo -e "${YELLOW}Command: $test_command${NC}"
    fi
    
    eval "$test_command"
    local result=$?
    
    if [ $result -eq $expected_result ]; then
        echo -e "${GREEN}✓ $test_name passed${NC}"
        ((PASSED++))
    else
        echo -e "${RED}✗ $test_name failed${NC}"
        ((FAILED++))
        FAILED_TESTS+=("$test_name")
        if [ "$VERBOSE" = "true" ]; then
            echo -e "${YELLOW}Expected: $expected_result, Got: $result${NC}"
        fi
    fi
    echo ""
}

# Test health endpoint
echo -e "${BLUE}Testing health endpoint...${NC}"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" $BASE_URL/api/)
((TOTAL++))
if [ "$RESPONSE" -eq 200 ]; then
    echo -e "${GREEN}✓ Health check passed${NC}"
    ((PASSED++))
    if [ "$VERBOSE" = "true" ]; then
        curl -s $BASE_URL/api/ | jq . 2>/dev/null || curl -s $BASE_URL/api/
    fi
else
    echo -e "${RED}✗ Health check failed (HTTP $RESPONSE)${NC}"
    ((FAILED++))
    FAILED_TESTS+=("Health check")
    if [ "$VERBOSE" = "true" ]; then
        echo -e "${YELLOW}Response: $(curl -s $BASE_URL/api/)${NC}"
    fi
fi
echo ""

# Generate unique test data
TIMESTAMP=$(date +%s)
USERNAME="testuser_$TIMESTAMP"
EMAIL="test_$TIMESTAMP@example.com"
PASSWORD="password123"

# Signup
echo -e "${BLUE}Testing user signup...${NC}"
((TOTAL++))

if [ "$VERBOSE" = "true" ]; then
    echo -e "${YELLOW}Request: POST /api/auth/signup${NC}"
    echo -e "${YELLOW}Body: {\"username\":\"$USERNAME\",\"email\":\"$EMAIL\",\"password\":\"***\"}${NC}"
fi

SIGNUP_RESPONSE=$(curl -s -X POST $BASE_URL/api/auth/signup \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

if [ "$VERBOSE" = "true" ]; then
    echo -e "${YELLOW}Response:${NC}"
    echo "$SIGNUP_RESPONSE" | jq . 2>/dev/null || echo "$SIGNUP_RESPONSE"
fi

# Extract token from response
TOKEN=$(echo $SIGNUP_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ ! -z "$TOKEN" ]; then
    echo -e "${GREEN}✓ Signup successful${NC}"
    echo "  Token: ${TOKEN:0:20}..."
    ((PASSED++))
else
    echo -e "${RED}✗ Signup failed${NC}"
    echo "  Response: $SIGNUP_RESPONSE"
    ((FAILED++))
    FAILED_TESTS+=("User signup")
fi
echo ""

# Login with correct credentials
echo -e "${BLUE}Testing user login...${NC}"
((TOTAL++))

if [ "$VERBOSE" = "true" ]; then
    echo -e "${YELLOW}Request: POST /api/auth/login${NC}"
    echo -e "${YELLOW}Body: {\"email\":\"$EMAIL\",\"password\":\"***\"}${NC}"
fi

LOGIN_RESPONSE=$(curl -s -X POST $BASE_URL/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

if [ "$VERBOSE" = "true" ]; then
    echo -e "${YELLOW}Response:${NC}"
    echo "$LOGIN_RESPONSE" | jq . 2>/dev/null || echo "$LOGIN_RESPONSE"
fi

LOGIN_TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ ! -z "$LOGIN_TOKEN" ]; then
    echo -e "${GREEN}✓ Login successful${NC}"
    TOKEN=$LOGIN_TOKEN  # Use login token for subsequent requests
    ((PASSED++))
else
    echo -e "${RED}✗ Login failed${NC}"
    echo "  Response: $LOGIN_RESPONSE"
    ((FAILED++))
    FAILED_TESTS+=("User login")
fi
echo ""

# Login with wrong password
echo -e "${BLUE}Testing login with wrong password...${NC}"
((TOTAL++))

if [ "$VERBOSE" = "true" ]; then
    echo -e "${YELLOW}Request: POST /api/auth/login (with wrong password)${NC}"
fi

WRONG_LOGIN_RESPONSE=$(curl -s -X POST $BASE_URL/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"wrongpass\"}")

if [ "$VERBOSE" = "true" ]; then
    echo -e "${YELLOW}Response:${NC}"
    echo "$WRONG_LOGIN_RESPONSE" | jq . 2>/dev/null || echo "$WRONG_LOGIN_RESPONSE"
fi

if echo "$WRONG_LOGIN_RESPONSE" | grep -q "error"; then
    echo -e "${GREEN}✓ Login with wrong password correctly rejected${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗ Login validation failed${NC}"
    ((FAILED++))
    FAILED_TESTS+=("Login with wrong password")
fi
echo ""

# Create post (without auth - should fail)
echo -e "${BLUE}Testing create post without authentication...${NC}"
((TOTAL++))

if [ "$VERBOSE" = "true" ]; then
    echo -e "${YELLOW}Request: POST /api/posts (without auth)${NC}"
fi

RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE_URL/api/posts \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Post","content":"This should fail"}')

if [ "$VERBOSE" = "true" ]; then
    echo -e "${YELLOW}Response Code: $RESPONSE${NC}"
fi

if [ "$RESPONSE" -eq 401 ]; then
    echo -e "${GREEN}✓ Protected route correctly requires authentication${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗ Protected route failed (HTTP $RESPONSE)${NC}"
    ((FAILED++))
    FAILED_TESTS+=("Protected route without auth")
fi
echo ""

# Create post (with auth)
if [ ! -z "$TOKEN" ]; then
    echo -e "${BLUE}Testing create post with authentication...${NC}"
    ((TOTAL++))
    
    if [ "$VERBOSE" = "true" ]; then
        echo -e "${YELLOW}Request: POST /api/posts${NC}"
        echo -e "${YELLOW}Headers: Authorization: Bearer ${TOKEN:0:20}...${NC}"
    fi
    
    POST_RESPONSE=$(curl -s -X POST $BASE_URL/api/posts \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      -d '{"title":"My First Post","content":"Hello from the API test!"}')

    if [ "$VERBOSE" = "true" ]; then
        echo -e "${YELLOW}Response:${NC}"
        echo "$POST_RESPONSE" | jq . 2>/dev/null || echo "$POST_RESPONSE"
    fi

    # Extract post ID from response
    POST_ID=$(echo $POST_RESPONSE | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2 | tr -d ',')

    if [ ! -z "$POST_ID" ]; then
        echo -e "${GREEN}✓ Post created successfully${NC}"
        echo "  Post ID: $POST_ID"
        ((PASSED++))
    else
        echo -e "${RED}✗ Post creation failed${NC}"
        echo "  Response: $POST_RESPONSE"
        ((FAILED++))
        FAILED_TESTS+=("Create post with auth")
    fi
    echo ""

    # Get all posts
    echo -e "${BLUE}Testing get all posts...${NC}"
    ((TOTAL++))
    
    if [ "$VERBOSE" = "true" ]; then
        echo -e "${YELLOW}Request: GET /api/posts${NC}"
    fi
    
    ALL_POSTS=$(curl -s $BASE_URL/api/posts)
    
    if [ "$VERBOSE" = "true" ]; then
        echo -e "${YELLOW}Response:${NC}"
        echo "$ALL_POSTS" | jq . 2>/dev/null || echo "$ALL_POSTS"
    fi
    
    if echo "$ALL_POSTS" | grep -q "id"; then
        echo -e "${GREEN}✓ Get all posts successful${NC}"
        ((PASSED++))
    else
        echo -e "${RED}✗ Get all posts failed${NC}"
        ((FAILED++))
        FAILED_TESTS+=("Get all posts")
    fi
    echo ""

    # Get single post
    if [ ! -z "$POST_ID" ]; then
        echo -e "${BLUE}Testing get single post...${NC}"
        ((TOTAL++))
        
        if [ "$VERBOSE" = "true" ]; then
            echo -e "${YELLOW}Request: GET /api/posts/$POST_ID${NC}"
        fi
        
        SINGLE_POST=$(curl -s $BASE_URL/api/posts/$POST_ID)
        
        if [ "$VERBOSE" = "true" ]; then
            echo -e "${YELLOW}Response:${NC}"
            echo "$SINGLE_POST" | jq . 2>/dev/null || echo "$SINGLE_POST"
        fi
        
        if echo "$SINGLE_POST" | grep -q "My First Post"; then
            echo -e "${GREEN}✓ Get single post successful${NC}"
            ((PASSED++))
        else
            echo -e "${RED}✗ Get single post failed${NC}"
            ((FAILED++))
            FAILED_TESTS+=("Get single post")
        fi
        echo ""

        # Like post
        echo -e "${BLUE}Testing like post...${NC}"
        ((TOTAL++))
        
        if [ "$VERBOSE" = "true" ]; then
            echo -e "${YELLOW}Request: POST /api/posts/$POST_ID/like${NC}"
        fi
        
        LIKE_RESPONSE=$(curl -s -X POST $BASE_URL/api/posts/$POST_ID/like)
        
        if [ "$VERBOSE" = "true" ]; then
            echo -e "${YELLOW}Response:${NC}"
            echo "$LIKE_RESPONSE" | jq . 2>/dev/null || echo "$LIKE_RESPONSE"
        fi
        
        if echo "$LIKE_RESPONSE" | grep -q "likes"; then
            echo -e "${GREEN}✓ Like post successful${NC}"
            ((PASSED++))
        else
            echo -e "${RED}✗ Like post failed${NC}"
            ((FAILED++))
            FAILED_TESTS+=("Like post")
        fi
        echo ""

        # Update post
        echo -e "${BLUE}Testing update post...${NC}"
        ((TOTAL++))
        
        if [ "$VERBOSE" = "true" ]; then
            echo -e "${YELLOW}Request: PUT /api/posts/$POST_ID${NC}"
            echo -e "${YELLOW}Headers: Authorization: Bearer ${TOKEN:0:20}...${NC}"
        fi
        
        UPDATE_RESPONSE=$(curl -s -X PUT $BASE_URL/api/posts/$POST_ID \
          -H "Content-Type: application/json" \
          -H "Authorization: Bearer $TOKEN" \
          -d '{"title":"Updated Post","content":"This post has been updated"}')

        if [ "$VERBOSE" = "true" ]; then
            echo -e "${YELLOW}Response:${NC}"
            echo "$UPDATE_RESPONSE" | jq . 2>/dev/null || echo "$UPDATE_RESPONSE"
        fi

        if echo "$UPDATE_RESPONSE" | grep -q "Updated Post"; then
            echo -e "${GREEN}✓ Update post successful${NC}"
            ((PASSED++))
        else
            echo -e "${RED}✗ Update post failed${NC}"
            ((FAILED++))
            FAILED_TESTS+=("Update post")
        fi
        echo ""

        # Delete post
        echo -e "${BLUE}Testing delete post...${NC}"
        ((TOTAL++))
        
        if [ "$VERBOSE" = "true" ]; then
            echo -e "${YELLOW}Request: DELETE /api/posts/$POST_ID${NC}"
            echo -e "${YELLOW}Headers: Authorization: Bearer ${TOKEN:0:20}...${NC}"
        fi
        
        DELETE_RESPONSE=$(curl -s -X DELETE $BASE_URL/api/posts/$POST_ID \
          -H "Authorization: Bearer $TOKEN")

        if [ "$VERBOSE" = "true" ]; then
            echo -e "${YELLOW}Response:${NC}"
            echo "$DELETE_RESPONSE" | jq . 2>/dev/null || echo "$DELETE_RESPONSE"
        fi

        if echo "$DELETE_RESPONSE" | grep -q "deleted successfully"; then
            echo -e "${GREEN}✓ Delete post successful${NC}"
            ((PASSED++))
        else
            echo -e "${RED}✗ Delete post failed${NC}"
            ((FAILED++))
            FAILED_TESTS+=("Delete post")
        fi
        echo ""
    fi

    # Test user profile endpoints
    echo -e "${BLUE}Testing get user profile...${NC}"
    ((TOTAL++))
    
    if [ "$VERBOSE" = "true" ]; then
        echo -e "${YELLOW}Request: GET /api/users/me${NC}"
        echo -e "${YELLOW}Headers: Authorization: Bearer ${TOKEN:0:20}...${NC}"
    fi
    
    PROFILE_RESPONSE=$(curl -s -X GET $BASE_URL/api/users/me \
      -H "Authorization: Bearer $TOKEN")

    if [ "$VERBOSE" = "true" ]; then
        echo -e "${YELLOW}Response:${NC}"
        echo "$PROFILE_RESPONSE" | jq . 2>/dev/null || echo "$PROFILE_RESPONSE"
    fi

    if echo "$PROFILE_RESPONSE" | grep -q "username"; then
        echo -e "${GREEN}✓ Get user profile successful${NC}"
        ((PASSED++))
    else
        echo -e "${RED}✗ Get user profile failed${NC}"
        ((FAILED++))
        FAILED_TESTS+=("Get user profile")
    fi
    echo ""

    # Test search posts
    echo -e "${BLUE}Testing search posts...${NC}"
    ((TOTAL++))
    
    if [ "$VERBOSE" = "true" ]; then
        echo -e "${YELLOW}Request: GET /api/posts/search?q=post${NC}"
    fi
    
    SEARCH_RESPONSE=$(curl -s "$BASE_URL/api/posts/search?q=post")
    
    if [ "$VERBOSE" = "true" ]; then
        echo -e "${YELLOW}Response:${NC}"
        echo "$SEARCH_RESPONSE" | jq . 2>/dev/null || echo "$SEARCH_RESPONSE"
    fi
    
    if echo "$SEARCH_RESPONSE" | grep -q "id"; then
        echo -e "${GREEN}✓ Search posts successful${NC}"
        ((PASSED++))
    else
        echo -e "${RED}✗ Search posts failed${NC}"
        ((FAILED++))
        FAILED_TESTS+=("Search posts")
    fi
    echo ""
fi

# Summary
echo "==================================="
echo "Test Results"
echo "==================================="
echo -e "${BLUE}Total:  $TOTAL${NC}"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo "==================================="

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed! 🎉${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed!${NC}"
    echo ""
    echo -e "${YELLOW}Failed tests:${NC}"
    for test in "${FAILED_TESTS[@]}"; do
        echo -e "${RED}  ✗ $test${NC}"
    done
    echo ""
    echo -e "${YELLOW}Tip: Run with VERBOSE=true for detailed output:${NC}"
    echo -e "${BLUE}  VERBOSE=true ./test-api.sh${NC}"
    exit 1
fi