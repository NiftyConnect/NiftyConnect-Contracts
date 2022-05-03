pragma solidity 0.4.26;

import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC20/SafeERC20.sol";

contract TokenTransferProxy {
    using SafeERC20 for IERC20;

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
     * @param token IERC20 token address
     * @param from From address
     * @param to To address
     * @param amount Transfer amount
     */
    function transferFrom(address token, address from, address to, uint amount)
    public
    returns (bool)
    {
        require(msg.sender==exchangeAddress, "not authorized");
        IERC20(token).safeTransferFrom(from, to, amount);
        return true;
    }

}