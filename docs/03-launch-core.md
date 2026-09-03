# Launch core integration spec

> **INTERNAL ENGINEERING DOCUMENT.**
> The launch mechanics described here are provided by an existing permissionless
> protocol deployed on Robinhood Chain (upstream: Pons v2). Puns integrates with
> it the same way any interface integrates with a public on-chain protocol.
> This provenance is recorded once, here, because engineers need it to reason
> about behaviour we do not control and cannot change.
>
> It appears in no user-facing surface. See [00-index.md](00-index.md).
>
> Two hard rules: we do not present upstream security audits as ours, and we do
> not describe these mechanics as protocol design authored by Puns.
> Referring to this layer as "the launch core" in code and conversation is the
> convention.

## Verification status

Every value below was read from live chain state on **2026-09-03** at block
~53,574,000 using Foundry `cast`. Nothing here is copied from documentation.

**The upstream documentation is stale and contradicts the chain.** It states
"Public launches are closed, so only whitelisted addresses can create a token."
This is false as of the verification date:

```
cast call $FACTORY "canLaunch(address)(bool)" 0x...dEaD  ->  true
```

A full `launchToken` transaction was then executed successfully on an Anvil fork
of mainnet from an arbitrary account. **Launching is open.** Treat upstream
documentation as a hint and the chain as the source of truth.

Additionally, `launchConfigCount()` returns `1`, but the upstream document
describes configs as "an append-only list". Only config `0` exists today. Do
not hardcode `0` blindly; read the count and validate, because a future config
could change every economic constant in this file.

## Chain

| | |
| --- | --- |
| Name | Robinhood Chain |
| Chain id | 4663 (`0x1237`) |
| Testnet chain id | 46630 (`0xb626`) |
| Stack | Arbitrum Orbit rollup |
| Native gas token | ETH |
| Primary RPC | `https://rpc.mainnet.chain.robinhood.com` |
| Explorers | `https://robinscan.io`, `https://robinhoodchain.blockscout.com` |

RPC reliability is poor. See the resilience requirements in
[02-architecture.md](02-architecture.md).

## Contract addresses (chain 4663)

```
FACTORY              0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e   (24,177 bytes)
MEME_HOOK            0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044
FEE_ESCROW           0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e
BUYBACK_VAULT        0x42df2a798f82289E177311362e8f5ccC45c1219c
LAUNCH_LOCKER        0x267444D099b10fB5Ed7c3Cc7B7c767AdcA574952
LAUNCH_AND_BUY       0xe33E9E479dF8802cb0866d5d05258bEc4cF62948
LAUNCH_DEPLOYER      0x3711ceA4feaDE896C913C68F01Eda97Cb06D1A42
GRADUATION_EXECUTOR  0xC7819B64A1dAECD7eC19856d026cb14EfBd89046
GRADUATION_GUARD     0xf5695117b99B6f6401e67d4195BD653628176C6C
```

Factory owner: `0x263ed295dAFaE1d9AAdD6E56c4B6F9f38eE019Dd`

These live in `@puns/sdk` as `LAUNCH_CORE`, never inline anywhere else.

## Global factory parameters (verified)

| Call | Value | Meaning |
| --- | --- | --- |
| `launchFee()` | `500000000000000` | 0.0005 ETH per launch |
| `maxCreatorTaxBps()` | `1000` | 10% cap on creator tax |
| `launchConfigCount()` | `1` | Only config id 0 exists |
| `canLaunch(any)` | `true` | Launching is permissionless |
| `previewLaunchEconomics(0, 0x0)` | `0xa9fc75d4...1ca7` | Pin hash for ETH launches |

## Launch config 0 (verified, raw decode)

`getLaunchConfig(0)` returns nine words. Confirmed meanings:

| Word | Raw | Value | Meaning |
| --- | --- | --- | --- |
| 0 | `0x00...00` | `address(0)` | Default pair asset - native ETH |
| 1 | `0x033b2e3c9fd0803ce8000000` | `1e27` | Total supply, 1,000,000,000 @ 18 dp |
| 2 | `0x64` | `100` | Trading fee, 1.00% - matches `feeBps()` on live curves |
| 3 | `0x17508f1956a80000` | `1.68e18` | Virtual ("phantom") quote reserve |
| 4 | `0x3a4965bf58a40000` | `4.2e18` | Graduation threshold - matches `graduationThreshold()` |
| 5 | `0x00` | `0` | Unconfirmed |
| 6 | `0x00` | `0` | Unconfirmed |
| 7 | `0xc8` | `200` | Unconfirmed. Candidates: pool fee, or max internal price impact bps |
| 8 | `0x01` | `1` | Unconfirmed. Likely an enabled flag |

Words 5-8 are not needed for v1. Do not guess at them in code.

### Derived supply split (verified on a fresh curve)

```
totalSupply     1000000000000000000000000000    1,000,000,000
reservedTokens   285714285714285714285714285      285,714,285.71   (2/7, 28.57%)
sellableTokens   714285714285714285714285715      714,285,714.29   (5/7, 71.43%)
```

`reservedTokens()` was read directly from a freshly created curve and matches
exactly.

### The curve is constant-product with a virtual reserve

```
k = quoteReserve * tokenReserve = 1.68e18 * 1e27 = 1.68e45
```

Proof that the threshold is a consequence of the supply split, not an
independent setting:

```
after the curve sells out:
  tokenReserve = 285,714,285.71
  quoteReserve = k / tokenReserve = 1.68e9 / 2.857142857e8 = 5.88 ETH
  quote raised = 5.88 - 1.68 (virtual)              = 4.20 ETH
                                                       ^ equals graduationThreshold
```

Consequences that matter for the product:

- Opening price: `1.68 / 1e9` = **1.68 gwei per token**
- Graduation price: `5.88 / 285,714,285.71` = **20.58 gwei per token**
- **Every launch rises exactly 12.25x from open to graduation**
- Fully diluted value at graduation is always **~20.58 ETH**

This uniformity is the strongest thing we can teach a user, and it should be
stated plainly in the UI rather than buried.

## Launch lifecycle phases

`getLaunchedToken(token).phase`:

| Phase | Name | Meaning | UI routing |
| --- | --- | --- | --- |
| 0 | NotGraduated | Trading on the curve | Route trades to the curve |
| 1 | Swept | Curve closed, pool not created | Trading paused, show "graduating" |
| 2 | PoolCreated | Trading on Uniswap v4 | Route to the pool |
| 3 | Rescued | Recovery path used | **Warn prominently.** Permanent mark. |

Graduation normally completes inside the buy that fills the curve. If it fails,
`AutoGraduationFailed` is emitted and **anyone** can push it through. The
indexer must alert on this event, and the UI should offer a "complete
graduation" button - being the interface that unsticks launches is cheap
goodwill.

Phase 3 means a launch was stuck for seven days and collected funds were
returned. It is permanent and must never be presented as a normal launch.

## Writes

### Launch

```solidity
function launchToken(TokenParams params, uint256 launchConfigId, address pairToken)
  payable returns (address token, address curve)

struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }
struct TokenParams {
  string  name;
  string  symbol;
  string  logo;
  string  description;
  Socials socials;
  address creatorFeeRecipient;
  uint16  creatorTaxBps;
  bool    buybackEnabled;
  bytes32 expectedEconomics;
  bytes32 salt;
}
```

- `value` must equal `launchFee()` exactly, or `LaunchFeeNotPaid`
- `expectedEconomics` must come from `previewLaunchEconomics(configId, pairToken)`
  read in the same session, or `LaunchEconomicsMismatch`
- `salt` should be 32 random bytes
- `creatorTaxBps` must be `<= maxCreatorTaxBps()`, or `CreatorTaxTooHigh`

**Verified on an Anvil fork of mainnet:** succeeded, `status 0x1`,
**gasUsed 3,529,499**, emitting 5 logs including `TokenLaunched`. Budget for
~4.2M gas in the UI estimate.

### Launch and buy atomically

```solidity
function launchAndBuy(
  TokenParams params, uint256 launchConfigId, address pairToken,
  uint256 quoteIn, uint256 minTokensOut, address recipient,
  address[] snipeTaxExemptions
) payable returns (address token, address curve, uint256 tokensOut)
```

`value` = `launchFee() + quoteIn` for native launches.

**`snipeTaxExemptions` is fixed at creation and can never be extended.** The
create form must communicate this at the point of input.

### Trade

```solidity
function buy(uint256 quoteIn, uint256 minTokensOut, address recipient)
  payable returns (uint256 tokensOut)
function sell(uint256 tokensIn, uint256 minQuoteOut, address recipient)
  returns (uint256 quoteOut)
```

Native launches: `value` must equal `quoteIn` exactly (`NativeValueMismatch`).
Non-native: send no value (`UnexpectedNativeValue`) and `approve` the curve first.

An oversized final buy is **clamped, not rejected**: the user receives what
remains, is charged only for that, and the remainder is refunded in the same
transaction, emitting `CurveBuyRefunded`. The UI must show the refund rather
than looking like it overcharged.

Selling back to the curve is possible at any time **except** after sellout.

### Creator actions

```solidity
// factory
function transferCreatorFeeRecipient(address token, address newRecipient)
// curve, pre-graduation
function sweepFees(uint256 minBuybackTokensOut)
// hook, post-graduation
function sweepPoolFees(bytes32 poolId, uint256 minConversionQuoteOut, uint256 minBuybackTokensOut)
// escrow
function claim()
function claimToken(address token)
// vault
function release(address token)
```

Fees do not reach the escrow until a sweep runs. **Puns should sweep on the
creator's behalf** where gas cost allows - a creator seeing a zero balance
because nobody called a function they have never heard of is a support ticket
we can design away.

## Reads

**Factory**

```solidity
struct LaunchedToken {
  address token; address curve; address deployer; address creatorFeeRecipient;
  address pairToken; uint256 graduationThreshold; uint24 poolFee; int24 tickSpacing;
  uint16 creatorTaxBps; bool buybackEnabled; uint8 phase;
  uint256 sweptQuote; uint256 sweptTokens; uint256 sweptAt; bool exists;
}
function getLaunchedToken(address token) view returns (LaunchedToken)
function getLaunchFeePolicy(address token) view returns (FeePolicy)
```

**Curve**

```solidity
function getReserves()  view returns (uint256 quoteReserve, uint256 tokenReserve)
function realQuoteReserve()      view returns (uint256)
function quoteReserve()          view returns (uint256)
function tokenReserve()          view returns (uint256)
function sellableTokens()        view returns (uint256)
function reservedTokens()        view returns (uint256)
function graduationThreshold()   view returns (uint256)
function readyToGraduate()       view returns (bool)
function graduated()             view returns (bool)
function isNativeQuote()         view returns (bool)
function pairToken()             view returns (address)
function feeBps()                view returns (uint256)
function creatorTaxBps()         view returns (uint256)
function currentSnipeTaxBps(address recipient) view returns (uint256)
```

> **Trap.** Price with `getReserves()`, which includes the 1.68 ETH virtual
> reserve. `realQuoteReserve()` is what the curve physically holds and is the
> **wrong** input for a quote - it gives a badly wrong price on a young curve.
> Use `realQuoteReserve()` only for the graduation progress bar:
> `progress = realQuoteReserve() / graduationThreshold()`.

**Token**

```solidity
function getTokenInfo() view returns (
  address tokenDeployer, string tokenLogo, string tokenDescription, Socials tokenSocials
)
```

**Buyback vault**

```solidity
function totalLocked(address token)   view returns (uint256)
function totalReleased(address token) view returns (uint256)
function vestedAmount(address token)  view returns (uint256)
function releasable(address token)    view returns (uint256)
function vestingStart(address token)  view returns (uint256)
function VESTING_DURATION()           view returns (uint256)   // five years
```

**Escrow**

```solidity
function balanceOf(address recipient) view returns (uint256)
function balanceOfToken(address recipient, address token) view returns (uint256)
```

## Opening-window tax (verified)

Applies to **buys only**. Never to sells.

```
t = 0s   ->  9900 bps  (99%)     verified on chain
t = 1s   ->  ~2500 bps (~25%)
t = 2s   ->  ~300 bps  (~3%)
t = 5s   ->  0 bps
```

Verified on a fresh curve:

```
currentSnipeTaxBps(launcher) -> 0        exempt automatically
currentSnipeTaxBps(stranger) -> 9900     99%
```

The launching address and the creator fee recipient are exempt automatically.
Additional exemptions are set at creation and **cannot be added later**.

Collected tax is not burned. It joins the trading fee and is distributed the
same way.

Product response: [01-product.md](01-product.md), "Fair Entry".

## Events

```solidity
event TokenLaunched(address indexed token, address indexed curve, address indexed deployer,
                    address pairToken, uint256 launchConfigId, uint256 graduationThreshold);
event CurveBuy (address indexed buyer,  address indexed recipient,
                uint256 quoteIn,  uint256 tokensOut, uint256 fee, uint256 tax);
event CurveSell(address indexed seller, address indexed recipient,
                uint256 tokensIn, uint256 quoteOut,  uint256 fee, uint256 tax);
```

`TokenLaunched` topic0, verified:
`0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607`

Full event list in [02-architecture.md](02-architecture.md).

## Errors

| Error | Cause | UI response |
| --- | --- | --- |
| `SlippageExceeded` | Price moved past the minimum | "Price moved. Retry or raise slippage." |
| `CurveGraduated` | Launch left the curve | Auto-reroute to the pool, do not surface |
| `LaunchEconomicsMismatch` | Pin hash is stale | Re-read economics and resubmit silently |
| `PairTokenNotApproved` | Unapproved quote asset | Not reachable in v1 (ETH only) |
| `PairTokenDecimalsMismatch` | Decimals changed | Not reachable in v1 |
| `NativeValueMismatch` | `value != quoteIn` | Bug in our tx builder - never show a user |
| `UnexpectedNativeValue` | Value sent to a token-paired launch | Bug in our tx builder |
| `LaunchFeeNotPaid` | Wrong launch fee | Bug - always read `launchFee()` live |
| `CreatorTaxTooHigh` | Above the cap | Clamp the slider; never reachable |
| `NotWhitelisted` | Launching restricted | **Not currently active.** Monitor - if it turns on, launching stops. |
| `TimelockNotElapsed` / `TimelockExpired` | Fee-recipient change timing | Not reachable in v1 |

## Risks we inherit and must disclose

1. **The launch core is unaudited.** Three reviews are in progress upstream and
   none has closed. Puns must carry a clear risk notice. We must never present
   those in-progress audits as completed, and never as ours.
2. **`NotWhitelisted` exists in the ABI.** Launching is open today. If the
   owner enables the whitelist, Puns cannot create tokens. The indexer must
   monitor `canLaunch()` on a schedule and alert.
3. **The factory has an owner.** `0x263ed295...19Dd` can change parameters we
   depend on. Never cache `launchFee()`, `maxCreatorTaxBps()`,
   `launchConfigCount()` or config values across deployments.
4. **Names and symbols are not unique.** Imitation launches are expected. This
   is exactly what Puns Pass verification is for.
5. **Single-chain concentration.** Robinhood Chain is young, has thin
   liquidity, and users must add the network manually. Onboarding is a product
   problem, not a footnote.
