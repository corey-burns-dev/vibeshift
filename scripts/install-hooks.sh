#!/bin/sh
set -e

HOOK_DIR=".githooks"

if [ ! -d "$HOOK_DIR" ]; then
  echo "Creating $HOOK_DIR"
  mkdir -p "$HOOK_DIR"
fi

git config core.hooksPath "$HOOK_DIR"
echo "Git hooks configured: core.hooksPath -> $HOOK_DIR"
echo "Ensure you commit the hook files and run this script once after cloning."

exit 0
