// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {PunsPass} from "../src/PunsPass.sol";

/// @notice Deploys PunsPass and optionally opens its tiers for sale.
///
/// @dev Dry run (simulation only, nothing is broadcast):
///
///        forge script script/DeployPunsPass.s.sol --rpc-url $RPC_MAINNET
///
///      Against a local fork, which is what development should use:
///
///        anvil --fork-url $RPC_MAINNET --port 8545
///        forge script script/DeployPunsPass.s.sol --rpc-url local --broadcast
///
///      Mainnet, once a key is present in the environment:
///
///        forge script script/DeployPunsPass.s.sol --rpc-url $RPC_MAINNET --broadcast
///
///      Tier prices are optional. Leaving a price at zero deploys the contract
///      with that tier withdrawn from sale, which is the correct state until
///      pricing is decided. `setTerms` opens it later without a redeployment.
contract DeployPunsPass is Script {
    function run() external returns (PunsPass pass) {
        address owner = vm.envAddress("PUNS_OWNER");
        address treasury = vm.envAddress("PUNS_TREASURY");
        string memory baseUri = vm.envOr("PUNS_PASS_BASE_URI", string(""));

        uint256 creatorPrice = vm.envOr("PUNS_PASS_CREATOR_PRICE", uint256(0));
        uint64 creatorDuration = uint64(vm.envOr("PUNS_PASS_CREATOR_DURATION", uint256(0)));
        uint256 proPrice = vm.envOr("PUNS_PASS_PRO_PRICE", uint256(0));
        uint64 proDuration = uint64(vm.envOr("PUNS_PASS_PRO_DURATION", uint256(0)));
        uint32 creatorUsdCents = uint32(vm.envOr("PUNS_PASS_CREATOR_USD_CENTS", uint256(0)));
        uint32 proUsdCents = uint32(vm.envOr("PUNS_PASS_PRO_USD_CENTS", uint256(0)));
        address pricer = vm.envOr("PUNS_PRICER", address(0));

        console.log("chain id       ", block.chainid);
        console.log("deployer       ", msg.sender);
        console.log("owner          ", owner);
        console.log("treasury       ", treasury);

        vm.startBroadcast();

        pass = new PunsPass(owner, treasury, baseUri);
        console.log("PunsPass       ", address(pass));

        // Terms are set from the deployer only when the deployer is the owner.
        // Otherwise the owner sets them afterwards, and this script stays a
        // pure deployment.
        if (msg.sender == owner) {
            if (creatorPrice != 0) {
                pass.setTerms(PunsPass.Tier.Creator, creatorPrice, creatorDuration, creatorUsdCents);
                console.log("creator tier   ", creatorPrice, creatorDuration);
            }
            if (proPrice != 0) {
                pass.setTerms(PunsPass.Tier.Pro, proPrice, proDuration, proUsdCents);
                console.log("pro tier       ", proPrice, proDuration);
            }
            if (pricer != address(0)) {
                pass.setPricer(pricer);
                console.log("pricer         ", pricer);
            }
        }

        vm.stopBroadcast();

        _report(pass);
    }

    function _report(PunsPass pass) private view {
        (uint256 creatorPrice, uint64 creatorDuration, uint32 creatorCents,) =
            pass.termsOf(PunsPass.Tier.Creator);
        (uint256 proPrice, uint64 proDuration, uint32 proCents,) = pass.termsOf(PunsPass.Tier.Pro);

        console.log("");
        console.log("--- deployed state ---");
        console.log("owner          ", pass.owner());
        console.log("treasury       ", pass.treasury());
        console.log("nextTokenId    ", pass.nextTokenId());
        console.log("creator price  ", creatorPrice);
        console.log("creator length ", creatorDuration);
        console.log("pro price      ", proPrice);
        console.log("pro length     ", proDuration);
        console.log("creator usd c  ", creatorCents);
        console.log("pro usd cents  ", proCents);
        console.log("pricer         ", pass.pricer());
        console.log("balance        ", address(pass).balance);
        console.log("");
        console.log("Set NEXT_PUBLIC_PUNS_PASS_ADDRESS to the address above.");
    }
}
