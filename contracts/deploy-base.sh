#!/usr/bin/env bash
# Deploys QRushCheckout to Base mainnet and verifies it on Basescan.
# Required env: DEPLOYER_PRIVATE_KEY, BASESCAN_API_KEY. Optional: BASE_RPC_URL.
set -euo pipefail
cd "$(dirname "$0")"
: "${DEPLOYER_PRIVATE_KEY:?set DEPLOYER_PRIVATE_KEY}"
: "${BASESCAN_API_KEY:?set BASESCAN_API_KEY}"
export BASE_RPC_URL="${BASE_RPC_URL:-https://mainnet.base.org}"
forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$BASE_RPC_URL" \
  --private-key "$DEPLOYER_PRIVATE_KEY" \
  --broadcast \
  --verify --etherscan-api-key "$BASESCAN_API_KEY" --chain 8453 \
  -vvv
