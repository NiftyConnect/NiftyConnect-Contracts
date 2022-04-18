pragma solidity 0.4.26;

import "./Exchange.sol";
import "./ProxyRegistry.sol";
import "./TokenTransferProxy.sol";
import "./ERC20.sol";

contract NiftyConnectExchange is Exchange {
    /**
     * @dev Initialize a NiftyConnectExchange instance
     * @param registryAddress Address of the registry instance which this Exchange instance will use
     */
    constructor (
        ProxyRegistry registryAddress,
        TokenTransferProxy tokenTransferProxyAddress,
        address protocolFeeAddress,
        address merkleValidator,
        address royaltyRegisterHub)
    Exchange(merkleValidator, royaltyRegisterHub) public {
        registry = registryAddress;
        tokenTransferProxy = tokenTransferProxyAddress;
        protocolFeeRecipient = protocolFeeAddress;
        owner = msg.sender;
    }
}