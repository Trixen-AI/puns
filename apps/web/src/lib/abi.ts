import {parseAbi} from "viem";

/**
 * The on-chain surface the app talks to.
 *
 * Only what is actually called is declared. A trimmed ABI keeps the bundle
 * small and makes it obvious what the app is allowed to do.
 */

export const factoryAbi = parseAbi([
  "struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }",
  "struct TokenParams { string name; string symbol; string logo; string description; Socials socials; address creatorFeeRecipient; uint16 creatorTaxBps; bool buybackEnabled; bytes32 expectedEconomics; bytes32 salt; }",
  "struct LaunchedToken { address token; address curve; address deployer; address creatorFeeRecipient; address pairToken; uint256 graduationThreshold; uint24 poolFee; int24 tickSpacing; uint16 creatorTaxBps; bool buybackEnabled; uint8 phase; uint256 sweptQuote; uint256 sweptTokens; uint256 sweptAt; bool exists; }",

  "function launchToken(TokenParams params, uint256 launchConfigId, address pairToken) payable returns (address token, address curve)",
  "function launchFee() view returns (uint256)",
  "function maxCreatorTaxBps() view returns (uint16)",
  "function launchConfigCount() view returns (uint256)",
  "function canLaunch(address account) view returns (bool)",
  "function previewLaunchEconomics(uint256 launchConfigId, address pairToken) view returns (bytes32)",
  "function getLaunchedToken(address token) view returns (LaunchedToken)",
  "function transferCreatorFeeRecipient(address token, address newRecipient)",

  "event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)",
]);

/**
 * Launching with a first buy in the same transaction, and with addresses
 * exempted from the opening-window tax.
 *
 * The exemption list is the reason this path exists at all: it is fixed at
 * creation and can never be extended, so a team buying across several wallets
 * has exactly one chance to declare them.
 *
 * This lives on its own contract, not the factory.
 */
export const launchAndBuyAbi = parseAbi([
  "struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }",
  "struct TokenParams { string name; string symbol; string logo; string description; Socials socials; address creatorFeeRecipient; uint16 creatorTaxBps; bool buybackEnabled; bytes32 expectedEconomics; bytes32 salt; }",
  "function launchAndBuy(TokenParams params, uint256 launchConfigId, address pairToken, uint256 quoteIn, uint256 minTokensOut, address recipient, address[] snipeTaxExemptions) payable returns (address token, address curve, uint256 tokensOut)",
]);

export const curveAbi = parseAbi([
  "function buy(uint256 quoteIn, uint256 minTokensOut, address recipient) payable returns (uint256 tokensOut)",
  "function sell(uint256 tokensIn, uint256 minQuoteOut, address recipient) returns (uint256 quoteOut)",

  "function getReserves() view returns (uint256 quoteReserve, uint256 tokenReserve)",
  "function realQuoteReserve() view returns (uint256)",
  "function sellableTokens() view returns (uint256)",
  "function reservedTokens() view returns (uint256)",
  "function graduationThreshold() view returns (uint256)",
  "function readyToGraduate() view returns (bool)",
  "function graduated() view returns (bool)",
  "function isNativeQuote() view returns (bool)",
  "function feeBps() view returns (uint256)",
  "function creatorTaxBps() view returns (uint256)",
  "function currentSnipeTaxBps(address recipient) view returns (uint256)",

  "event CurveBuy(address indexed buyer, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 tax)",
  "event CurveSell(address indexed seller, address indexed recipient, uint256 tokensIn, uint256 quoteOut, uint256 fee, uint256 tax)",
]);

export const tokenAbi = parseAbi([
  "struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function getTokenInfo() view returns (address tokenDeployer, string tokenLogo, string tokenDescription, Socials tokenSocials)",
]);

export const punsPassAbi = parseAbi([
  "function mint(uint8 tier, address to) payable returns (uint256 tokenId)",
  "function renew(uint256 tokenId) payable",
  "function termsOf(uint8 tier) view returns (uint256 price, uint64 duration, uint32 usdCents, uint64 repeggedAt)",
  "function hasTier(address holder, uint8 tier) view returns (bool)",
  "function hasActivePass(address holder) view returns (bool)",
  "function tiersOf(address holder) view returns (bool creator, bool pro)",
  "function expiryOf(address holder, uint8 tier) view returns (uint64)",
  "function balanceOf(address owner) view returns (uint256)",
  "function totalMinted() view returns (uint256)",
]);

/** Matches the enum in PunsPass.sol. */
export const PassTier = {None: 0, Creator: 1, Pro: 2} as const;

/** Matches LaunchedToken.phase. */
export const LaunchPhase = {
  NotGraduated: 0,
  Swept: 1,
  PoolCreated: 2,
  Rescued: 3,
} as const;

export const phaseLabel: Record<number, string> = {
  0: "On the curve",
  1: "Graduating",
  2: "Trading in a pool",
  3: "Recovered",
};
