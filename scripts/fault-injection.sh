#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Starting Fault Injection Drill...${NC}"

# 1. Redis Restart
echo -e "${BLUE}Injecting Redis failure...${NC}"
docker compose restart redis
sleep 5
echo -e "${GREEN}Redis restarted. Checking app health...${NC}"
curl -s http://localhost:8080/health | grep "UP" || (echo -e "${RED}App unhealthy after Redis restart${NC}"; exit 1)

# 2. App Container Restart
echo -e "${BLUE}Injecting App container restart...${NC}"
docker compose restart app
sleep 10
echo -e "${GREEN}App restarted. Checking app health...${NC}"
curl -s http://localhost:8080/health | grep "UP" || (echo -e "${RED}App unhealthy after restart${NC}"; exit 1)

# 3. DB Brief Unavailability
echo -e "${BLUE}Pausing Postgres...${NC}"
docker pause sanctum-postgres
sleep 5
echo -e "${BLUE}Unpausing Postgres...${NC}"
docker unpause sanctum-postgres
sleep 5
echo -e "${GREEN}Postgres recovered. Checking app health...${NC}"
curl -s http://localhost:8080/health | grep "UP" || (echo -e "${RED}App unhealthy after DB recovery${NC}"; exit 1)

echo -e "${GREEN}✓ Fault injection drill completed successfully${NC}"
