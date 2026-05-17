#!/usr/bin/env python3
"""
格式化 Solana 交易数据，只显示关键信息。

用法:
  python3 scripts/format-tx.py <TX_SIGNATURE>
  python3 scripts/format-tx.py 5jprUvD18ScX8R3qDTruCJux12YnJoc9cmADvC4vtmUwEcaVtGu5Xh2hKNnM5X6S1y2eJcnpDqADnj5HRtuprMBN
"""

import json, sys, urllib.request
from datetime import datetime, timezone

RPC = os.environ.get("ANCHOR_PROVIDER_URL", "https://devnet.helius-rpc.com")

LABELS = {
    "CjnKTv7fxuEDU91n1nkcLe536kfbvV7o4cA9mJAA68Ue": "Party A (signer)",
    "A7XDkScUEunJ59cZeBJGA1WivnSc2QDp3jB5ugEf5vgR": "Party B",
    "6n1NbHJuEkyaJZtnHqrExBk2BD6HyujvntbTE5ZSeX9r": "nexum_pool",
    "HBjtDNTL5cj6oc97Gno14x8GjL6LNsZ26iRK4v52KjDA": "zk_verifier",
    "CNM1YpLiFdeKj2MC3F6q18fUhpCkADXScGciz9C7Lmm5": "ProtocolConfig",
    "11111111111111111111111111111111": "System Program",
    "ComputeBudget111111111111111111111111111111": "ComputeBudget",
}

def fetch_tx(sig):
    body = json.dumps({
        "jsonrpc": "2.0", "id": 1,
        "method": "getTransaction",
        "params": [sig, {"encoding": "jsonParsed", "maxSupportedTransactionVersion": 0}]
    }).encode()
    req = urllib.request.Request(RPC, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())["result"]

def main():
    sig = sys.argv[1] if len(sys.argv) > 1 else sys.exit(1)
    tx = fetch_tx(sig)
    if not tx:
        print("Transaction not found"); sys.exit(1)

    meta = tx["meta"]
    msg = tx["transaction"]["message"]
    keys = [k if isinstance(k, str) else k["pubkey"] for k in msg["accountKeys"]]
    pre = meta["preBalances"]
    post = meta["postBalances"]

    # Header
    print("╔══════════════════════════════════════════════════════════╗")
    print("║               TRANSACTION DETAILS                        ║")
    print("╚══════════════════════════════════════════════════════════╝")
    print()
    print(f"  Signature:  {sig[:50]}...")
    print(f"  Slot:       {tx['slot']}")
    print(f"  Time:       {datetime.fromtimestamp(tx['blockTime'], tz=timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print(f"  Fee:        {meta['fee']} lamports ({meta['fee']/1e9:.6f} SOL)")
    print(f"  CU Used:    {meta['computeUnitsConsumed']}")
    print(f"  Status:     {'FAILED: ' + str(meta['err']) if meta['err'] else 'SUCCESS ✓'}")

    # Accounts
    print()
    print("── Accounts ──────────────────────────────────────────────")
    for i, k in enumerate(keys):
        label = LABELS.get(k, "")
        diff = post[i] - pre[i]
        diff_str = f" ({'+' if diff > 0 else ''}{diff} lamports)" if diff else ""
        print(f"  [{i}] {k}")
        if label:
            print(f"      ↳ {label}")
        print(f"      Balance: {pre[i]} → {post[i]}{diff_str}")

    # Program Logs
    print()
    print("── Program Logs ──────────────────────────────────────────")
    for log in meta.get("logMessages", []):
        if "ComputeBudget" in log:
            continue
        if "invoke [1]" in log:
            print(f"  ▶ {log}")
        elif "success" in log:
            print(f"  ✓ {log}")
        elif "PASSED" in log or "verified" in log.lower():
            print(f"  ★ {log}")
        elif "settled" in log:
            print(f"  ★ {log}")
        elif "Instruction:" in log:
            print(f"  ◆ {log}")
        elif "Program data:" in log:
            print(f"  ◌ Program data: [{len(log)-14} bytes encoded]")
        else:
            print(f"    {log}")

    # Summary
    print()
    print("── Summary ───────────────────────────────────────────────")
    settle_log = [l for l in meta.get("logMessages", []) if "settled" in l]
    if settle_log:
        import re
        m = re.search(r"settled (\w+) <-> (\w+)", settle_log[0])
        if m:
            print(f"  Settlement: {m.group(1)[:12]}... ↔ {m.group(2)[:12]}...")
    verify_count = len([l for l in meta.get("logMessages", []) if "PASSED" in l])
    print(f"  ZK Proofs Verified: {verify_count}")
    print(f"  Compute Units: {meta['computeUnitsConsumed']}")
    print()

main()
