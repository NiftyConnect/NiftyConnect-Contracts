pragma solidity 0.4.26;

import "./TokenTransferProxy.sol";

contract NiftyConnectTokenTransferProxy is TokenTransferProxy {

    constructor (ProxyRegistry registryAddr)
    public
    {
        registry = registryAddr;
    }

}