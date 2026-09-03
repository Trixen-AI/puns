# Verifying PunsPass on Blockscout

Automated verification does not work on this chain. The Blockscout instance sits
behind a Cloudflare managed challenge that returns an interactive JavaScript
page to any non-browser request, so `forge verify-contract` receives HTML where
it expects JSON and fails. There is no CLI workaround; verification has to go
through the browser once.

Everything needed is in this folder. It takes about a minute.

## Steps

1. Open the contract page:

   **https://robinhoodchain.blockscout.com/address/0x6d050DB66e3317C810Cfe52AA8A0b52b6fA28231**

2. Go to the **Contract** tab, then **Verify & Publish**.

3. Choose **Solidity (Standard JSON Input)**. Not flattened source, not
   single-file, the contract imports OpenZeppelin, and standard JSON input is
   the only method that reproduces the exact compilation.

4. Fill the form with these values, exactly:

   | Field | Value |
   | --- | --- |
   | Contract address | `0x6d050DB66e3317C810Cfe52AA8A0b52b6fA28231` |
   | Compiler | `v0.8.28` |
   | Standard JSON Input file | `PunsPass.standard-input.json` (upload from this folder) |
   | Constructor arguments (ABI-encoded) | contents of `constructor-args.txt` |

   **The form may not show a constructor arguments field at all.** That is
   normal for this method: Blockscout reads the arguments from the contract
   creation transaction. Upload the JSON and publish; the file is a fallback.

   If it fails, look for a checkbox along the lines of "Try to fetch
   constructor arguments automatically". It is usually ticked, and the manual
   textarea is hidden behind it. Untick it, and paste the contents of
   `constructor-args.txt` into the *ABI-encoded Constructor Arguments* field
   that appears. The value deliberately has no `0x` prefix.

5. Submit. Verification is immediate when it matches.

## If it fails with a vague error

Blockscout had a bug affecting exactly this combination, `bytecodeHash: none`
together with constructor arguments, which surfaced as a generic
"There was an error validating your contract, please try again" with no detail.
It was fixed in blockscout/blockscout#5479, so a reasonably current instance is
fine, but if that message appears it is more likely this than bad input.

Our deployed bytecode does carry a minimal CBOR trailer, confirmed on chain:

```
CBOR blob     {"solc": 0.8.28}     compiler version only, no IPFS hash
runtime size  14,405 bytes
```

If verification cannot be made to work, the fallback is Sourcify: the same
standard JSON input file works there, and Blockscout displays Sourcify-verified
sources.

## Why these exact settings matter

The bytecode on chain was produced with these compiler settings, from
`foundry.toml`. Any deviation produces a mismatch:

```
solc             0.8.28
optimizer        enabled
optimizer runs   1000000
evmVersion       cancun
bytecodeHash     none
```

`bytecodeHash = none` in particular is not the Foundry default. It strips the
metadata hash from the deployed bytecode, which makes builds reproducible but
means a verifier configured with default settings will not match.

## Constructor arguments, decoded

For reference, the encoded blob in `constructor-args.txt` decodes to:

```solidity
constructor(
  address initialOwner    = 0xE1D78A6f24380cF7caDBB163ce2a598821631B67,
  address initialTreasury = 0xf0099f6D992DfbBF87343317D929AE98b9472C13,
  string  baseUri         = "https://punsfun.app/pass/"
)
```

## Files

| File | Purpose |
| --- | --- |
| `PunsPass.standard-input.json` | Complete compiler input: all 15 sources plus settings. Upload this. |
| `constructor-args.txt` | ABI-encoded constructor arguments, no `0x` prefix. Paste this. |
| `PunsPass.abi.json` | The ABI. Not needed for verification; useful for the frontend and for anyone integrating. |

## Regenerating

If the contract is ever redeployed, regenerate both files:

```bash
cd packages/contracts

forge verify-contract <address> src/PunsPass.sol:PunsPass \
  --show-standard-json-input > verification/PunsPass.standard-input.json

cast abi-encode "constructor(address,address,string)" \
  <owner> <treasury> "<baseUri>" | sed 's/^0x//' > verification/constructor-args.txt
```

## After verification

Once verified, anyone can read the source and call the read functions directly
from the explorer. That matters more than usual here: Puns tells users to check
token addresses rather than trust names, and an unverified pass contract would
undercut that advice.
