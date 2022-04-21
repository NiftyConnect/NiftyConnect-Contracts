pragma solidity 0.4.26;

import "./ERC20.sol";

contract TokenTransferProxy {

    /* Whether initialized. */
    bool public initialized = false;

    address public exchangeAddress;

    function initialize (address _exchangeAddress)
    public
    {
        require(!initialized);
        initialized = true;
        exchangeAddress = _exchangeAddress;
    }
    /**
     * Call ERC20 `transferFrom`
     *
     * @dev Authenticated contract only
     * @param token ERC20 token address
     * @param from From address
     * @param to To address
     * @param amount Transfer amount
     */
    function transferFrom(address token, address from, address to, uint amount)
    public
    returns (bool)
    {
        require(msg.sender==exchangeAddress, "not authorized");
        return ERC20(token).transferFrom(from, to, amount);
    }

}