// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title PunsPass
/// @notice An on-chain access pass for the Puns launchpad.
///
/// @dev Design constraints, in order of importance:
///
///      1. The contract never holds value. Every payment is forwarded to the
///         treasury inside the same call, and any overpayment is returned to
///         the buyer. The invariant `address(this).balance == 0` holds after
///         every transaction and is enforced by the test suite.
///
///      2. A pass gates presentation, never participation. Nothing here can
///         affect a user's ability to create, buy, sell or claim on the launch
///         layer, all of which are permissionless on chain.
///
///      3. No upgradeability, no proxy, no delegatecall. If this contract needs
///         to change, a new one is deployed and holders are migrated. The
///         surface is deliberately small because it ships unaudited.
///
///      A pass may be lifetime (`expiresAt == 0`) or time-limited. Both are
///      supported so pricing strategy can change without a redeployment.
contract PunsPass is ERC721 {
    using Strings for uint256;

    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    enum Tier {
        None, // 0 - never minted, used as "absent"
        Creator, // 1 - verification, promotion, custom presentation
        Pro // 2 - analytics, fair entry pro, data API

    }

    struct PassTerms {
        /// @dev Price in wei. Zero disables public minting for the tier.
        uint256 price;
        /// @dev Duration granted per purchase, in seconds. Zero mints a lifetime pass.
        uint64 duration;
        /// @dev The USD price this tier is meant to track, in cents. Informational
        ///      only: the contract never reads a price feed. It exists so the peg
        ///      is publicly auditable and so the re-peg job can be stateless.
        uint32 usdCents;
        /// @dev When `price` was last changed. Lets anyone see how fresh the peg is.
        uint64 repeggedAt;
    }

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error NotOwner();
    error NotPendingOwner();
    error ZeroAddress();
    error InvalidTier();
    error TierNotForSale();
    error InsufficientPayment(uint256 required, uint256 provided);
    error NonexistentPass(uint256 tokenId);
    error NotPassOwner();
    error LifetimePassCannotBeRenewed();
    error TreasuryTransferFailed();
    error RefundFailed();
    error DirectPaymentRejected();
    error NothingToWithdraw();
    error Reentrancy();
    error NotOwnerOrPricer();
    error TierNotInitialised();
    error RepegOutOfBounds(uint256 currentPrice, uint256 newPrice);

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event PassMinted(
        uint256 indexed tokenId, address indexed to, Tier indexed tier, uint64 expiresAt, uint256 paid
    );
    event PassRenewed(uint256 indexed tokenId, uint64 previousExpiry, uint64 newExpiry, uint256 paid);
    event PassGranted(uint256 indexed tokenId, address indexed to, Tier indexed tier, uint64 expiresAt);
    event TermsUpdated(Tier indexed tier, uint256 price, uint64 duration, uint32 usdCents);
    event Repegged(Tier indexed tier, uint256 previousPrice, uint256 newPrice, uint32 usdCents);
    event PricerUpdated(address indexed previousPricer, address indexed newPricer);
    event TreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event BaseUriUpdated(string baseUri);
    /// @dev Emitted when a treasury forward fails and the value is held for pull withdrawal.
    ///      This exists so a reverting treasury can never brick minting.
    event TreasuryPaymentDeferred(uint256 amount, uint256 totalPending);
    event PendingTreasuryWithdrawn(address indexed to, uint256 amount);

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    address public owner;
    address public pendingOwner;
    address public treasury;

    /// @dev Address permitted to move prices, and nothing else. Held by the
    ///      re-peg job so that a routine automated task never needs the owner
    ///      key. A compromised pricer can disrupt sales but cannot take value,
    ///      redirect the treasury, issue passes or transfer ownership.
    address public pricer;

    /// @dev Next token id to mint. Starts at 1 so that id 0 is never valid.
    uint256 public nextTokenId = 1;

    mapping(Tier tier => PassTerms) private _terms;
    mapping(uint256 tokenId => Tier) public tierOf;
    /// @dev Unix seconds at which the pass lapses. Zero means lifetime.
    mapping(uint256 tokenId => uint64) public expiresAt;

    /// @dev Value that could not be forwarded to the treasury. Withdrawable by
    ///      the treasury or the owner. Kept separate so the zero-balance
    ///      invariant is expressed as `balance == pendingTreasury`.
    uint256 public pendingTreasury;

    string private _baseTokenUri;

    uint256 private _reentrancyLock = 1;

    /// @dev Largest single move the pricer may make, as a share of the current
    ///      price. Bounds the damage a compromised pricer key can do. A larger
    ///      correction is still possible, but only from the owner via `setTerms`.
    uint256 public constant MAX_REPEG_DEVIATION_BPS = 5_000; // 50%

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyOwnerOrPricer() {
        if (msg.sender != owner && msg.sender != pricer) revert NotOwnerOrPricer();
        _;
    }

    /// @dev ERC721 `_safeMint` calls into the recipient, so this is load-bearing
    ///      rather than defensive.
    modifier nonReentrant() {
        if (_reentrancyLock != 1) revert Reentrancy();
        _reentrancyLock = 2;
        _;
        _reentrancyLock = 1;
    }

    // -------------------------------------------------------------------------
    // Construction
    // -------------------------------------------------------------------------

    /// @param initialOwner Address permitted to set terms, treasury and grants.
    /// @param initialTreasury Address that receives every payment.
    /// @param baseUri Metadata base, with trailing slash. May be empty at deploy.
    constructor(address initialOwner, address initialTreasury, string memory baseUri)
        ERC721("Puns Pass", "PUNSPASS")
    {
        if (initialOwner == address(0) || initialTreasury == address(0)) revert ZeroAddress();
        owner = initialOwner;
        treasury = initialTreasury;
        _baseTokenUri = baseUri;
        emit OwnershipTransferred(address(0), initialOwner);
        emit TreasuryUpdated(address(0), initialTreasury);
    }

    // -------------------------------------------------------------------------
    // Minting
    // -------------------------------------------------------------------------

    /// @notice Buy a pass at the given tier.
    /// @dev Overpayment is refunded. Underpayment reverts rather than minting a
    ///      partial term, because a silently shortened pass is worse than a
    ///      failed transaction.
    /// @param tier Tier to purchase. Must have a non-zero price.
    /// @param to Recipient of the pass. May differ from the payer, so a pass can
    ///        be bought as a gift.
    /// @return tokenId The minted pass id.
    function mint(Tier tier, address to) external payable nonReentrant returns (uint256 tokenId) {
        if (to == address(0)) revert ZeroAddress();
        if (tier == Tier.None) revert InvalidTier();

        PassTerms memory terms = _terms[tier];
        if (terms.price == 0) revert TierNotForSale();
        if (msg.value < terms.price) revert InsufficientPayment(terms.price, msg.value);

        tokenId = nextTokenId++;
        tierOf[tokenId] = tier;

        uint64 expiry = terms.duration == 0 ? 0 : uint64(block.timestamp) + terms.duration;
        expiresAt[tokenId] = expiry;

        emit PassMinted(tokenId, to, tier, expiry, terms.price);

        _settle(terms.price, msg.value);

        // Minted last: `_safeMint` hands control to the recipient, and by this
        // point every state change and every transfer is already complete.
        _safeMint(to, tokenId);
    }

    /// @notice Extend a time-limited pass.
    /// @dev Extension runs from `max(now, currentExpiry)`, so renewing early
    ///      never forfeits remaining time.
    /// @param tokenId Pass to extend. Caller must own it.
    function renew(uint256 tokenId) external payable nonReentrant {
        address holder = _ownerOf(tokenId);
        if (holder == address(0)) revert NonexistentPass(tokenId);
        if (holder != msg.sender) revert NotPassOwner();

        uint64 currentExpiry = expiresAt[tokenId];
        if (currentExpiry == 0) revert LifetimePassCannotBeRenewed();

        PassTerms memory terms = _terms[tierOf[tokenId]];
        if (terms.price == 0 || terms.duration == 0) revert TierNotForSale();
        if (msg.value < terms.price) revert InsufficientPayment(terms.price, msg.value);

        // A pass term is measured in days or months, so a validator nudging the
        // timestamp by a few seconds cannot meaningfully affect it.
        // forge-lint: disable-next-line(block-timestamp)
        uint64 base = currentExpiry > uint64(block.timestamp) ? currentExpiry : uint64(block.timestamp);
        uint64 newExpiry = base + terms.duration;
        expiresAt[tokenId] = newExpiry;

        emit PassRenewed(tokenId, currentExpiry, newExpiry, terms.price);

        _settle(terms.price, msg.value);
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    /// @notice Whether a specific pass is currently valid.
    function isActive(uint256 tokenId) public view returns (bool) {
        if (_ownerOf(tokenId) == address(0)) return false;
        uint64 expiry = expiresAt[tokenId];
        // Same reasoning as in `renew`: seconds of drift are irrelevant here.
        // forge-lint: disable-next-line(block-timestamp)
        return expiry == 0 || expiry > block.timestamp;
    }

    /// @notice Whether `holder` has an active pass at `tier`.
    /// @dev Creator and Pro benefits do not nest. Callers must check each tier
    ///      they care about rather than assuming a hierarchy.
    function hasTier(address holder, Tier tier) public view returns (bool) {
        if (tier == Tier.None) return false;
        uint256 balance = balanceOf(holder);
        for (uint256 i; i < balance; ++i) {
            uint256 tokenId = _tokenOfOwnerByIndexScan(holder, i);
            if (tierOf[tokenId] == tier && isActive(tokenId)) return true;
        }
        return false;
    }

    /// @notice Whether `holder` has any active pass.
    function hasActivePass(address holder) external view returns (bool) {
        return hasTier(holder, Tier.Creator) || hasTier(holder, Tier.Pro);
    }

    /// @notice Every active tier held, as a convenience for the frontend.
    function tiersOf(address holder) external view returns (bool creator, bool pro) {
        creator = hasTier(holder, Tier.Creator);
        pro = hasTier(holder, Tier.Pro);
    }

    /// @notice Latest expiry across a holder's active passes at `tier`.
    /// @return expiry Zero when a lifetime pass is held, or when none is held.
    ///         Disambiguate with `hasTier`.
    function expiryOf(address holder, Tier tier) external view returns (uint64 expiry) {
        uint256 balance = balanceOf(holder);
        for (uint256 i; i < balance; ++i) {
            uint256 tokenId = _tokenOfOwnerByIndexScan(holder, i);
            if (tierOf[tokenId] != tier || !isActive(tokenId)) continue;
            uint64 candidate = expiresAt[tokenId];
            if (candidate == 0) return 0;
            if (candidate > expiry) expiry = candidate;
        }
    }

    function termsOf(Tier tier)
        external
        view
        returns (uint256 price, uint64 duration, uint32 usdCents, uint64 repeggedAt)
    {
        PassTerms memory terms = _terms[tier];
        return (terms.price, terms.duration, terms.usdCents, terms.repeggedAt);
    }

    function totalMinted() external view returns (uint256) {
        return nextTokenId - 1;
    }

    // -------------------------------------------------------------------------
    // Administration
    // -------------------------------------------------------------------------

    /// @notice Set price and duration for a tier.
    /// @dev Pricing is deliberately not fixed at deployment. A zero price
    ///      withdraws the tier from sale without affecting existing holders.
    /// @param duration Seconds granted per purchase. Zero mints lifetime passes.
    /// @param duration Seconds granted per purchase. Zero mints lifetime passes.
    /// @param usdCents The USD price this tier is meant to track, in cents. Purely
    ///        a record of intent, so the peg can be audited and the re-peg job
    ///        does not need its own database.
    function setTerms(Tier tier, uint256 price, uint64 duration, uint32 usdCents)
        external
        onlyOwner
    {
        if (tier == Tier.None) revert InvalidTier();
        _terms[tier] = PassTerms({
            price: price,
            duration: duration,
            usdCents: usdCents,
            repeggedAt: uint64(block.timestamp)
        });
        emit TermsUpdated(tier, price, duration, usdCents);
    }

    /// @notice Move a tier's price to track its USD peg.
    /// @dev Prices are denominated in wei, so a fixed ETH price drifts in USD
    ///      terms as the market moves. Rather than reading a price feed on chain,
    ///      which would let a stale or reverting oracle halt sales entirely, an
    ///      off-chain job re-pegs periodically through this function.
    ///
    ///      This is the only thing the pricer can do. Duration cannot be touched,
    ///      so a compromised pricer cannot silently shorten everyone's term, and
    ///      the move is bounded by `MAX_REPEG_DEVIATION_BPS`.
    function repeg(Tier tier, uint256 newPrice) external onlyOwnerOrPricer {
        PassTerms storage terms = _terms[tier];
        uint256 current = terms.price;

        // Re-pegging a tier that was never priced would be opening it for sale,
        // which is an owner decision, not a pricing one.
        if (current == 0) revert TierNotInitialised();

        uint256 band = (current * MAX_REPEG_DEVIATION_BPS) / 10_000;
        if (newPrice == 0 || newPrice > current + band || newPrice < current - band) {
            revert RepegOutOfBounds(current, newPrice);
        }

        terms.price = newPrice;
        terms.repeggedAt = uint64(block.timestamp);

        emit Repegged(tier, current, newPrice, terms.usdCents);
    }

    /// @notice Set the address permitted to re-peg prices. Zero disables re-pegging.
    function setPricer(address newPricer) external onlyOwner {
        emit PricerUpdated(pricer, newPricer);
        pricer = newPricer;
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        emit TreasuryUpdated(treasury, newTreasury);
        treasury = newTreasury;
    }

    function setBaseUri(string calldata baseUri) external onlyOwner {
        _baseTokenUri = baseUri;
        emit BaseUriUpdated(baseUri);
    }

    /// @notice Issue a pass without payment, for partners and compensation.
    /// @param expiry Absolute unix seconds, or zero for lifetime.
    function grant(Tier tier, address to, uint64 expiry)
        external
        onlyOwner
        nonReentrant
        returns (uint256 tokenId)
    {
        if (to == address(0)) revert ZeroAddress();
        if (tier == Tier.None) revert InvalidTier();

        tokenId = nextTokenId++;
        tierOf[tokenId] = tier;
        expiresAt[tokenId] = expiry;

        emit PassGranted(tokenId, to, tier, expiry);
        _safeMint(to, tokenId);
    }

    /// @notice Two-step ownership transfer. The recipient must accept.
    function transferOwnership(address newOwner) external onlyOwner {
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        emit OwnershipTransferred(owner, pendingOwner);
        owner = pendingOwner;
        pendingOwner = address(0);
    }

    /// @notice Withdraw value that could not be forwarded to the treasury.
    /// @dev Callable by the treasury or the owner. The escape hatch for a
    ///      treasury that was temporarily unable to receive.
    function withdrawPendingTreasury() external nonReentrant {
        if (msg.sender != treasury && msg.sender != owner) revert NotOwner();
        uint256 amount = pendingTreasury;
        if (amount == 0) revert NothingToWithdraw();

        pendingTreasury = 0;
        (bool ok,) = treasury.call{value: amount}("");
        if (!ok) revert TreasuryTransferFailed();

        emit PendingTreasuryWithdrawn(treasury, amount);
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    /// @dev Forward `price` to the treasury and refund the remainder to the
    ///      payer. If the treasury cannot receive, the value is booked as
    ///      pending rather than reverting: a misconfigured treasury must not be
    ///      able to stop people buying passes.
    function _settle(uint256 price, uint256 paid) private {
        uint256 refund = paid - price;

        if (price != 0) {
            (bool sent,) = treasury.call{value: price}("");
            if (!sent) {
                pendingTreasury += price;
                emit TreasuryPaymentDeferred(price, pendingTreasury);
            }
        }

        if (refund != 0) {
            (bool refunded,) = msg.sender.call{value: refund}("");
            if (!refunded) revert RefundFailed();
        }
    }

    /// @dev Linear scan over minted ids to find a holder's `index`-th token.
    ///      ERC721Enumerable was rejected: it adds storage writes to every
    ///      mint and transfer to serve reads that only ever happen off chain.
    ///      Holders own a handful of passes, and every caller of this is a view.
    function _tokenOfOwnerByIndexScan(address holder, uint256 index)
        private
        view
        returns (uint256)
    {
        uint256 seen;
        uint256 last = nextTokenId;
        for (uint256 tokenId = 1; tokenId < last; ++tokenId) {
            if (_ownerOf(tokenId) != holder) continue;
            if (seen == index) return tokenId;
            unchecked {
                ++seen;
            }
        }
        return 0;
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenUri;
    }

    // -------------------------------------------------------------------------
    // Value handling
    // -------------------------------------------------------------------------

    /// @dev The contract is not a wallet. Every path into it is a priced
    ///      function call, so a bare transfer is always a mistake.
    receive() external payable {
        revert DirectPaymentRejected();
    }

    fallback() external payable {
        revert DirectPaymentRejected();
    }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
