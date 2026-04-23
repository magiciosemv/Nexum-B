#!/usr/bin/env bash
# run_unit_tests.sh — Sequential unit test runner for Nexum Protocol
#
# WSL2 has a known issue where concurrent WebAssembly.compile() across
# processes causes SIGSEGV. This script runs all TypeScript unit tests
# sequentially to avoid the crash.
#
# Usage: bash scripts/run_unit_tests.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
NODE_PATH="${NODE_PATH:-/home/magic/.nvm/versions/node/v20.20.0/lib/node_modules}"

cd "$PROJECT_ROOT"

PASS=0
FAIL=0
TOTAL=0

run_test() {
  local name="$1"
  shift
  TOTAL=$((TOTAL + 1))
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "[$TOTAL] $name"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  if "$@"; then
    PASS=$((PASS + 1))
    echo "[PASS] $name"
  else
    FAIL=$((FAIL + 1))
    echo "[FAIL] $name"
  fi
}

echo "=== Nexum Protocol — Sequential Unit Test Runner ==="
echo "Node: $(node --version)"
echo "NODE_PATH: $NODE_PATH"
echo ""

# 1. Commitment consistency (6 tests)
run_test "Commitment Hash Consistency (6 tests)" \
  npx ts-node tests/commitment_consistency.test.ts

# 2. ElGamal encryption (7 tests)
run_test "ElGamal Encryption (7 tests)" \
  npx ts-node tests/elgamal.test.ts

# 3. Prover integration (7 tests — slow, ~30s)
run_test "Prover Integration (7 tests)" \
  env NODE_PATH="$NODE_PATH" npx ts-node tests/worker_prover.test.ts

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Results: $PASS/$TOTAL passed, $FAIL failed"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
