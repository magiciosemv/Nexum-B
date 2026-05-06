#!/bin/bash
#
# devnet-auto-accept.sh — Wrapper for auto-accept.js
#
# Usage: ./devnet-auto-accept.sh
#
# Proxy and RPC are read from .env by the JS script.
#
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Ensure @solana/web3.js and anchor resolve
export NODE_PATH="$PROJECT_ROOT/app/node_modules"

echo "Starting auto-accept..."
echo ""
cd "$PROJECT_ROOT"
node "$SCRIPT_DIR/auto-accept.js"
