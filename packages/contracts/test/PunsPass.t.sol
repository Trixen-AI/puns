// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {PunsPass} from "../src/PunsPass.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

/// @dev A treasury that refuses payment, used to prove a misconfigured
///      treasury cannot stop people buying passes.
contract RejectingTreasury {
    bool public accepting;

    function setAccepting(bool value) external {
        accepting = value;
    }

    receive() external payable {
        require(accepting, "rejecting");
    }
}

/// @dev A buyer that refuses refunds, used to prove overpayment refund failure
///      is surfaced rather than silently kept.
contract RefusingBuyer is IERC721Receiver {
    function buy(PunsPass pass, PunsPass.Tier tier, uint256 value) external payable {
        pass.mint{value: value}(tier, address(this));
    }

    function onERC721Received(address, address, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return IERC721Receiver.onERC721Received.selector;
    }

    receive() external payable {
        revert("no refunds");
    }
}

contract PunsPassTest is Test {
    PunsPass internal pass;

    address internal owner = makeAddr("owner");
    address internal treasury = makeAddr("treasury");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    uint256 internal constant CREATOR_PRICE = 0.05 ether;
    uint256 internal constant PRO_PRICE = 0.02 ether;
    uint64 internal constant PRO_DURATION = 30 days;
    uint32 internal constant CREATOR_USD_CENTS = 1000; // $10.00
    uint32 internal constant PRO_USD_CENTS = 800; // $8.00

    function setUp() public {
        pass = new PunsPass(owner, treasury, "https://punsfun.app/pass/");

        vm.startPrank(owner);
        // Creator is lifetime, Pro is a subscription. Both shapes are exercised.
        pass.setTerms(PunsPass.Tier.Creator, CREATOR_PRICE, 0, CREATOR_USD_CENTS);
        pass.setTerms(PunsPass.Tier.Pro, PRO_PRICE, PRO_DURATION, PRO_USD_CENTS);
        vm.stopPrank();

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    // -------------------------------------------------------------------------
    // The invariant that matters most
    // -------------------------------------------------------------------------

    /// @dev Asserted after every test that moves value. The contract is not
    ///      allowed to accumulate anything it has not explicitly booked.
    function _assertHoldsNothing() internal view {
        assertEq(
            address(pass).balance,
            pass.pendingTreasury(),
            "contract holds value it has not booked as pending"
        );
    }

    // -------------------------------------------------------------------------
    // Deployment
    // -------------------------------------------------------------------------

    function test_Deployment() public view {
        assertEq(pass.owner(), owner);
        assertEq(pass.treasury(), treasury);
        assertEq(pass.name(), "Puns Pass");
        assertEq(pass.symbol(), "PUNSPASS");
        assertEq(pass.nextTokenId(), 1, "token id 0 must never be valid");
        assertEq(pass.totalMinted(), 0);
    }

    function test_Deployment_RevertsOnZeroOwner() public {
        vm.expectRevert(PunsPass.ZeroAddress.selector);
        new PunsPass(address(0), treasury, "");
    }

    function test_Deployment_RevertsOnZeroTreasury() public {
        vm.expectRevert(PunsPass.ZeroAddress.selector);
        new PunsPass(owner, address(0), "");
    }

    // -------------------------------------------------------------------------
    // Minting
    // -------------------------------------------------------------------------

    function test_Mint_ExactPayment() public {
        uint256 treasuryBefore = treasury.balance;

        vm.prank(alice);
        uint256 tokenId = pass.mint{value: CREATOR_PRICE}(PunsPass.Tier.Creator, alice);

        assertEq(tokenId, 1);
        assertEq(pass.ownerOf(tokenId), alice);
        assertEq(uint8(pass.tierOf(tokenId)), uint8(PunsPass.Tier.Creator));
        assertEq(pass.expiresAt(tokenId), 0, "creator tier is lifetime");
        assertTrue(pass.isActive(tokenId));
        assertEq(treasury.balance - treasuryBefore, CREATOR_PRICE, "treasury must be paid in full");
        _assertHoldsNothing();
    }

    function test_Mint_RefundsOverpayment() public {
        uint256 aliceBefore = alice.balance;

        vm.prank(alice);
        pass.mint{value: CREATOR_PRICE + 1 ether}(PunsPass.Tier.Creator, alice);

        assertEq(aliceBefore - alice.balance, CREATOR_PRICE, "overpayment must be refunded");
        assertEq(treasury.balance, CREATOR_PRICE);
        _assertHoldsNothing();
    }

    function test_Mint_RevertsOnUnderpayment() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                PunsPass.InsufficientPayment.selector, CREATOR_PRICE, CREATOR_PRICE - 1
            )
        );
        pass.mint{value: CREATOR_PRICE - 1}(PunsPass.Tier.Creator, alice);
    }

    function test_Mint_RevertsOnTierNone() public {
        vm.prank(alice);
        vm.expectRevert(PunsPass.InvalidTier.selector);
        pass.mint{value: 1 ether}(PunsPass.Tier.None, alice);
    }

    function test_Mint_RevertsWhenTierWithdrawnFromSale() public {
        vm.prank(owner);
        pass.setTerms(PunsPass.Tier.Creator, 0, 0, 0);

        vm.prank(alice);
        vm.expectRevert(PunsPass.TierNotForSale.selector);
        pass.mint{value: 1 ether}(PunsPass.Tier.Creator, alice);
    }

    function test_Mint_RevertsOnZeroRecipient() public {
        vm.prank(alice);
        vm.expectRevert(PunsPass.ZeroAddress.selector);
        pass.mint{value: CREATOR_PRICE}(PunsPass.Tier.Creator, address(0));
    }

    function test_Mint_AsGiftToAnotherAddress() public {
        vm.prank(alice);
        uint256 tokenId = pass.mint{value: CREATOR_PRICE}(PunsPass.Tier.Creator, bob);

        assertEq(pass.ownerOf(tokenId), bob, "the recipient holds the pass, not the payer");
        assertTrue(pass.hasTier(bob, PunsPass.Tier.Creator));
        assertFalse(pass.hasTier(alice, PunsPass.Tier.Creator));
        _assertHoldsNothing();
    }

    function test_Mint_SubscriptionSetsExpiry() public {
        vm.prank(alice);
        uint256 tokenId = pass.mint{value: PRO_PRICE}(PunsPass.Tier.Pro, alice);

        assertEq(pass.expiresAt(tokenId), uint64(block.timestamp) + PRO_DURATION);
        assertTrue(pass.isActive(tokenId));
        _assertHoldsNothing();
    }

    function test_Mint_RevertsWhenRefundRefused() public {
        RefusingBuyer buyer = new RefusingBuyer();
        vm.deal(address(buyer), 10 ether);

        vm.expectRevert(PunsPass.RefundFailed.selector);
        buyer.buy{value: CREATOR_PRICE + 1 wei}(pass, PunsPass.Tier.Creator, CREATOR_PRICE + 1 wei);
    }

    // -------------------------------------------------------------------------
    // Expiry
    // -------------------------------------------------------------------------

    function test_IsActive_ExactBoundary() public {
        vm.prank(alice);
        uint256 tokenId = pass.mint{value: PRO_PRICE}(PunsPass.Tier.Pro, alice);
        uint64 expiry = pass.expiresAt(tokenId);

        vm.warp(expiry - 1);
        assertTrue(pass.isActive(tokenId), "active one second before expiry");

        vm.warp(expiry);
        assertFalse(pass.isActive(tokenId), "lapsed at exactly the expiry second");

        vm.warp(expiry + 1);
        assertFalse(pass.isActive(tokenId), "lapsed one second after expiry");
    }

    function test_IsActive_FalseForNonexistentToken() public view {
        assertFalse(pass.isActive(999));
    }

    function test_IsActive_LifetimeNeverLapses() public {
        vm.prank(alice);
        uint256 tokenId = pass.mint{value: CREATOR_PRICE}(PunsPass.Tier.Creator, alice);

        vm.warp(block.timestamp + 3650 days);
        assertTrue(pass.isActive(tokenId));
    }

    // -------------------------------------------------------------------------
    // Renewal
    // -------------------------------------------------------------------------

    function test_Renew_EarlyExtendsFromExistingExpiry() public {
        vm.prank(alice);
        uint256 tokenId = pass.mint{value: PRO_PRICE}(PunsPass.Tier.Pro, alice);
        uint64 firstExpiry = pass.expiresAt(tokenId);

        // Renew halfway through. Remaining time must not be forfeited.
        vm.warp(block.timestamp + PRO_DURATION / 2);
        vm.prank(alice);
        pass.renew{value: PRO_PRICE}(tokenId);

        assertEq(
            pass.expiresAt(tokenId),
            firstExpiry + PRO_DURATION,
            "early renewal must extend from the existing expiry"
        );
        _assertHoldsNothing();
    }

    function test_Renew_AfterLapseExtendsFromNow() public {
        vm.prank(alice);
        uint256 tokenId = pass.mint{value: PRO_PRICE}(PunsPass.Tier.Pro, alice);

        vm.warp(block.timestamp + PRO_DURATION + 100 days);
        vm.prank(alice);
        pass.renew{value: PRO_PRICE}(tokenId);

        assertEq(
            pass.expiresAt(tokenId),
            uint64(block.timestamp) + PRO_DURATION,
            "a lapsed pass must not be back-dated"
        );
        assertTrue(pass.isActive(tokenId));
    }

    function test_Renew_RevertsForLifetimePass() public {
        vm.prank(alice);
        uint256 tokenId = pass.mint{value: CREATOR_PRICE}(PunsPass.Tier.Creator, alice);

        vm.prank(alice);
        vm.expectRevert(PunsPass.LifetimePassCannotBeRenewed.selector);
        pass.renew{value: CREATOR_PRICE}(tokenId);
    }

    function test_Renew_RevertsForNonHolder() public {
        vm.prank(alice);
        uint256 tokenId = pass.mint{value: PRO_PRICE}(PunsPass.Tier.Pro, alice);

        vm.prank(bob);
        vm.expectRevert(PunsPass.NotPassOwner.selector);
        pass.renew{value: PRO_PRICE}(tokenId);
    }

    function test_Renew_RevertsForNonexistentPass() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(PunsPass.NonexistentPass.selector, uint256(42)));
        pass.renew{value: PRO_PRICE}(42);
    }

    // -------------------------------------------------------------------------
    // Tier lookup
    // -------------------------------------------------------------------------

    function test_HasTier_NoPasses() public view {
        assertFalse(pass.hasTier(alice, PunsPass.Tier.Creator));
        assertFalse(pass.hasTier(alice, PunsPass.Tier.Pro));
        assertFalse(pass.hasActivePass(alice));
    }

    function test_HasTier_TiersDoNotNest() public {
        vm.prank(alice);
        pass.mint{value: PRO_PRICE}(PunsPass.Tier.Pro, alice);

        assertTrue(pass.hasTier(alice, PunsPass.Tier.Pro));
        assertFalse(pass.hasTier(alice, PunsPass.Tier.Creator), "Pro must not imply Creator");
    }

    function test_HasTier_MultiplePasses() public {
        vm.startPrank(alice);
        pass.mint{value: CREATOR_PRICE}(PunsPass.Tier.Creator, alice);
        pass.mint{value: PRO_PRICE}(PunsPass.Tier.Pro, alice);
        vm.stopPrank();

        (bool creator, bool pro) = pass.tiersOf(alice);
        assertTrue(creator);
        assertTrue(pro);
        assertTrue(pass.hasActivePass(alice));
    }

    function test_HasTier_ExpiredPassDoesNotCount() public {
        vm.prank(alice);
        pass.mint{value: PRO_PRICE}(PunsPass.Tier.Pro, alice);

        vm.warp(block.timestamp + PRO_DURATION + 1);
        assertFalse(pass.hasTier(alice, PunsPass.Tier.Pro));
        assertFalse(pass.hasActivePass(alice));
    }

    function test_ExpiryOf_ReturnsLatestAcrossPasses() public {
        vm.startPrank(alice);
        uint256 first = pass.mint{value: PRO_PRICE}(PunsPass.Tier.Pro, alice);
        vm.warp(block.timestamp + 10 days);
        uint256 second = pass.mint{value: PRO_PRICE}(PunsPass.Tier.Pro, alice);
        vm.stopPrank();

        assertGt(pass.expiresAt(second), pass.expiresAt(first));
        assertEq(pass.expiryOf(alice, PunsPass.Tier.Pro), pass.expiresAt(second));
    }

    function test_ExpiryOf_LifetimeReturnsZero() public {
        vm.startPrank(alice);
        pass.mint{value: PRO_PRICE}(PunsPass.Tier.Pro, alice);
        pass.mint{value: CREATOR_PRICE}(PunsPass.Tier.Creator, alice);
        vm.stopPrank();

        assertEq(pass.expiryOf(alice, PunsPass.Tier.Creator), 0);
        assertTrue(pass.hasTier(alice, PunsPass.Tier.Creator), "zero here means lifetime, not absent");
    }

    // -------------------------------------------------------------------------
    // Transfer
    // -------------------------------------------------------------------------

    function test_Transfer_MovesTheBenefit() public {
        vm.prank(alice);
        uint256 tokenId = pass.mint{value: CREATOR_PRICE}(PunsPass.Tier.Creator, alice);

        vm.prank(alice);
        pass.transferFrom(alice, bob, tokenId);

        assertFalse(pass.hasTier(alice, PunsPass.Tier.Creator), "benefit must leave the sender");
        assertTrue(pass.hasTier(bob, PunsPass.Tier.Creator), "benefit must follow the token");
    }

    // -------------------------------------------------------------------------
    // Administration
    // -------------------------------------------------------------------------

    function test_SetTerms_OnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(PunsPass.NotOwner.selector);
        pass.setTerms(PunsPass.Tier.Creator, 1 ether, 0, 0);
    }

    function test_SetTerms_TakesEffectImmediately() public {
        vm.prank(owner);
        pass.setTerms(PunsPass.Tier.Creator, 1 ether, 0, 0);

        (uint256 price, uint64 duration,,) = pass.termsOf(PunsPass.Tier.Creator);
        assertEq(price, 1 ether);
        assertEq(duration, 0);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(PunsPass.InsufficientPayment.selector, 1 ether, CREATOR_PRICE)
        );
        pass.mint{value: CREATOR_PRICE}(PunsPass.Tier.Creator, alice);
    }

    function test_SetTerms_DoesNotAffectExistingHolders() public {
        vm.prank(alice);
        uint256 tokenId = pass.mint{value: CREATOR_PRICE}(PunsPass.Tier.Creator, alice);

        vm.prank(owner);
        pass.setTerms(PunsPass.Tier.Creator, 0, 0, 0);

        assertTrue(pass.isActive(tokenId), "withdrawing a tier from sale must not revoke passes");
    }

    function test_Grant_OnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(PunsPass.NotOwner.selector);
        pass.grant(PunsPass.Tier.Creator, alice, 0);
    }

    function test_Grant_IssuesWithoutPayment() public {
        vm.prank(owner);
        uint256 tokenId = pass.grant(PunsPass.Tier.Pro, bob, 0);

        assertEq(pass.ownerOf(tokenId), bob);
        assertTrue(pass.hasTier(bob, PunsPass.Tier.Pro));
        assertEq(treasury.balance, 0);
        _assertHoldsNothing();
    }

    function test_SetTreasury_OnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(PunsPass.NotOwner.selector);
        pass.setTreasury(alice);
    }

    function test_SetTreasury_RevertsOnZero() public {
        vm.prank(owner);
        vm.expectRevert(PunsPass.ZeroAddress.selector);
        pass.setTreasury(address(0));
    }

    function test_Ownership_IsTwoStep() public {
        vm.prank(owner);
        pass.transferOwnership(alice);
        assertEq(pass.owner(), owner, "ownership must not move until accepted");
        assertEq(pass.pendingOwner(), alice);

        vm.prank(bob);
        vm.expectRevert(PunsPass.NotPendingOwner.selector);
        pass.acceptOwnership();

        vm.prank(alice);
        pass.acceptOwnership();
        assertEq(pass.owner(), alice);
        assertEq(pass.pendingOwner(), address(0));
    }

    // -------------------------------------------------------------------------
    // Re-pegging
    // -------------------------------------------------------------------------

    function test_Repeg_OwnerCanMovePrice() public {
        vm.prank(owner);
        pass.repeg(PunsPass.Tier.Creator, 0.06 ether);

        (uint256 price,, uint32 usdCents, uint64 repeggedAt) = pass.termsOf(PunsPass.Tier.Creator);
        assertEq(price, 0.06 ether);
        assertEq(usdCents, CREATOR_USD_CENTS, "the USD peg is a record of intent and must survive");
        assertEq(repeggedAt, uint64(block.timestamp));
    }

    function test_Repeg_PricerCanMovePrice() public {
        address pricer = makeAddr("pricer");
        vm.prank(owner);
        pass.setPricer(pricer);

        vm.prank(pricer);
        pass.repeg(PunsPass.Tier.Creator, 0.055 ether);

        (uint256 price,,,) = pass.termsOf(PunsPass.Tier.Creator);
        assertEq(price, 0.055 ether);
    }

    function test_Repeg_DurationIsUntouchable() public {
        address pricer = makeAddr("pricer");
        vm.prank(owner);
        pass.setPricer(pricer);

        vm.prank(pricer);
        pass.repeg(PunsPass.Tier.Pro, 0.025 ether);

        (, uint64 duration,,) = pass.termsOf(PunsPass.Tier.Pro);
        assertEq(duration, PRO_DURATION, "a pricer must never be able to shorten a term");
    }

    function test_Repeg_RejectsStrangers() public {
        vm.prank(alice);
        vm.expectRevert(PunsPass.NotOwnerOrPricer.selector);
        pass.repeg(PunsPass.Tier.Creator, 0.06 ether);
    }

    function test_Repeg_RejectsFormerPricer() public {
        address pricer = makeAddr("pricer");
        vm.startPrank(owner);
        pass.setPricer(pricer);
        pass.setPricer(address(0));
        vm.stopPrank();

        vm.prank(pricer);
        vm.expectRevert(PunsPass.NotOwnerOrPricer.selector);
        pass.repeg(PunsPass.Tier.Creator, 0.06 ether);
    }

    function test_Repeg_RejectsMoveBeyondTheBand() public {
        // The band is 50% of the current price in either direction.
        uint256 tooHigh = CREATOR_PRICE + (CREATOR_PRICE / 2) + 1;
        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(PunsPass.RepegOutOfBounds.selector, CREATOR_PRICE, tooHigh)
        );
        pass.repeg(PunsPass.Tier.Creator, tooHigh);

        uint256 tooLow = CREATOR_PRICE - (CREATOR_PRICE / 2) - 1;
        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(PunsPass.RepegOutOfBounds.selector, CREATOR_PRICE, tooLow)
        );
        pass.repeg(PunsPass.Tier.Creator, tooLow);
    }

    function test_Repeg_AcceptsTheEdgesOfTheBand() public {
        vm.prank(owner);
        pass.repeg(PunsPass.Tier.Creator, CREATOR_PRICE + CREATOR_PRICE / 2);
        (uint256 price,,,) = pass.termsOf(PunsPass.Tier.Creator);
        assertEq(price, CREATOR_PRICE + CREATOR_PRICE / 2);
    }

    function test_Repeg_CannotZeroAPrice() public {
        // Withdrawing a tier from sale is an owner decision, not a pricing one.
        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(PunsPass.RepegOutOfBounds.selector, CREATOR_PRICE, uint256(0))
        );
        pass.repeg(PunsPass.Tier.Creator, 0);
    }

    function test_Repeg_CannotOpenAnUnpricedTier() public {
        vm.startPrank(owner);
        pass.setTerms(PunsPass.Tier.Creator, 0, 0, 0);

        vm.expectRevert(PunsPass.TierNotInitialised.selector);
        pass.repeg(PunsPass.Tier.Creator, 0.01 ether);
        vm.stopPrank();
    }

    function test_SetPricer_OnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(PunsPass.NotOwner.selector);
        pass.setPricer(alice);
    }

    function test_Repeg_PricerCannotDoAnythingElse() public {
        address pricer = makeAddr("pricer");
        vm.prank(owner);
        pass.setPricer(pricer);

        // Everything a compromised pricer key might reach for, and cannot.
        vm.startPrank(pricer);
        vm.expectRevert(PunsPass.NotOwner.selector);
        pass.setTreasury(pricer);

        vm.expectRevert(PunsPass.NotOwner.selector);
        pass.setTerms(PunsPass.Tier.Creator, 1 wei, 0, 0);

        vm.expectRevert(PunsPass.NotOwner.selector);
        pass.grant(PunsPass.Tier.Creator, pricer, 0);

        vm.expectRevert(PunsPass.NotOwner.selector);
        pass.transferOwnership(pricer);

        vm.expectRevert(PunsPass.NotOwner.selector);
        pass.withdrawPendingTreasury();
        vm.stopPrank();
    }

    function testFuzz_Repeg_StaysWithinTheBand(uint256 newPrice) public {
        newPrice = bound(newPrice, 1, CREATOR_PRICE * 3);
        uint256 band = CREATOR_PRICE / 2;
        bool allowed = newPrice >= CREATOR_PRICE - band && newPrice <= CREATOR_PRICE + band;

        vm.prank(owner);
        if (!allowed) {
            vm.expectRevert(
                abi.encodeWithSelector(PunsPass.RepegOutOfBounds.selector, CREATOR_PRICE, newPrice)
            );
        }
        pass.repeg(PunsPass.Tier.Creator, newPrice);
    }

    // -------------------------------------------------------------------------
    // Treasury resilience
    // -------------------------------------------------------------------------

    function test_RejectingTreasury_DoesNotBrickMinting() public {
        RejectingTreasury rejecting = new RejectingTreasury();
        vm.prank(owner);
        pass.setTreasury(address(rejecting));

        vm.prank(alice);
        uint256 tokenId = pass.mint{value: CREATOR_PRICE}(PunsPass.Tier.Creator, alice);

        assertEq(pass.ownerOf(tokenId), alice, "the mint must still succeed");
        assertEq(pass.pendingTreasury(), CREATOR_PRICE, "value is booked, not lost");
        _assertHoldsNothing();
    }

    function test_WithdrawPendingTreasury_AfterTreasuryRecovers() public {
        RejectingTreasury rejecting = new RejectingTreasury();
        vm.prank(owner);
        pass.setTreasury(address(rejecting));

        vm.prank(alice);
        pass.mint{value: CREATOR_PRICE}(PunsPass.Tier.Creator, alice);
        assertEq(pass.pendingTreasury(), CREATOR_PRICE);

        rejecting.setAccepting(true);
        vm.prank(owner);
        pass.withdrawPendingTreasury();

        assertEq(pass.pendingTreasury(), 0);
        assertEq(address(rejecting).balance, CREATOR_PRICE);
        _assertHoldsNothing();
    }

    function test_WithdrawPendingTreasury_RejectsStrangers() public {
        vm.prank(alice);
        vm.expectRevert(PunsPass.NotOwner.selector);
        pass.withdrawPendingTreasury();
    }

    function test_WithdrawPendingTreasury_RevertsWhenNothingPending() public {
        vm.prank(owner);
        vm.expectRevert(PunsPass.NothingToWithdraw.selector);
        pass.withdrawPendingTreasury();
    }

    // -------------------------------------------------------------------------
    // The contract is not a wallet
    // -------------------------------------------------------------------------

    function test_DirectTransfer_Reverts() public {
        vm.prank(alice);
        (bool ok, bytes memory data) = address(pass).call{value: 1 ether}("");
        assertFalse(ok, "a bare transfer must never succeed");
        assertEq(bytes4(data), PunsPass.DirectPaymentRejected.selector);
        assertEq(address(pass).balance, 0);
    }

    function test_UnknownCalldata_Reverts() public {
        vm.prank(alice);
        (bool ok,) = address(pass).call{value: 1 ether}(abi.encodeWithSignature("nope()"));
        assertFalse(ok);
        assertEq(address(pass).balance, 0);
    }

    // -------------------------------------------------------------------------
    // Fuzz
    // -------------------------------------------------------------------------

    function testFuzz_Mint_AnyPaymentAtOrAbovePrice(uint96 payment) public {
        payment = uint96(bound(payment, CREATOR_PRICE, 50 ether));
        vm.deal(alice, payment);
        uint256 before = alice.balance;

        vm.prank(alice);
        pass.mint{value: payment}(PunsPass.Tier.Creator, alice);

        assertEq(before - alice.balance, CREATOR_PRICE, "the buyer pays exactly the price, never more");
        assertEq(treasury.balance, CREATOR_PRICE);
        _assertHoldsNothing();
    }

    function testFuzz_Mint_AnyPaymentBelowPriceReverts(uint96 payment) public {
        payment = uint96(bound(payment, 0, CREATOR_PRICE - 1));
        vm.deal(alice, CREATOR_PRICE);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(PunsPass.InsufficientPayment.selector, CREATOR_PRICE, payment)
        );
        pass.mint{value: payment}(PunsPass.Tier.Creator, alice);
    }

    function testFuzz_Renew_NeverShortensAPass(uint32 elapsed) public {
        vm.prank(alice);
        uint256 tokenId = pass.mint{value: PRO_PRICE}(PunsPass.Tier.Pro, alice);
        uint64 expiryBefore = pass.expiresAt(tokenId);

        vm.warp(block.timestamp + bound(elapsed, 0, 365 days));
        vm.deal(alice, PRO_PRICE);
        vm.prank(alice);
        pass.renew{value: PRO_PRICE}(tokenId);

        assertGt(pass.expiresAt(tokenId), expiryBefore, "renewal must always move expiry forward");
        assertTrue(pass.isActive(tokenId), "a renewed pass is always active");
    }
}
