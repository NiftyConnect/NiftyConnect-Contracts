pragma solidity 0.4.26;

import "../Ownable.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";

contract TestERC20 is ERC20,Ownable {

    string public name;
    string public symbol;
    uint256 public decimals;

    constructor (string memory _name, string memory _symbol, uint256 _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
    }

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }
}