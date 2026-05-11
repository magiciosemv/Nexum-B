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

if [ -z "$1" ]; then
  echo "Usage: ./devnet-auto-accept.sh <LEDGER_A_ADDRESS>"
  echo ""
  echo "  LEDGER_A_ADDRESS: The PDA of the initiator's UserLedger"
  echo "  Derive with: node -e \"const {PublicKey}=require('@solana/web3.js'); const [a]=PublicKey.findProgramAddressSync([Buffer.from('ledger'),new PublicKey('<OWNER>').toBuffer(),new PublicKey('<MINT>').toBuffer()],new PublicKey('6n1NbHJuEkyaJZtnHqrExBk2BD6HyujvntbTE5ZSeX9r')); console.log(a.toBase58());\""
  exit 1
fi

echo "Starting auto-accept for Ledger A: $1"
echo ""
cd "$PROJECT_ROOT"
node "$SCRIPT_DIR/auto-accept.js" "$1"
