// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {QRushCheckout} from "../src/QRushCheckout.sol";

/// @dev Runs against Base mainnet state. Set BASE_RPC_URL (defaults to https://mainnet.base.org).
contract QRushCheckoutForkTest is Test {
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant WETH = 0x4200000000000000000000000000000000000006;
    address constant CBBTC = 0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf;
    address constant ROUTER = 0x2626664c2603336E57B271c5C0b26F421741e481;

    QRushCheckout checkout;
    address seller = makeAddr("seller");
    address partner = makeAddr("partner");
    address buyer = makeAddr("buyer");

    function setUp() public {
        vm.createSelectFork(vm.envOr("BASE_RPC_URL", string("https://mainnet.base.org")));
        checkout = new QRushCheckout(USDC, WETH, ROUTER);
        address[] memory r = new address[](2);
        uint16[] memory b = new uint16[](2);
        (r[0], r[1]) = (seller, partner);
        (b[0], b[1]) = (8000, 2000);
        vm.startPrank(seller);
        checkout.registerSeller("Fork Shop", r, b);
        checkout.setLoyalty(1, 500);
        vm.stopPrank();
        vm.deal(buyer, 10 ether);
    }

    function _create(bytes32 id, uint256 amount) internal returns (bytes32 key) {
        QRushCheckout.InvoiceData memory d;
        d.id = id;
        d.seller = seller;
        d.amount = amount;
        vm.prank(seller);
        key = checkout.createInvoice(d);
    }

    function test_Fork_PayWithUSDC() public {
        deal(USDC, buyer, 100e6);
        bytes32 key = _create("usdc", 50e6);
        vm.startPrank(buyer);
        IERC20(USDC).approve(address(checkout), 50e6);
        checkout.payWithUSDC(key);
        vm.stopPrank();
        assertEq(IERC20(USDC).balanceOf(seller), 40e6);
        assertEq(IERC20(USDC).balanceOf(partner), 10e6);
    }

    function test_Fork_PayWithETHSwap() public {
        bytes32 key = _create("eth", 30e6);
        uint256 before = buyer.balance;
        vm.prank(buyer);
        checkout.payWithETH{value: 1 ether}(key, abi.encodePacked(USDC, uint24(500), WETH), block.timestamp);
        assertEq(IERC20(USDC).balanceOf(seller), 24e6);
        assertEq(IERC20(USDC).balanceOf(partner), 6e6);
        uint256 spent = before - buyer.balance;
        assertGt(spent, 0);
        assertLt(spent, 1 ether);
        assertEq(address(checkout).balance, 0);
        assertEq(IERC20(WETH).balanceOf(address(checkout)), 0);
    }

    function test_Fork_PayWithERC20MultiHopAndLoyalty() public {
        deal(CBBTC, buyer, 1e8);
        bytes32 key = _create("link", 20e6);
        bytes memory path = abi.encodePacked(USDC, uint24(500), WETH, uint24(500), CBBTC);
        vm.startPrank(buyer);
        IERC20(CBBTC).approve(address(checkout), type(uint256).max);
        checkout.payWithToken(key, path, 1e7, block.timestamp);
        (uint256 net, uint256 discount) = checkout.quote(key, buyer);
        assertEq(discount, 1e6);
        checkout.payWithToken(key, path, 1e7, block.timestamp);
        vm.stopPrank();
        assertEq(IERC20(USDC).balanceOf(seller) + IERC20(USDC).balanceOf(partner), 20e6 + net);
        assertEq(IERC20(CBBTC).balanceOf(address(checkout)), 0);
        assertEq(checkout.purchaseCount(seller, buyer), 2);
    }

    function test_Fork_SlippageBoundReverts() public {
        bytes32 key = _create("tight", 1000e6);
        vm.prank(buyer);
        vm.expectRevert();
        checkout.payWithETH{value: 0.01 ether}(
            key, abi.encodePacked(USDC, uint24(500), WETH), block.timestamp
        );
    }
}
