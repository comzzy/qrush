// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {QRushCheckout} from "../src/QRushCheckout.sol";

contract Deploy is Script {
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant WETH = 0x4200000000000000000000000000000000000006;
    address constant SWAP_ROUTER_02 = 0x2626664c2603336E57B271c5C0b26F421741e481;

    function run() external returns (QRushCheckout checkout) {
        require(block.chainid == 8453 || vm.envOr("ALLOW_NON_BASE", false), "Not Base mainnet");
        vm.startBroadcast();
        checkout = new QRushCheckout(USDC, WETH, SWAP_ROUTER_02);
        vm.stopBroadcast();
        console2.log("QRushCheckout deployed at", address(checkout));
    }
}
