pragma solidity 0.4.26;

import "../IFeeCalculator.sol";
import "../Governable.sol";

contract TestFeeCalculator is IFeeCalculator, Governable {
    uint public exchangeFeeRate = 200;
    function calculateFee(address seller) external view returns (uint256) {
        return exchangeFeeRate;
    }

    function changeExchangeFeeRate(uint256 newExchangeFeeRate) public {
        exchangeFeeRate = newExchangeFeeRate;
    }
}