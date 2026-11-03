// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {QRushCheckout} from "../src/QRushCheckout.sol";
import {MockERC20, MockWETH, MockSwapRouter, MockERC1271Wallet} from "./mocks/Mocks.sol";

contract QRushCheckoutTest is Test {
    QRushCheckout checkout;
    MockERC20 usdc;
    MockERC20 dai;
    MockWETH weth;
    MockSwapRouter router;

    uint256 sellerPk = 0xA11CE;
    address seller;
    address buyer = makeAddr("buyer");
    address partner = makeAddr("partner");

    function setUp() public {
        seller = vm.addr(sellerPk);
        usdc = new MockERC20("USD Coin", "USDC", 6);
        dai = new MockERC20("Dai", "DAI", 18);
        weth = new MockWETH();
        router = new MockSwapRouter(IERC20(address(usdc)), 1e12);
        usdc.mint(address(router), 1_000_000e6);
        checkout = new QRushCheckout(address(usdc), address(weth), address(router));
        usdc.mint(buyer, 10_000e6);
        dai.mint(buyer, 10_000e18);
        vm.deal(buyer, 100 ether);
    }

    function _register() internal {
        vm.prank(seller);
        checkout.registerSeller("Corner Shop", new address[](0), new uint16[](0));
    }

    function _data(bytes32 id, uint256 amount, uint32 maxUses)
        internal
        view
        returns (QRushCheckout.InvoiceData memory d)
    {
        d.id = id;
        d.seller = seller;
        d.amount = amount;
        d.maxUses = maxUses;
    }

    function _create(bytes32 id, uint256 amount, uint32 maxUses) internal returns (bytes32 key) {
        vm.prank(seller);
        key = checkout.createInvoice(_data(id, amount, maxUses));
    }

    function _path(address tokenIn) internal view returns (bytes memory) {
        return abi.encodePacked(address(usdc), uint24(500), tokenIn);
    }

    function test_RegisterTwiceReverts() public {
        _register();
        vm.prank(seller);
        vm.expectRevert(QRushCheckout.AlreadyRegistered.selector);
        checkout.registerSeller("x", new address[](0), new uint16[](0));
    }

    function test_UnregisteredCannotCreate() public {
        vm.prank(seller);
        vm.expectRevert(QRushCheckout.NotRegistered.selector);
        checkout.createInvoice(_data("a", 1e6, 1));
    }

    function test_PayWithUSDCSingleUse() public {
        _register();
        bytes32 key = _create("inv-1", 25e6, 1);
        vm.startPrank(buyer);
        usdc.approve(address(checkout), 25e6);
        uint256 receipt = checkout.payWithUSDC(key);
        vm.stopPrank();
        assertEq(receipt, 1);
        assertEq(usdc.balanceOf(seller), 25e6);
        assertEq(uint8(checkout.getInvoice(key).status), uint8(QRushCheckout.InvoiceStatus.Completed));
        vm.prank(buyer);
        vm.expectRevert(QRushCheckout.InvoiceNotOpen.selector);
        checkout.payWithUSDC(key);
    }

    function test_PayLinkReusable() public {
        _register();
        bytes32 key = _create("link", 5e6, 0);
        vm.startPrank(buyer);
        usdc.approve(address(checkout), type(uint256).max);
        for (uint256 i; i < 3; ++i) {
            checkout.payWithUSDC(key);
        }
        vm.stopPrank();
        assertEq(usdc.balanceOf(seller), 15e6);
        assertEq(checkout.getInvoice(key).uses, 3);
        assertEq(checkout.purchaseCount(seller, buyer), 3);
    }

    function test_ItemsMustSumToAmount() public {
        _register();
        QRushCheckout.InvoiceData memory d = _data("items", 7e6, 1);
        d.items = new QRushCheckout.Item[](2);
        d.items[0] = QRushCheckout.Item("Coffee", 2, 2e6);
        d.items[1] = QRushCheckout.Item("Bagel", 1, 3e6);
        vm.prank(seller);
        checkout.createInvoice(d);

        d.id = "items-bad";
        d.amount = 8e6;
        vm.prank(seller);
        vm.expectRevert(QRushCheckout.InvalidItems.selector);
        checkout.createInvoice(d);
    }

    function test_ExpiredInvoice() public {
        _register();
        QRushCheckout.InvoiceData memory d = _data("exp", 1e6, 1);
        d.expiresAt = uint64(block.timestamp + 1 hours);
        vm.prank(seller);
        bytes32 key = checkout.createInvoice(d);
        vm.warp(block.timestamp + 2 hours);
        vm.startPrank(buyer);
        usdc.approve(address(checkout), 1e6);
        vm.expectRevert(QRushCheckout.InvoiceExpired.selector);
        checkout.payWithUSDC(key);
        vm.stopPrank();
    }

    function test_SplitsDistributeByBps() public {
        address[] memory r = new address[](3);
        uint16[] memory b = new uint16[](3);
        (r[0], r[1], r[2]) = (seller, partner, makeAddr("charity"));
        (b[0], b[1], b[2]) = (7000, 2500, 500);
        vm.prank(seller);
        checkout.registerSeller("Split Shop", r, b);
        bytes32 key = _create("s", 10_000_001, 1);
        vm.startPrank(buyer);
        usdc.approve(address(checkout), 10_000_001);
        checkout.payWithUSDC(key);
        vm.stopPrank();
        assertEq(usdc.balanceOf(seller), 7_000_000);
        assertEq(usdc.balanceOf(partner), 2_500_000);
        assertEq(usdc.balanceOf(r[2]), 500_001);
        assertEq(usdc.balanceOf(address(checkout)), 0);
    }

    function test_InvalidSplitsRevert() public {
        _register();
        address[] memory r = new address[](2);
        uint16[] memory b = new uint16[](2);
        (r[0], r[1]) = (seller, partner);
        (b[0], b[1]) = (5000, 4000);
        vm.prank(seller);
        vm.expectRevert(QRushCheckout.InvalidSplits.selector);
        checkout.setSplits(r, b);
    }

    function test_LoyaltyDiscountAfterThreshold() public {
        _register();
        vm.prank(seller);
        checkout.setLoyalty(2, 1000);
        bytes32 key = _create("loyal", 10e6, 0);
        vm.startPrank(buyer);
        usdc.approve(address(checkout), type(uint256).max);
        checkout.payWithUSDC(key);
        checkout.payWithUSDC(key);
        (uint256 net, uint256 discount) = checkout.quote(key, buyer);
        assertEq(net, 9e6);
        assertEq(discount, 1e6);
        checkout.payWithUSDC(key);
        vm.stopPrank();
        assertEq(usdc.balanceOf(seller), 29e6);
        (uint256 purchases,,, bool eligible) = checkout.loyaltyStatus(seller, buyer);
        assertEq(purchases, 3);
        assertTrue(eligible);
    }

    function test_LoyaltyBounds() public {
        _register();
        vm.startPrank(seller);
        vm.expectRevert(QRushCheckout.InvalidLoyalty.selector);
        checkout.setLoyalty(1, 5001);
        vm.expectRevert(QRushCheckout.InvalidLoyalty.selector);
        checkout.setLoyalty(0, 100);
        vm.stopPrank();
    }

    function test_PayWithTokenRefundsUnused() public {
        _register();
        bytes32 key = _create("dai", 20e6, 1);
        vm.startPrank(buyer);
        dai.approve(address(checkout), 25e18);
        checkout.payWithToken(key, _path(address(dai)), 25e18, block.timestamp);
        vm.stopPrank();
        assertEq(usdc.balanceOf(seller), 20e6);
        assertEq(dai.balanceOf(buyer), 10_000e18 - 20e18);
        assertEq(dai.allowance(address(checkout), address(router)), 0);
    }

    function test_PayWithTokenSlippageReverts() public {
        _register();
        bytes32 key = _create("dai2", 20e6, 1);
        vm.startPrank(buyer);
        dai.approve(address(checkout), 19e18);
        vm.expectRevert("Too much requested");
        checkout.payWithToken(key, _path(address(dai)), 19e18, block.timestamp);
        vm.stopPrank();
    }

    function test_InsufficientRouterOutputReverts() public {
        _register();
        router.setShortfall(1);
        bytes32 key = _create("short", 20e6, 1);
        vm.startPrank(buyer);
        dai.approve(address(checkout), 25e18);
        vm.expectRevert(QRushCheckout.InsufficientOutput.selector);
        checkout.payWithToken(key, _path(address(dai)), 25e18, block.timestamp);
        vm.stopPrank();
    }

    function test_PathValidation() public {
        _register();
        bytes32 key = _create("p", 1e6, 1);
        vm.startPrank(buyer);
        vm.expectRevert(QRushCheckout.InvalidPath.selector);
        checkout.payWithToken(
            key, abi.encodePacked(address(dai), uint24(500), address(usdc)), 1e18, block.timestamp
        );
        vm.expectRevert(QRushCheckout.InvalidPath.selector);
        checkout.payWithToken(key, abi.encodePacked(address(usdc), uint24(500)), 1e18, block.timestamp);
        vm.expectRevert(QRushCheckout.InvalidPath.selector);
        checkout.payWithETH{value: 1 ether}(key, _path(address(dai)), block.timestamp);
        vm.expectRevert(QRushCheckout.DeadlineExpired.selector);
        checkout.payWithToken(key, _path(address(dai)), 1e18, block.timestamp - 1);
        vm.stopPrank();
    }

    function test_PayWithETHRefundsUnused() public {
        _register();
        bytes32 key = _create("eth", 3e6, 1);
        uint256 before = buyer.balance;
        vm.prank(buyer);
        checkout.payWithETH{value: 5e18}(key, _path(address(weth)), block.timestamp);
        assertEq(usdc.balanceOf(seller), 3e6);
        assertEq(buyer.balance, before - 3e18);
        assertEq(address(checkout).balance, 0);
        assertEq(weth.balanceOf(address(checkout)), 0);
    }

    function test_SignedInvoicePublishAndPayViaMulticall() public {
        _register();
        QRushCheckout.InvoiceData memory d = _data("signed", 4e6, 1);
        d.items = new QRushCheckout.Item[](1);
        d.items[0] = QRushCheckout.Item("Tea", 2, 2e6);
        bytes32 digest = checkout.hashInvoice(d);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(sellerPk, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        bytes32 key = checkout.invoiceKey(seller, "signed");

        bytes[] memory calls = new bytes[](2);
        calls[0] = abi.encodeCall(QRushCheckout.publishInvoice, (d, sig));
        calls[1] = abi.encodeCall(QRushCheckout.payWithUSDC, (key));
        vm.startPrank(buyer);
        usdc.approve(address(checkout), 4e6);
        checkout.multicall(calls);
        vm.stopPrank();
        assertEq(usdc.balanceOf(seller), 4e6);
    }

    function test_SignedInvoiceFromDelegatedEoa() public {
        _register();
        // Simulate an EIP-7702 delegation to a contract without ERC-1271 support.
        vm.etch(seller, abi.encodePacked(hex"ef0100", address(usdc)));
        QRushCheckout.InvoiceData memory d = _data("delegated", 1e6, 1);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(sellerPk, checkout.hashInvoice(d));
        bytes32 key = checkout.publishInvoice(d, abi.encodePacked(r, s, v));
        assertEq(uint8(checkout.getInvoice(key).status), uint8(QRushCheckout.InvoiceStatus.Open));
    }

    function test_SignedInvoiceFromERC1271Seller() public {
        uint256 ownerPk = 0xA11CE;
        MockERC1271Wallet wallet = new MockERC1271Wallet(vm.addr(ownerPk));
        address[] memory recipients = new address[](0);
        uint16[] memory bps = new uint16[](0);
        vm.prank(vm.addr(ownerPk));
        wallet.execute(
            address(checkout), abi.encodeCall(QRushCheckout.registerSeller, ("Wallet shop", recipients, bps))
        );

        QRushCheckout.InvoiceData memory d = _data("sc", 2e6, 1);
        d.seller = address(wallet);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerPk, checkout.hashInvoice(d));
        bytes32 key = checkout.publishInvoice(d, abi.encodePacked(r, s, v));
        vm.startPrank(buyer);
        usdc.approve(address(checkout), 2e6);
        checkout.payWithUSDC(key);
        vm.stopPrank();
        assertEq(usdc.balanceOf(address(wallet)), 2e6);
    }

    function test_SignedInvoiceBadSignatureReverts() public {
        _register();
        QRushCheckout.InvoiceData memory d = _data("forged", 4e6, 1);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBEEF, checkout.hashInvoice(d));
        vm.expectRevert(QRushCheckout.InvalidSignature.selector);
        checkout.publishInvoice(d, abi.encodePacked(r, s, v));
    }

    function test_CancelBeforePublishVoidsSignature() public {
        _register();
        QRushCheckout.InvoiceData memory d = _data("void", 4e6, 1);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(sellerPk, checkout.hashInvoice(d));
        vm.prank(seller);
        checkout.cancelInvoice("void");
        vm.expectRevert(QRushCheckout.InvoiceExists.selector);
        checkout.publishInvoice(d, abi.encodePacked(r, s, v));
    }

    function test_OtherAccountCannotSquatOrCancel() public {
        _register();
        bytes32 key = _create("mine", 1e6, 1);
        vm.prank(partner);
        checkout.cancelInvoice("mine");
        assertEq(uint8(checkout.getInvoice(key).status), uint8(QRushCheckout.InvoiceStatus.Open));
    }

    function test_RejectsStrayETH() public {
        vm.prank(buyer);
        (bool ok,) = address(checkout).call{value: 1}("");
        assertFalse(ok);
    }

    function testFuzz_SplitsConserveFunds(uint96 amount, uint16 bpsA) public {
        amount = uint96(bound(amount, 1, 1_000_000e6));
        bpsA = uint16(bound(bpsA, 1, 9999));
        address[] memory r = new address[](2);
        uint16[] memory b = new uint16[](2);
        (r[0], r[1]) = (seller, partner);
        (b[0], b[1]) = (bpsA, 10_000 - bpsA);
        vm.prank(seller);
        checkout.registerSeller("Fuzz", r, b);
        bytes32 key = _create("f", amount, 1);
        usdc.mint(buyer, amount);
        vm.startPrank(buyer);
        usdc.approve(address(checkout), amount);
        checkout.payWithUSDC(key);
        vm.stopPrank();
        assertEq(usdc.balanceOf(seller) + usdc.balanceOf(partner), amount);
        assertEq(usdc.balanceOf(address(checkout)), 0);
    }
}
