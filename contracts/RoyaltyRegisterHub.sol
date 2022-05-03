pragma solidity 0.4.26;

import "./Ownable.sol";
import "./IRoyaltyRegisterHub.sol";

import "openzeppelin-solidity/contracts/math/SafeMath.sol";

interface IOwnable {
    function owner() external view returns (address);
}

contract RoyaltyRegisterHub is IRoyaltyRegisterHub, Ownable {

    /* Inverse basis point. */
    uint public constant INVERSE_BASIS_POINT = 10000;
    uint public constant MAXIMUM_ROYALTY_RATE = 1000;

    bytes4 private constant OWNER_SELECTOR = 0x8da5cb5b; // owner()

    /* nft royalty rate, in basis points. */
    mapping(address => uint) public nftRoyaltyRateMap;
    /* nft royalty receiver */
    mapping(address => address) public nftRoyaltyReceiverMap;

    constructor() public {

    }

    function setRoyaltyRate(address _nftAddress, uint256 _royaltyRate, address _receiver) public onlyOwner returns (bool) {
        require(_royaltyRate<MAXIMUM_ROYALTY_RATE, "royalty rate too large");
        require(_receiver!=address(0x0), "invalid royalty receiver");

        nftRoyaltyRateMap[_nftAddress] = _royaltyRate;
        nftRoyaltyReceiverMap[_nftAddress] = _receiver;
        return true;
    }

    function setRoyaltyRateFromNFTOwners(address _nftAddress, uint256 _royaltyRate, address _receiver) public returns (bool) {
        require(_royaltyRate<MAXIMUM_ROYALTY_RATE, "royaltyRate too large");
        require(_receiver!=address(0x0), "invalid royalty receiver");

        bool success;
        bytes memory data = abi.encodeWithSelector(OWNER_SELECTOR);
        bytes memory result = new bytes(32);
        assembly {
            success := call(
            gas,            // gas remaining
            _nftAddress,      // destination address
            0,              // no ether
            add(data, 32),  // input buffer (starts after the first 32 bytes in the `data` array)
            mload(data),    // input length (loaded from the first 32 bytes in the `data` array)
            result,         // output buffer
            32              // output length
            )
        }
        require(success, "no owner method");
        address owner;
        assembly {
            owner := mload(result)
        }
        require(msg.sender == owner, "not authorized");

        nftRoyaltyRateMap[_nftAddress] = _royaltyRate;
        nftRoyaltyReceiverMap[_nftAddress] = _receiver;
        return true;
    }

    function royaltyInfo(address _nftAddress, uint256 _salePrice) external view returns (address, uint256) {
        address receiver = nftRoyaltyReceiverMap[_nftAddress];
        uint256 royaltyAmount = SafeMath.div(SafeMath.mul(nftRoyaltyRateMap[_nftAddress], _salePrice), INVERSE_BASIS_POINT);

        return (receiver, royaltyAmount);
    }

}