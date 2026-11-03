// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {Multicall} from "@openzeppelin/contracts/utils/Multicall.sol";
import {ISwapRouter02, IWETH9} from "./interfaces/ISwapRouter02.sol";

/// @title QRushCheckout
/// @notice USDC-settled checkout for QR codes and pay links. Buyers pay in USDC, any ERC20, or ETH;
///         non-USDC payments are swapped through Uniswap v3 with an exact-output swap bounded by a
///         buyer-supplied maximum input, so sellers always receive the exact USDC amount due.
contract QRushCheckout is ReentrancyGuard, EIP712, Multicall {
    using SafeERC20 for IERC20;

    uint16 public constant BPS = 10_000;
    uint256 public constant MAX_RECIPIENTS = 10;
    uint16 public constant MAX_LOYALTY_DISCOUNT_BPS = 5_000;

    bytes32 public constant ITEM_TYPEHASH = keccak256("Item(string name,uint32 quantity,uint256 unitPrice)");
    bytes32 public constant INVOICE_TYPEHASH = keccak256(
        "Invoice(bytes32 id,address seller,uint256 amount,uint64 expiresAt,uint32 maxUses,Item[] items)"
        "Item(string name,uint32 quantity,uint256 unitPrice)"
    );

    IERC20 public immutable usdc;
    address public immutable weth;
    ISwapRouter02 public immutable swapRouter;

    struct Item {
        string name;
        uint32 quantity;
        uint256 unitPrice;
    }

    struct InvoiceData {
        bytes32 id;
        address seller;
        uint256 amount;
        uint64 expiresAt;
        uint32 maxUses;
        Item[] items;
    }

    enum InvoiceStatus {
        None,
        Open,
        Completed,
        Cancelled
    }

    struct Invoice {
        address seller;
        uint64 expiresAt;
        uint32 maxUses;
        uint32 uses;
        InvoiceStatus status;
        uint256 amount;
        bytes32 itemsHash;
    }

    struct Split {
        address recipient;
        uint16 bps;
    }

    struct Seller {
        bool registered;
        uint32 loyaltyThreshold;
        uint16 loyaltyDiscountBps;
        string name;
    }

    mapping(address => Seller) private _sellers;
    mapping(address => Split[]) private _splits;
    mapping(bytes32 => Invoice) private _invoices;
    mapping(address seller => mapping(address buyer => uint256)) public purchaseCount;
    uint256 public receiptCount;

    event SellerRegistered(address indexed seller, string name);
    event SellerUpdated(address indexed seller, string name);
    event SplitsUpdated(address indexed seller, address[] recipients, uint16[] bps);
    event LoyaltyConfigured(address indexed seller, uint32 threshold, uint16 discountBps);
    event InvoiceCreated(
        bytes32 indexed invoiceId,
        bytes32 id,
        address indexed seller,
        uint256 amount,
        uint64 expiresAt,
        uint32 maxUses,
        bytes32 itemsHash,
        Item[] items
    );
    event InvoiceCancelled(bytes32 indexed invoiceId, address indexed seller);
    event PaymentReceived(
        uint256 indexed receiptId,
        bytes32 indexed invoiceId,
        address indexed seller,
        address buyer,
        address tokenIn,
        uint256 amountIn,
        uint256 grossAmount,
        uint256 discount,
        uint256 netAmount,
        uint256 purchaseNumber
    );
    event PayoutSent(uint256 indexed receiptId, address indexed recipient, uint256 amount);

    error NotRegistered();
    error AlreadyRegistered();
    error InvalidSplits();
    error InvalidLoyalty();
    error InvalidAmount();
    error InvalidItems();
    error InvoiceExists();
    error InvoiceNotOpen();
    error InvoiceExpired();
    error NotInvoiceSeller();
    error InvalidSignature();
    error InvalidPath();
    error DeadlineExpired();
    error InsufficientOutput();
    error EthTransferFailed();

    constructor(address usdc_, address weth_, address swapRouter_) EIP712("QRushCheckout", "1") {
        usdc = IERC20(usdc_);
        weth = weth_;
        swapRouter = ISwapRouter02(swapRouter_);
    }

    receive() external payable {
        if (msg.sender != weth) revert EthTransferFailed();
    }

    // ---------------------------------------------------------------- sellers

    function registerSeller(string calldata name, address[] calldata recipients, uint16[] calldata bps)
        external
    {
        Seller storage s = _sellers[msg.sender];
        if (s.registered) revert AlreadyRegistered();
        s.registered = true;
        s.name = name;
        emit SellerRegistered(msg.sender, name);
        _setSplits(msg.sender, recipients, bps);
    }

    function updateSellerName(string calldata name) external onlySeller {
        _sellers[msg.sender].name = name;
        emit SellerUpdated(msg.sender, name);
    }

    /// @notice Replace payout splits. An empty list routes 100% to the seller address.
    function setSplits(address[] calldata recipients, uint16[] calldata bps) external onlySeller {
        _setSplits(msg.sender, recipients, bps);
    }

    /// @notice Buyers with at least `threshold` completed purchases get `discountBps` off. threshold 0 disables.
    function setLoyalty(uint32 threshold, uint16 discountBps) external onlySeller {
        if (discountBps > MAX_LOYALTY_DISCOUNT_BPS || (threshold == 0 && discountBps != 0)) {
            revert InvalidLoyalty();
        }
        Seller storage s = _sellers[msg.sender];
        s.loyaltyThreshold = threshold;
        s.loyaltyDiscountBps = discountBps;
        emit LoyaltyConfigured(msg.sender, threshold, discountBps);
    }

    // --------------------------------------------------------------- invoices

    function createInvoice(InvoiceData calldata data) external onlySeller returns (bytes32) {
        if (data.seller != msg.sender) revert NotInvoiceSeller();
        return _storeInvoice(data);
    }

    /// @notice Publish an invoice signed offchain by a seller (EOA or ERC-1271 smart account).
    function publishInvoice(InvoiceData calldata data, bytes calldata signature) external returns (bytes32) {
        if (!_sellers[data.seller].registered) revert NotRegistered();
        bytes32 digest = hashInvoice(data);
        // ECDSA first so EIP-7702 delegated EOAs keep working even if their delegate lacks ERC-1271.
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, signature);
        if (
            !(err == ECDSA.RecoverError.NoError && recovered == data.seller)
                && !SignatureChecker.isValidERC1271SignatureNow(data.seller, digest, signature)
        ) revert InvalidSignature();
        return _storeInvoice(data);
    }

    /// @notice Cancel an open invoice, or pre-emptively void a signed invoice that was never published.
    /// @param id The seller-chosen invoice id (not the derived invoice key).
    function cancelInvoice(bytes32 id) external {
        bytes32 invoiceId = invoiceKey(msg.sender, id);
        Invoice storage inv = _invoices[invoiceId];
        if (inv.status == InvoiceStatus.None) {
            inv.seller = msg.sender;
        } else if (inv.status != InvoiceStatus.Open) {
            revert InvoiceNotOpen();
        }
        inv.status = InvoiceStatus.Cancelled;
        emit InvoiceCancelled(invoiceId, msg.sender);
    }

    // --------------------------------------------------------------- payments

    function payWithUSDC(bytes32 invoiceId) external nonReentrant returns (uint256 receiptId) {
        (Invoice storage inv, uint256 gross, uint256 discount) = _prepare(invoiceId, msg.sender);
        uint256 net = gross - discount;
        usdc.safeTransferFrom(msg.sender, address(this), net);
        receiptId = _settle(invoiceId, inv, msg.sender, address(usdc), net, gross, discount);
    }

    /// @param path Uniswap v3 exact-output path: USDC, fee, [token, fee]..., tokenIn.
    /// @param maxAmountIn Maximum tokenIn the buyer is willing to spend; unspent input is refunded.
    function payWithToken(bytes32 invoiceId, bytes calldata path, uint256 maxAmountIn, uint256 deadline)
        external
        nonReentrant
        returns (uint256 receiptId)
    {
        if (block.timestamp > deadline) revert DeadlineExpired();
        address tokenIn = _validatePath(path);
        if (tokenIn == address(usdc)) revert InvalidPath();
        (Invoice storage inv, uint256 gross, uint256 discount) = _prepare(invoiceId, msg.sender);
        uint256 net = gross - discount;

        IERC20 token = IERC20(tokenIn);
        uint256 balanceBefore = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), maxAmountIn);
        uint256 received = token.balanceOf(address(this)) - balanceBefore;

        uint256 spent = _swapExactOutput(token, path, net, received);
        if (received > spent) token.safeTransfer(msg.sender, received - spent);

        receiptId = _settle(invoiceId, inv, msg.sender, tokenIn, spent, gross, discount);
    }

    /// @param path Uniswap v3 exact-output path ending in WETH. msg.value is the maximum ETH spent.
    function payWithETH(bytes32 invoiceId, bytes calldata path, uint256 deadline)
        external
        payable
        nonReentrant
        returns (uint256 receiptId)
    {
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (_validatePath(path) != weth) revert InvalidPath();
        (Invoice storage inv, uint256 gross, uint256 discount) = _prepare(invoiceId, msg.sender);
        uint256 net = gross - discount;

        IWETH9(weth).deposit{value: msg.value}();
        uint256 spent = _swapExactOutput(IERC20(weth), path, net, msg.value);
        uint256 refund = msg.value - spent;
        if (refund > 0) {
            IWETH9(weth).withdraw(refund);
            (bool ok,) = msg.sender.call{value: refund}("");
            if (!ok) revert EthTransferFailed();
        }

        receiptId = _settle(invoiceId, inv, msg.sender, address(0), spent, gross, discount);
    }

    // ------------------------------------------------------------------ views

    function getSeller(address seller) external view returns (Seller memory) {
        return _sellers[seller];
    }

    function getSplits(address seller) external view returns (Split[] memory) {
        return _splits[seller];
    }

    function getInvoice(bytes32 invoiceId) external view returns (Invoice memory) {
        return _invoices[invoiceId];
    }

    /// @notice Price the buyer would pay right now, after loyalty discount.
    function quote(bytes32 invoiceId, address buyer) external view returns (uint256 net, uint256 discount) {
        Invoice storage inv = _invoices[invoiceId];
        discount = _discountFor(inv.seller, buyer, inv.amount);
        net = inv.amount - discount;
    }

    function loyaltyStatus(address seller, address buyer)
        external
        view
        returns (uint256 purchases, uint32 threshold, uint16 discountBps, bool eligible)
    {
        Seller storage s = _sellers[seller];
        purchases = purchaseCount[seller][buyer];
        threshold = s.loyaltyThreshold;
        discountBps = s.loyaltyDiscountBps;
        eligible = threshold != 0 && purchases >= threshold;
    }

    /// @notice Invoices are namespaced per seller so ids cannot be squatted by other accounts.
    function invoiceKey(address seller, bytes32 id) public pure returns (bytes32) {
        return keccak256(abi.encode(seller, id));
    }

    function hashItems(Item[] calldata items) public pure returns (bytes32) {
        bytes32[] memory hashes = new bytes32[](items.length);
        for (uint256 i; i < items.length; ++i) {
            hashes[i] = keccak256(
                abi.encode(
                    ITEM_TYPEHASH, keccak256(bytes(items[i].name)), items[i].quantity, items[i].unitPrice
                )
            );
        }
        return keccak256(abi.encodePacked(hashes));
    }

    function hashInvoice(InvoiceData calldata data) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    INVOICE_TYPEHASH,
                    data.id,
                    data.seller,
                    data.amount,
                    data.expiresAt,
                    data.maxUses,
                    hashItems(data.items)
                )
            )
        );
    }

    // --------------------------------------------------------------- internal

    modifier onlySeller() {
        if (!_sellers[msg.sender].registered) revert NotRegistered();
        _;
    }

    function _setSplits(address seller, address[] calldata recipients, uint16[] calldata bps) internal {
        if (recipients.length != bps.length || recipients.length > MAX_RECIPIENTS) revert InvalidSplits();
        delete _splits[seller];
        if (recipients.length > 0) {
            uint256 total;
            for (uint256 i; i < recipients.length; ++i) {
                if (recipients[i] == address(0) || bps[i] == 0) revert InvalidSplits();
                total += bps[i];
                _splits[seller].push(Split(recipients[i], bps[i]));
            }
            if (total != BPS) revert InvalidSplits();
        }
        emit SplitsUpdated(seller, recipients, bps);
    }

    function _storeInvoice(InvoiceData calldata data) internal returns (bytes32 invoiceId) {
        if (data.amount == 0) revert InvalidAmount();
        if (data.expiresAt != 0 && data.expiresAt <= block.timestamp) revert InvoiceExpired();
        invoiceId = invoiceKey(data.seller, data.id);
        if (_invoices[invoiceId].status != InvoiceStatus.None) revert InvoiceExists();
        if (data.items.length > 0) {
            uint256 total;
            for (uint256 i; i < data.items.length; ++i) {
                if (data.items[i].quantity == 0) revert InvalidItems();
                total += uint256(data.items[i].quantity) * data.items[i].unitPrice;
            }
            if (total != data.amount) revert InvalidItems();
        }
        bytes32 itemsHash = hashItems(data.items);
        _invoices[invoiceId] = Invoice({
            seller: data.seller,
            expiresAt: data.expiresAt,
            maxUses: data.maxUses,
            uses: 0,
            status: InvoiceStatus.Open,
            amount: data.amount,
            itemsHash: itemsHash
        });
        emit InvoiceCreated(
            invoiceId, data.id, data.seller, data.amount, data.expiresAt, data.maxUses, itemsHash, data.items
        );
    }

    function _prepare(bytes32 invoiceId, address buyer)
        internal
        view
        returns (Invoice storage inv, uint256 gross, uint256 discount)
    {
        inv = _invoices[invoiceId];
        if (inv.status != InvoiceStatus.Open) revert InvoiceNotOpen();
        if (inv.expiresAt != 0 && block.timestamp > inv.expiresAt) revert InvoiceExpired();
        gross = inv.amount;
        discount = _discountFor(inv.seller, buyer, gross);
    }

    function _discountFor(address seller, address buyer, uint256 amount) internal view returns (uint256) {
        Seller storage s = _sellers[seller];
        if (s.loyaltyThreshold == 0 || purchaseCount[seller][buyer] < s.loyaltyThreshold) return 0;
        return (amount * s.loyaltyDiscountBps) / BPS;
    }

    function _validatePath(bytes calldata path) internal view returns (address tokenIn) {
        if (path.length < 43 || (path.length - 20) % 23 != 0) revert InvalidPath();
        if (address(bytes20(path[:20])) != address(usdc)) revert InvalidPath();
        tokenIn = address(bytes20(path[path.length - 20:]));
    }

    function _swapExactOutput(IERC20 tokenIn, bytes calldata path, uint256 amountOut, uint256 maxIn)
        internal
        returns (uint256 spent)
    {
        uint256 usdcBefore = usdc.balanceOf(address(this));
        tokenIn.forceApprove(address(swapRouter), maxIn);
        spent = swapRouter.exactOutput(
            ISwapRouter02.ExactOutputParams({
                path: path, recipient: address(this), amountOut: amountOut, amountInMaximum: maxIn
            })
        );
        tokenIn.forceApprove(address(swapRouter), 0);
        if (usdc.balanceOf(address(this)) - usdcBefore < amountOut) revert InsufficientOutput();
    }

    function _settle(
        bytes32 invoiceId,
        Invoice storage inv,
        address buyer,
        address tokenIn,
        uint256 amountIn,
        uint256 gross,
        uint256 discount
    ) internal returns (uint256 receiptId) {
        address seller = inv.seller;
        unchecked {
            inv.uses += 1;
        }
        if (inv.maxUses != 0 && inv.uses >= inv.maxUses) inv.status = InvoiceStatus.Completed;

        uint256 purchaseNumber = ++purchaseCount[seller][buyer];
        receiptId = ++receiptCount;
        uint256 net = gross - discount;

        emit PaymentReceived(
            receiptId, invoiceId, seller, buyer, tokenIn, amountIn, gross, discount, net, purchaseNumber
        );

        Split[] storage splits = _splits[seller];
        uint256 n = splits.length;
        if (n == 0) {
            usdc.safeTransfer(seller, net);
            emit PayoutSent(receiptId, seller, net);
            return receiptId;
        }
        uint256 remaining = net;
        for (uint256 i; i < n; ++i) {
            uint256 share = i == n - 1 ? remaining : (net * splits[i].bps) / BPS;
            remaining -= share;
            if (share > 0) usdc.safeTransfer(splits[i].recipient, share);
            emit PayoutSent(receiptId, splits[i].recipient, share);
        }
    }
}
