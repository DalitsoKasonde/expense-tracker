#!/bin/bash

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Load API .env
if [ -f api/.env ]; then
  export $(cat api/.env | xargs)
fi

echo -e "${BLUE}Running migrations...${NC}"
cd api
go run ./cmd/migrate up
cd ..

echo -e "${GREEN}Starting API server...${NC}"
cd api
go run ./cmd/api &
API_PID=$!
cd ..

echo -e "${GREEN}Starting web server...${NC}"
cd web
NODE_OPTIONS=--openssl-legacy-provider npm run dev &
WEB_PID=$!
cd ..

echo -e "${GREEN}Both servers running:${NC}"
echo -e "  Frontend: ${BLUE}http://localhost:3000${NC}"
echo -e "  Backend:  ${BLUE}http://localhost:8080${NC}"
echo ""
echo "Press Ctrl+C to stop both servers"

# Handle cleanup on exit
trap "kill $API_PID $WEB_PID 2>/dev/null; exit" INT TERM

wait
