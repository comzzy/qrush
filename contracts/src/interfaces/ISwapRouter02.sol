// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Subset of Uniswap SwapRouter02 (IV3SwapRouter) used for exact-output swaps.
interface ISwapRouter02 {
    struct ExactOutputParams {
        bytes path;
        address recipient;
        uint256 amountOut;
        uint256 amountInMaximum;
    }

    function exactOutput(ExactOutputParams calldata params) external payable returns (uint256 amountIn);
}

interface IWETH9 {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
}
