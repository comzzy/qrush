// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ISwapRouter02} from "../../src/interfaces/ISwapRouter02.sol";

contract MockERC20 is ERC20 {
    uint8 private immutable _dec;

    constructor(string memory n, string memory s, uint8 d) ERC20(n, s) {
        _dec = d;
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockWETH is MockERC20 {
    constructor() MockERC20("Wrapped Ether", "WETH", 18) {}

    function deposit() external payable {
        _mint(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        _burn(msg.sender, amount);
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok);
    }
}

/// @dev Exact-output router double: charges `rate` input wei per USDC unit and pays out from its USDC reserve.
contract MockSwapRouter is ISwapRouter02 {
    IERC20 public immutable usdc;
    uint256 public rate;
    uint256 public shortfall;

    constructor(IERC20 usdc_, uint256 rate_) {
        usdc = usdc_;
        rate = rate_;
    }

    function setShortfall(uint256 s) external {
        shortfall = s;
    }

    function exactOutput(ExactOutputParams calldata p) external payable returns (uint256 amountIn) {
        address tokenIn = address(bytes20(p.path[p.path.length - 20:]));
        amountIn = p.amountOut * rate;
        require(amountIn <= p.amountInMaximum, "Too much requested");
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        usdc.transfer(p.recipient, p.amountOut - shortfall);
    }
}

/// @dev Minimal ERC-1271 smart wallet controlled by a single EOA owner.
contract MockERC1271Wallet {
    address public immutable owner;

    constructor(address owner_) {
        owner = owner_;
    }

    function execute(address target, bytes calldata data) external returns (bytes memory) {
        require(msg.sender == owner, "not owner");
        (bool ok, bytes memory ret) = target.call(data);
        require(ok, "call failed");
        return ret;
    }

    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        (bytes32 r, bytes32 s) = abi.decode(signature[:64], (bytes32, bytes32));
        uint8 v = uint8(signature[64]);
        return ecrecover(hash, v, r, s) == owner ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
    }
}
