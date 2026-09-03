# Runbook

Everything here was executed successfully on 2026-09-03. These are not
proposed commands.

## Prerequisites

| Tool | Verified version |
| --- | --- |
| Node | 22.14.0 |
| pnpm | 9+ |
| Foundry (`forge`, `cast`, `anvil`) | 1.7.1 |
| Docker | Postgres and Redis |

## Chain endpoints

```bash
# Mainnet - the one that works
export RPC_MAINNET=https://rpc.mainnet.chain.robinhood.com   # chain 4663 (0x1237)

# Testnet
export RPC_TESTNET=https://rpc.testnet.chain.robinhood.com   # chain 46630 (0xb626)

# Local fork - all development happens here
export RPC_LOCAL=http://127.0.0.1:8545
```

Endpoints checked and **not** usable:

| Endpoint | Result |
| --- | --- |
| `rpc.chain.robinhood.com` | No response |
| `robinhood.drpc.org` | Responds to `eth_chainId` only; `eth_call` and `eth_getCode` blocked without a key |
| `rpc.ankr.com/robinhood` | 403, API key required |
| `robinhoodchain.blockscout.com/api/eth-rpc` | Cloudflare challenge |

Explorers: [robinscan.io](https://robinscan.io),
[robinhoodchain.blockscout.com](https://robinhoodchain.blockscout.com)

> **The mainnet RPC is unreliable.** Roughly 30% of calls failed intermittently
> with transport errors under light manual load. Retry logic is not optional,
> and running our own node should be costed early.

## Local development chain

Fork mainnet. This gives real contracts, real launches and real liquidity, with
free ETH.

### Step 1: start the RPC proxy, required, not optional

```bash
node tools/rpc-proxy.mjs        # listens on http://127.0.0.1:8546
```

Two upstream problems make this mandatory for any Foundry work:

**TLS.** The endpoint sits behind a load balancer where at least one node
presents a certificate chain that Foundry's TLS stack (rustls) rejects:

```
Error: error sending request for url (https://rpc.mainnet.chain.robinhood.com/)
- Error #1: invalid peer certificate: Expired
```

The certificate itself is valid, `notBefore Aug 28 2026`, `notAfter Nov 26
2026`, issued by Cloudflare TLS Issuing ECC CA 4, and `curl` and Node both
accept it. Only Foundry rejects it, and only when routed to certain nodes.
Once that starts happening, `anvil --fork-url https://...` and `forge script`
both fail outright. Proxying over plain HTTP on localhost removes Foundry's TLS
stack from the path entirely.

**Flakiness.** Roughly 30% of upstream calls fail with transport errors under
light load. The proxy retries with backoff so a single bad response never
surfaces as a failed fork or a failed deployment. It also prints a running
failure rate every 30 seconds, which is where the numbers in this document
come from.

### Step 2: fork, pinned to a block behind head

```bash
HEAD=$(cast block-number --rpc-url http://127.0.0.1:8546)
anvil --fork-url http://127.0.0.1:8546 --fork-block-number $((HEAD-50)) --port 8545 --silent
```

**Pin the block.** The public node is not an archive node. Forking at head
works for a minute and then starts failing as state is pruned:

```
error code -32000: metadata is not found, 53574018
```

Pinning 50 blocks back gives a stable window. Re-fork when it goes stale.

Chain id is preserved as `4663`. Anvil funds ten accounts with 10,000 ETH.

### Trap: anvil's default accounts have code on this chain

Several of anvil's standard test addresses are **contracts** on Robinhood Chain
mainnet, and the fork keeps that code. Sending an ERC-721 to one fails:

```
ERC721InvalidReceiver(0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC)
```

This is a fork artifact, not a contract bug. For anything involving `_safeMint`,
use an address with no code and fund it directly:

```bash
BUYER=0x00000000000000000000000000000000000B0B0B
cast codesize $BUYER --rpc-url $RPC_LOCAL        # must be 0
cast rpc anvil_setBalance $BUYER 0x21E19E0C9BAB2400000 --rpc-url $RPC_LOCAL
cast rpc anvil_impersonateAccount $BUYER --rpc-url $RPC_LOCAL
```

### Killing a stale fork

`pkill -f anvil` is unreliable on Windows. Use:

```bash
taskkill //F //IM anvil.exe
```

Account 0 (used in every example below):

```
address 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
key     0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

## Reading live state

```bash
export RPC=https://rpc.mainnet.chain.robinhood.com
export FACTORY=0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e

cast call $FACTORY "launchFee()(uint256)"        --rpc-url $RPC   # 500000000000000
cast call $FACTORY "maxCreatorTaxBps()(uint16)"  --rpc-url $RPC   # 1000
cast call $FACTORY "launchConfigCount()(uint256)" --rpc-url $RPC  # 1
cast call $FACTORY "canLaunch(address)(bool)" 0x000000000000000000000000000000000000dEaD --rpc-url $RPC   # true
cast call $FACTORY "getLaunchConfig(uint256)" 0  --rpc-url $RPC
```

## Launching a token on the fork

The full sequence, verified working.

```bash
export RPC=http://127.0.0.1:8545
export FACTORY=0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e
export PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
export ME=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

# 1. Pin the economics. Required, or the launch reverts with LaunchEconomicsMismatch.
ECO=$(cast call $FACTORY "previewLaunchEconomics(uint256,address)(bytes32)" \
      0 0x0000000000000000000000000000000000000000 --rpc-url $RPC)

# 2. Any 32 random bytes.
SALT=0x2222222222222222222222222222222222222222222222222222222222222222

# 3. Launch. value must equal launchFee() exactly.
cast send $FACTORY \
  "launchToken((string,string,string,string,(string,string,string,string,string),address,uint16,bool,bytes32,bytes32),uint256,address)" \
  "(\"Puns Test\",\"PUNS\",\"ipfs://puns\",\"description\",(\"puns\",\"\",\"\",\"\",\"\"),$ME,250,true,$ECO,$SALT)" \
  0 0x0000000000000000000000000000000000000000 \
  --private-key $PK --value 500000000000000 --rpc-url $RPC
```

Result: `status 0x1`, `gasUsed 3529499`, 5 logs.

Token and curve addresses come from the `TokenLaunched` log,
topic0 `0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607`,
with the token in topic1 and the curve in topic2.

### Argument encoding note

`TokenParams` is a nested tuple. `cast` needs the full flattened signature and
the value as a parenthesised tuple with the `Socials` tuple nested inside.
Getting this wrong produces an ABI error, not a revert, that distinction is
useful when debugging.

## Buying on the fork

```bash
export CURVE=<curve address from the launch>

cast call $CURVE "getReserves()(uint256,uint256)"    --rpc-url $RPC
cast call $CURVE "feeBps()(uint256)"                 --rpc-url $RPC
cast call $CURVE "creatorTaxBps()(uint256)"          --rpc-url $RPC
cast call $CURVE "currentSnipeTaxBps(address)(uint256)" $ME --rpc-url $RPC

cast send $CURVE "buy(uint256,uint256,address)" \
  100000000000000000 0 $ME \
  --value 100000000000000000 --private-key $PK --rpc-url $RPC
```

A fresh curve always reports reserves `1680000000000000000 / 1000000000000000000000000000`.

### Verifying the quote engine

Reference computation, matching contract output exactly:

```python
BPS = 10000
qin, fee_bps, tax_bps, snipe_bps = 10**17, 100, 250, 0
qr, tr = 1680000000000000000, 10**27

net = qin - qin*fee_bps//BPS - qin*tax_bps//BPS - qin*snipe_bps//BPS
print(net * tr // (qr + net))   # 54320292710385589642555586
```

Then compare against `balanceOf` after the buy. They must be **identical**.

## Testing the opening-window tax

```bash
# Launcher is exempt automatically
cast call $CURVE "currentSnipeTaxBps(address)(uint256)" $ME --rpc-url $RPC       # 0

# Any other address pays 99% in the first moments
cast call $CURVE "currentSnipeTaxBps(address)(uint256)" \
  0x70997970C51812dc3A010C7d01b50e0d17dc79C8 --rpc-url $RPC                     # 9900
```

To watch the decay, advance fork time between reads:

```bash
cast rpc evm_increaseTime 1 --rpc-url $RPC
cast rpc evm_mine --rpc-url $RPC
```

## Inspecting a real launch

A live example on mainnet at the time of writing:

```
token  0x1e8061bfa598496c80498553a335e3e0ccf7e629   "sixtysec" / SIXTYSEC
curve  0x8d7138289154d86fecad1e40828e1e81153a32dd
```

```bash
export RPC=https://rpc.mainnet.chain.robinhood.com
cast call 0x1e8061bfa598496c80498553a335e3e0ccf7e629 "name()(string)" --rpc-url $RPC
cast call 0x8d7138289154d86fecad1e40828e1e81153a32dd "sellableTokens()(uint256)" --rpc-url $RPC
```

## Scanning for launches

```bash
LATEST=$(cast block-number --rpc-url $RPC)
cast logs --rpc-url $RPC \
  --from-block $((LATEST-200000)) --to-block latest \
  --address $FACTORY \
  $(cast keccak "TokenLaunched(address,address,address,address,uint256,uint256)")
```

Keep ranges under ~200k blocks; larger requests time out against the public RPC.

## Local services

```bash
docker compose up -d postgres redis
pnpm db:migrate
pnpm dev            # web on :3000, indexer against the fork
```

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `error sending request for url` | Flaky public RPC | Retry. Expected roughly 30% of the time. |
| `insufficient funds for gas * price + value` | Unfunded `--from` in an `eth_call` | Use a funded fork account |
| `LaunchEconomicsMismatch` | Stale `expectedEconomics` | Re-read `previewLaunchEconomics` immediately before sending |
| `LaunchFeeNotPaid` | Wrong `--value` | Read `launchFee()` live; never hardcode |
| ABI encoding error on launch | Malformed nested tuple | Check the `Socials` tuple nesting in the argument |
| Quote does not match | Priced against `realQuoteReserve()` | Use `getReserves()` |
| Quote off by a large factor | Snipe tax ignored | Pass the real recipient to `currentSnipeTaxBps` |

---

## Deploying PunsPass

Verified end to end on a fork of chain 4663 on 2026-09-04.

### Dry run, simulation only, nothing broadcast

```bash
export PUNS_OWNER=0x...
export PUNS_TREASURY=0x...
export PUNS_PASS_BASE_URI=https://punsfun.app/pass/
export PUNS_PASS_CREATOR_PRICE=50000000000000000    # 0.05 ETH, optional
export PUNS_PASS_PRO_PRICE=20000000000000000        # 0.02 ETH, optional
export PUNS_PASS_PRO_DURATION=2592000               # 30 days, optional

cd packages/contracts
forge script script/DeployPunsPass.s.sol \
  --rpc-url http://127.0.0.1:8545 --sender $PUNS_OWNER
```

Measured result on chain 4663:

```
Estimated gas price          0.767880001 gwei
Estimated total gas used     4,075,241
Estimated amount required    0.003129296063155241 ETH
```

Leaving the price variables unset deploys with both tiers withdrawn from sale,
which is the correct state until pricing is decided. `setTerms` opens them later
without a redeployment.

### Broadcast to the fork

```bash
forge script script/DeployPunsPass.s.sol \
  --rpc-url http://127.0.0.1:8545 --private-key $PK --broadcast
```

> `forge script --broadcast` waits for receipts and can exceed two minutes
> through the proxy. If it times out, the transactions have usually landed
> anyway, check `broadcast/DeployPunsPass.s.sol/4663/run-latest.json` for the
> address and verify with `cast codesize` before re-running.

### Broadcast to mainnet

```bash
export RPC_MAINNET=https://rpc.mainnet.chain.robinhood.com
forge script script/DeployPunsPass.s.sol \
  --rpc-url $RPC_MAINNET --private-key $DEPLOYER_PRIVATE_KEY --broadcast
```

Then set `NEXT_PUBLIC_PUNS_PASS_ADDRESS` in the app environment.

> Prefer `--rpc-url http://127.0.0.1:8546` (the proxy) over the raw HTTPS
> endpoint here too, for the TLS reason above.

### Post-deploy verification

```bash
A=<deployed address>
cast call $A "name()(string)"              --rpc-url $RPC
cast call $A "owner()(address)"            --rpc-url $RPC
cast call $A "treasury()(address)"         --rpc-url $RPC
cast call $A "termsOf(uint8)(uint256,uint64)" 1 --rpc-url $RPC   # Creator
cast call $A "termsOf(uint8)(uint256,uint64)" 2 --rpc-url $RPC   # Pro
cast balance $A --rpc-url $RPC                                   # must be 0
```

Confirmed on the fork, minting a Creator pass while overpaying by 1 ETH:

```
status            1
gasUsed           138,612
ownerOf(1)        the buyer
isActive(1)       true
expiresAt(1)      0            lifetime
tiersOf(buyer)    true false   creator yes, pro no
tokenURI(1)       https://punsfun.app/pass/1
contract balance  0 wei        overpayment refunded, price forwarded
pendingTreasury   0
```

A bare ETH transfer to the contract reverts with `DirectPaymentRejected`
(selector `0x4914957a`), verified on the fork.

### Contract size

```
runtime  12,935 bytes    (limit 24,576)
initcode 13,909 bytes
```

## Running the contract test suite

```bash
cd packages/contracts
forge test                  # 44 unit + fuzz tests, 4 invariants
forge test --gas-report
```

No fork is required: PunsPass has no dependency on chain state. The invariant
suite drives 8,192 random calls across mint, renew, grant, transfer, setTerms,
forced payment and time warps, asserting throughout that the contract holds
nothing it has not booked as owed.
