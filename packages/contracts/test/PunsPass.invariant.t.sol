// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {PunsPass} from "../src/PunsPass.sol";

/// @dev Drives the contract with random actors, values and timestamps.
///      Every entry point that can move value is reachable from here.
contract PunsPassHandler is Test {
    PunsPass public immutable pass;
    address public immutable owner;

    address[] public actors;
    uint256[] public mintedIds;

    uint256 public totalPaidIn;

    constructor(PunsPass pass_, address owner_) {
        pass = pass_;
        owner = owner_;
        for (uint256 i; i < 5; ++i) {
            address actor = address(uint160(uint256(keccak256(abi.encode("actor", i)))));
            actors.push(actor);
            vm.deal(actor, 1000 ether);
        }
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function mint(uint256 actorSeed, uint256 tierSeed, uint256 value) external {
        address actor = _actor(actorSeed);
        PunsPass.Tier tier = tierSeed % 2 == 0 ? PunsPass.Tier.Creator : PunsPass.Tier.Pro;
        value = bound(value, 0, 100 ether);

        uint256 balanceBefore = actor.balance;
        vm.prank(actor);
        try pass.mint{value: value}(tier, actor) returns (uint256 tokenId) {
            mintedIds.push(tokenId);
            totalPaidIn += balanceBefore - actor.balance;
        } catch {}
    }

    function renew(uint256 actorSeed, uint256 idSeed, uint256 value) external {
        if (mintedIds.length == 0) return;
        address actor = _actor(actorSeed);
        uint256 tokenId = mintedIds[idSeed % mintedIds.length];
        value = bound(value, 0, 100 ether);

        uint256 balanceBefore = actor.balance;
        vm.prank(actor);
        try pass.renew{value: value}(tokenId) {
            totalPaidIn += balanceBefore - actor.balance;
        } catch {}
    }

    function grant(uint256 actorSeed, uint256 tierSeed, uint64 expiry) external {
        PunsPass.Tier tier = tierSeed % 2 == 0 ? PunsPass.Tier.Creator : PunsPass.Tier.Pro;
        vm.prank(owner);
        try pass.grant(tier, _actor(actorSeed), expiry) returns (uint256 tokenId) {
            mintedIds.push(tokenId);
        } catch {}
    }

    function transfer(uint256 fromSeed, uint256 toSeed, uint256 idSeed) external {
        if (mintedIds.length == 0) return;
        uint256 tokenId = mintedIds[idSeed % mintedIds.length];
        address from = _actor(fromSeed);
        vm.prank(from);
        try pass.transferFrom(from, _actor(toSeed), tokenId) {} catch {}
    }

    function setTerms(uint256 tierSeed, uint256 price, uint64 duration) external {
        PunsPass.Tier tier = tierSeed % 2 == 0 ? PunsPass.Tier.Creator : PunsPass.Tier.Pro;
        vm.prank(owner);
        pass.setTerms(tier, bound(price, 0, 10 ether), duration, 0);
    }

    /// @dev A bare transfer must always fail. If it ever succeeds, the
    ///      zero-balance invariant is what will catch it.
    function forcePayment(uint256 actorSeed, uint256 value) external {
        address actor = _actor(actorSeed);
        value = bound(value, 1, 10 ether);
        vm.prank(actor);
        (bool ok,) = address(pass).call{value: value}("");
        ok; // deliberately ignored - the invariant is the assertion
    }

    function warp(uint256 seconds_) external {
        vm.warp(block.timestamp + bound(seconds_, 1, 400 days));
    }

    function mintedCount() external view returns (uint256) {
        return mintedIds.length;
    }
}

contract PunsPassInvariantTest is Test {
    PunsPass internal pass;
    PunsPassHandler internal handler;

    address internal owner = makeAddr("invariant-owner");
    address internal treasury = makeAddr("invariant-treasury");

    function setUp() public {
        pass = new PunsPass(owner, treasury, "");

        vm.startPrank(owner);
        pass.setTerms(PunsPass.Tier.Creator, 0.05 ether, 0, 1000);
        pass.setTerms(PunsPass.Tier.Pro, 0.02 ether, 30 days, 800);
        vm.stopPrank();

        handler = new PunsPassHandler(pass, owner);
        targetContract(address(handler));
    }

    /// @notice The contract holds nothing it has not explicitly booked as owed.
    /// @dev This is the single most important property in the contract. Passing
    ///      it means no sequence of calls can leave value stranded.
    function invariant_HoldsNothingUnbooked() public view {
        assertEq(
            address(pass).balance,
            pass.pendingTreasury(),
            "contract balance diverged from booked pending treasury"
        );
    }

    /// @notice With a treasury that accepts payment, the contract holds nothing at all.
    function invariant_BalanceIsZeroWithAcceptingTreasury() public view {
        assertEq(address(pass).balance, 0, "value stranded in the contract");
    }

    /// @notice Everything paid in reaches the treasury.
    function invariant_TreasuryReceivesEverythingPaid() public view {
        assertEq(
            treasury.balance + pass.pendingTreasury(),
            handler.totalPaidIn(),
            "payments went somewhere other than the treasury"
        );
    }

    /// @notice Token id 0 is never issued, so it can safely mean "absent".
    function invariant_TokenIdZeroIsNeverIssued() public view {
        assertEq(pass.nextTokenId() - 1, pass.totalMinted());
        assertGe(pass.nextTokenId(), 1);
    }
}
