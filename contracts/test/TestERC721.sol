pragma solidity 0.4.26;

import "../Ownable.sol";
import "openzeppelin-solidity/contracts/token/ERC721/ERC721.sol";

contract TestERC721 is ERC721,Ownable {

    string public name;
    string public symbol;

    uint256 public tokenIdIdx = 1;

    constructor (string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
    }

    function mint(address to) public {
        _mint(to, tokenIdIdx);
        tokenIdIdx++;
    }
}