pragma solidity 0.4.26;

///
/// @dev Interface for the NFT Royalty Standard
///

interface IRoyaltyRegisterHub {
    /// @notice Called with the sale price to determine how much royalty
    //          is owed and to whom.
    /// @param _nftAddress - the NFT contract address
    /// @param _salePrice - the sale price of the NFT asset specified by _tokenId
    /// @return receiver - address of who should be sent the royalty payment
    /// @return royaltyAmount - the royalty payment amount for _salePrice
    function royaltyInfo(address _nftAddress, uint256 _salePrice)  external view returns (address receiver, uint256 royaltyAmount);
}