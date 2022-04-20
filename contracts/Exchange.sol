pragma solidity 0.4.26;

import "./SafeMath.sol";
import "./ExchangeCore.sol";
import "./SaleKindInterface.sol";
import "./AuthenticatedProxy.sol";

contract Exchange is ExchangeCore {

    constructor (address _merkleValidator, address _royaltyRegisterHub) ExchangeCore(_merkleValidator, _royaltyRegisterHub) public {
    }

    enum MerkleValidatorSelector {
        MatchERC721UsingCriteria,
        MatchERC721WithSafeTransferUsingCriteria,
        MatchERC1155UsingCriteria
    }

    function splitToMerkleRootAndProof(bytes32[] memory merkleData) public view returns(bytes32, bytes32[]) {
        bytes32 merkleRoot;
        bytes32[] memory merkleProof;
        if (merkleData.length > 0) {
            merkleRoot = merkleData[merkleData.length-1];
            // reduce merkleData length
            assembly {
                mstore(merkleData, sub(mload(merkleData), 1))
            }
            merkleProof = merkleData;
        }
        return (merkleRoot, merkleProof);
    }

    function buildCallData(
        uint selector,
        address from,
        address to,
        address nftAddress,
        uint256 tokenId,
        uint256 amount,
        bytes32 merkleRoot,
        bytes32[] memory merkleProof)
    public view returns(bytes) {
        MerkleValidatorSelector merkleValidatorSelector = MerkleValidatorSelector(selector);
        if (merkleValidatorSelector == MerkleValidatorSelector.MatchERC721UsingCriteria) {
            return abi.encodeWithSignature("matchERC721UsingCriteria(address,address,address,uint256,bytes32,bytes32[])", from, to, nftAddress, tokenId, merkleRoot, merkleProof);
        } else if (merkleValidatorSelector == MerkleValidatorSelector.MatchERC721WithSafeTransferUsingCriteria) {
            return abi.encodeWithSignature("matchERC721WithSafeTransferUsingCriteria(address,address,address,uint256,bytes32,bytes32[])", from, to, nftAddress, tokenId, merkleRoot, merkleProof);
        } else if (merkleValidatorSelector == MerkleValidatorSelector.MatchERC1155UsingCriteria) {
            return abi.encodeWithSignature("matchERC1155UsingCriteria(address,address,address,uint256,uint256,bytes32,bytes32[])", from, to, nftAddress, tokenId, amount, merkleRoot, merkleProof);
        } else {
            return new bytes(0);
        }
    }

    function buildCallDataInternal(
        address from,
        address to,
        address nftAddress,
        uint[9] uints,
        bytes32 merkleRoot)
    internal view returns(bytes) {
        bytes32[] memory merkleProof;
        if (uints[8]==0) {
            require(merkleRoot==bytes32(0x00), "invalid merkleRoot");
            return buildCallData(uints[5],from,to,nftAddress,uints[6],uints[7],merkleRoot,merkleProof);
        }
        require(uints[8]>=2&&merkleRoot!=bytes32(0x00), "invalid merkle data");
        uint256 merkleProofLength;
        uint256 divResult = uints[8];
        bool hasMod = false;
        for(;divResult!=0;) {
            uint256 tempDivResult = divResult/2;
            if (SafeMath.mul(tempDivResult, 2)<divResult) {
                hasMod = true;
            }
            divResult=tempDivResult;
            merkleProofLength++;
        }
        if (!hasMod) {
            merkleProofLength--;
        }
        merkleProof = new bytes32[](merkleProofLength);
        require(merkleRoot!=bytes32(0x00), "invalid merkleRoot");
        return buildCallData(uints[5],from,to,nftAddress,uints[6],uints[7],merkleRoot,merkleProof);
    }

    /**
     * @dev Call guardedArrayReplace - library function exposed for testing.
     */
    function guardedArrayReplace(bytes array, bytes desired, bytes mask)
    public
    pure
    returns (bytes)
    {
        ArrayUtils.guardedArrayReplace(array, desired, mask);
        return array;
    }

    /**
     * @dev Call calculateFinalPrice - library function exposed for testing.
     */
    function calculateFinalPrice(SaleKindInterface.Side side, SaleKindInterface.SaleKind saleKind, uint basePrice, uint extra, uint listingTime, uint expirationTime)
    public
    view
    returns (uint)
    {
        return SaleKindInterface.calculateFinalPrice(side, saleKind, basePrice, extra, listingTime, expirationTime);
    }

    /**
     * @dev Call hashOrder - Solidity ABI encoding limitation workaround, hopefully temporary.
     */
    function hashToSign_(
        address[10] addrs,
        uint[9] uints,
        SaleKindInterface.Side side,
        SaleKindInterface.SaleKind saleKind,
        bytes replacementPattern,
        bytes staticExtradata,
        bytes32 merkleRoot)
    public
    view
    returns (bytes32)
    {
        bytes memory orderCallData = buildCallDataInternal(addrs[8],addrs[9],addrs[5],uints,merkleRoot);
        return hashToSign(
            Order(addrs[0], addrs[1], addrs[2], addrs[3], addrs[4], side, saleKind, addrs[5], uints[6], orderCallData, replacementPattern, addrs[6], staticExtradata, ERC20(addrs[7]), uints[0], uints[1], uints[2], uints[3], uints[4]),
            nonces[addrs[1]]
        );
    }

    /**
     * @dev Call validateOrderParameters - Solidity ABI encoding limitation workaround, hopefully temporary.
     */
    function validateOrderParameters_ (
        address[10] addrs,
        uint[9] uints,
        SaleKindInterface.Side side,
        SaleKindInterface.SaleKind saleKind,
        bytes replacementPattern,
        bytes staticExtradata,
        bytes32 merkleRoot)
    view
    public
    returns (bool) {
        bytes memory orderCallData = buildCallDataInternal(addrs[8],addrs[9],addrs[5],uints,merkleRoot);
        Order memory order = Order(addrs[0], addrs[1], addrs[2], addrs[3], addrs[4], side, saleKind, addrs[5], uints[6], orderCallData, replacementPattern, addrs[6], staticExtradata, ERC20(addrs[7]), uints[0], uints[1], uints[2], uints[3], uints[4]);
        return validateOrderParameters(
            order
        );
    }

    /**
     * @dev Call validateOrder - Solidity ABI encoding limitation workaround, hopefully temporary.
     */
    function validateOrder_ (
        address[10] addrs,
        uint[9] uints,
        SaleKindInterface.Side side,
        SaleKindInterface.SaleKind saleKind,
        bytes replacementPattern,
        bytes staticExtradata,
        bytes32 merkleRoot)
    view
    public
    returns (bool)
    {
        bytes memory orderCallData = buildCallDataInternal(addrs[8],addrs[9],addrs[5],uints,merkleRoot);
        Order memory order = Order(addrs[0], addrs[1], addrs[2], addrs[3], addrs[4], side, saleKind, addrs[5], uints[6], orderCallData, replacementPattern, addrs[6], staticExtradata, ERC20(addrs[7]), uints[0], uints[1], uints[2], uints[3], uints[4]);
        return validateOrder(
            hashToSign(order, nonces[order.maker]),
            order
        );
    }

    /**
     * @dev Call approveOrder - Solidity ABI encoding limitation workaround, hopefully temporary.
     */
    function approveOrder_ (
        address[10] addrs,
        uint[9] uints,
        SaleKindInterface.Side side,
        SaleKindInterface.SaleKind saleKind,
        bytes replacementPattern,
        bytes staticExtradata,
        bool orderbookInclusionDesired,
        bytes32[2] merkleData)
    public
    {
        bytes memory orderCallData = buildCallDataInternal(addrs[8],addrs[9],addrs[5],uints,merkleData[0]);
        Order memory order = Order(addrs[0], addrs[1], addrs[2], addrs[3], addrs[4], side, saleKind, addrs[5], uints[6], orderCallData, replacementPattern, addrs[6], staticExtradata, ERC20(addrs[7]), uints[0], uints[1], uints[2], uints[3], uints[4]);
        return approveOrder(order, merkleData[1], orderbookInclusionDesired);
    }

    /**
     * @dev Call cancelOrder - Solidity ABI encoding limitation workaround, hopefully temporary.
     */
    function cancelOrder_(
        address[10] addrs,
        uint[9] uints,
        SaleKindInterface.Side side,
        SaleKindInterface.SaleKind saleKind,
        bytes replacementPattern,
        bytes staticExtradata,
        bytes32 merkleRoot)
    public
    {
        bytes memory orderCallData = buildCallDataInternal(addrs[8],addrs[9],addrs[5],uints,merkleRoot);
        Order memory order = Order(addrs[0], addrs[1], addrs[2], addrs[3], addrs[4], side, saleKind, addrs[5], uints[6], orderCallData, replacementPattern, addrs[6], staticExtradata, ERC20(addrs[7]), uints[0], uints[1], uints[2], uints[3], uints[4]);
        return cancelOrder(
            order,
            nonces[order.maker]
        );
    }

    /**
     * @dev Call calculateCurrentPrice - Solidity ABI encoding limitation workaround, hopefully temporary.
     */
    function calculateCurrentPrice_(
        address[10] addrs,
        uint[9] uints,
        SaleKindInterface.Side side,
        SaleKindInterface.SaleKind saleKind,
        bytes replacementPattern,
        bytes staticExtradata,
        bytes32 merkleRoot)
    public
    view
    returns (uint)
    {
        bytes memory orderCallData = buildCallDataInternal(addrs[8],addrs[9],addrs[5],uints,merkleRoot);
        return calculateCurrentPrice(
            Order(addrs[0], addrs[1], addrs[2], addrs[3], addrs[4], side, saleKind, addrs[5], uints[6], orderCallData, replacementPattern, addrs[6], staticExtradata, ERC20(addrs[7]), uints[0], uints[1], uints[2], uints[3], uints[4])
        );
    }

    /**
     * @dev Call ordersCanMatch - Solidity ABI encoding limitation workaround, hopefully temporary.
     */
    function ordersCanMatch_(
        address[16] addrs,
        uint[12] uints,
        uint8[4] sidesKinds,
        bytes calldataBuy,
        bytes calldataSell,
        bytes replacementPatternBuy,
        bytes replacementPatternSell,
        bytes staticExtradataBuy,
        bytes staticExtradataSell)
    public
    view
    returns (bool)
    {
        Order memory buy = Order(addrs[0], addrs[1], addrs[2], addrs[3], addrs[4], SaleKindInterface.Side(sidesKinds[0]), SaleKindInterface.SaleKind(sidesKinds[1]), addrs[5], uints[5], calldataBuy, replacementPatternBuy, addrs[6], staticExtradataBuy, ERC20(addrs[7]), uints[0], uints[1], uints[2], uints[3], uints[4]);
        Order memory sell = Order(addrs[8], addrs[9], addrs[10], addrs[11], addrs[12], SaleKindInterface.Side(sidesKinds[2]), SaleKindInterface.SaleKind(sidesKinds[3]), addrs[13], uints[11], calldataSell, replacementPatternSell, addrs[14], staticExtradataSell, ERC20(addrs[15]), uints[6], uints[7], uints[8], uints[9], uints[10]);
        return ordersCanMatch(
            buy,
            sell
        );
    }

    /**
     * @dev Return whether or not two orders' calldata specifications can match
     * @param buyCalldata Buy-side order calldata
     * @param buyReplacementPattern Buy-side order calldata replacement mask
     * @param sellCalldata Sell-side order calldata
     * @param sellReplacementPattern Sell-side order calldata replacement mask
     * @return Whether the orders' calldata can be matched
     */
    function orderCalldataCanMatch(bytes buyCalldata, bytes buyReplacementPattern, bytes sellCalldata, bytes sellReplacementPattern)
    public
    pure
    returns (bool)
    {
        if (buyReplacementPattern.length > 0) {
            ArrayUtils.guardedArrayReplace(buyCalldata, sellCalldata, buyReplacementPattern);
        }
        if (sellReplacementPattern.length > 0) {
            ArrayUtils.guardedArrayReplace(sellCalldata, buyCalldata, sellReplacementPattern);
        }
        return ArrayUtils.arrayEq(buyCalldata, sellCalldata);
    }

    /**
     * @dev Call calculateMatchPrice - Solidity ABI encoding limitation workaround, hopefully temporary.
     */
    function calculateMatchPrice_(
        address[16] addrs,
        uint[12] uints,
        uint8[4] sidesKinds,
        bytes calldataBuy,
        bytes calldataSell,
        bytes replacementPatternBuy,
        bytes replacementPatternSell,
        bytes staticExtradataBuy,
        bytes staticExtradataSell)
    public
    view
    returns (uint)
    {
        Order memory buy = Order(addrs[0], addrs[1], addrs[2], addrs[3], addrs[4], SaleKindInterface.Side(sidesKinds[0]), SaleKindInterface.SaleKind(sidesKinds[1]), addrs[5], uints[5], calldataBuy, replacementPatternBuy, addrs[6], staticExtradataBuy, ERC20(addrs[7]), uints[0], uints[1], uints[2], uints[3], uints[4]);
        Order memory sell = Order(addrs[8], addrs[9], addrs[10], addrs[11], addrs[12], SaleKindInterface.Side(sidesKinds[2]), SaleKindInterface.SaleKind(sidesKinds[3]), addrs[13], uints[11], calldataSell, replacementPatternSell, addrs[14], staticExtradataSell, ERC20(addrs[15]), uints[6], uints[7], uints[8], uints[9], uints[10]);
        return calculateMatchPrice(
            buy,
            sell
        );
    }

    /**
     * @dev Call atomicMatch - Solidity ABI encoding limitation workaround, hopefully temporary.
     */
    function atomicMatch_(
        address[16] addrs,
        uint[12] uints,
        uint8[4] sidesKinds,
        bytes calldataBuy,
        bytes calldataSell,
        bytes replacementPatternBuy,
        bytes replacementPatternSell,
        bytes staticExtradataBuy,
        bytes staticExtradataSell,
        bytes32 rssMetadata)
    public
    payable
    {

        return atomicMatch(
            Order(addrs[0], addrs[1], addrs[2], addrs[3], addrs[4], SaleKindInterface.Side(sidesKinds[0]), SaleKindInterface.SaleKind(sidesKinds[1]), addrs[5], uints[5], calldataBuy, replacementPatternBuy, addrs[6], staticExtradataBuy, ERC20(addrs[7]), uints[0], uints[1], uints[2], uints[3], uints[4]),
            Order(addrs[8], addrs[9], addrs[10], addrs[11], addrs[12], SaleKindInterface.Side(sidesKinds[2]), SaleKindInterface.SaleKind(sidesKinds[3]), addrs[13], uints[11], calldataSell, replacementPatternSell, addrs[14], staticExtradataSell, ERC20(addrs[15]), uints[6], uints[7], uints[8], uints[9], uints[10]),
            rssMetadata
        );
    }

}