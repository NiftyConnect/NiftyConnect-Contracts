pragma solidity 0.4.26;

import "./Exchange.sol";
import "./TokenTransferProxy.sol";

contract NiftyConnectExchange is Exchange {
    /**
     * @dev Initialize a NiftyConnectExchange instance
     */
    constructor (
        TokenTransferProxy tokenTransferProxyAddress,
        address protocolFeeAddress,
        address merkleValidatorAddress,
        address royaltyRegisterHubAddress)
    public {
        tokenTransferProxy = tokenTransferProxyAddress;
        protocolFeeRecipient = protocolFeeAddress;
        merkleValidatorContract = merkleValidatorAddress;
        royaltyRegisterHub = royaltyRegisterHubAddress;
    }
}