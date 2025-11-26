#!/usr/bin/env bash
set -euo pipefail

# This script fully tests the backend: starts test DB, seeds, runs tests, and shows results.

# Start test DB and Redis
make test-up

# Wait for DB and seed
make test-db-setup

# Run Go backend tests and capture output
set +e
go test -v ./backend/test/... | tee backend_test_output.log
TEST_EXIT_CODE=${PIPESTATUS[0]}
set -e

# Show summary
if [ $TEST_EXIT_CODE -eq 0 ]; then
  echo -e "\033[1;32mAll backend tests passed!\033[0m"
else
  echo -e "\033[1;31mSome backend tests failed. See backend_test_output.log for details.\033[0m"
fi

# Stop test DB
make test-down

exit $TEST_EXIT_CODE
