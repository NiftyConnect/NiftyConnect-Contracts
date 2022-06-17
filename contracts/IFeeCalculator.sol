pragma solidity 0.4.26;

interface IFeeCalculator {
    function calculateFee(address seller) external view returns (uint256 feeRate); // Inverse basis point 10000
}