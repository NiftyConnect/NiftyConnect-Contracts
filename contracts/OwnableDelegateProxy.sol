pragma solidity 0.4.26;

import "./Ownable.sol";
import "./OwnedUpgradeabilityProxy.sol";

contract OwnableDelegateProxy is OwnedUpgradeabilityProxy {

    constructor(address owner, address initialImplementation, bytes calldata)
    public
    {
        setUpgradeabilityOwner(owner);
        _upgradeTo(initialImplementation);
        require(initialImplementation.delegatecall(calldata));
    }

}