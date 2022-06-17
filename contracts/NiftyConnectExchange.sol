pragma solidity 0.4.26;
pragma experimental ABIEncoderV2;

import "./ExchangeCore.sol";
import "./SaleKindInterface.sol";
import "./TokenTransferProxy.sol";

contract NiftyConnectExchange is ExchangeCore {

    bytes4 private constant MAKE_ORDER_SELECTOR = 0x97cea71b; // bytes4(keccak256("makeOrder_(address[10],uint256[9],uint8,uint8,bytes,bytes,bytes32[2])"));
    bytes4 private constant TAKE_ORDER_SELECTOR = 0x7da26f55; // bytes4(keccak256("takeOrder_(address[16],uint256[12],uint8[4],bytes,bytes,bytes,bytes,bytes,bytes,bytes32)"));

    enum MerkleValidatorSelector {
        MatchERC721UsingCriteria,
        MatchERC721WithSafeTransferUsingCriteria,
        MatchERC1155UsingCriteria
    }

    constructor (
        TokenTransferProxy tokenTransferProxyAddress,
        address protocolFeeAddress,
        address merkleValidatorAddress,
        address royaltyRegisterHubAddress,
        address feeRateCalculatorAddress)
    public {
        tokenTransferProxy = tokenTransferProxyAddress;
        protocolFeeRecipient = protocolFeeAddress;
        merkleValidatorContract = merkleValidatorAddress;
        royaltyRegisterHub = royaltyRegisterHubAddress;
        feeRateCalculator = feeRateCalculatorAddress;
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
        return buildCallData(uints[5],from,to,nftAddress,uints[6],uints[7],merkleRoot,merkleProof);
    }

    function guardedArrayReplace(bytes array, bytes desired, bytes mask)
    public
    pure
    returns (bytes)
    {
        ArrayUtils.guardedArrayReplace(array, desired, mask);
        return array;
    }

    function calculateFinalPrice(SaleKindInterface.Side side, SaleKindInterface.SaleKind saleKind, uint basePrice, uint extra, uint listingTime, uint expirationTime)
    public
    view
    returns (uint)
    {
        return SaleKindInterface.calculateFinalPrice(side, saleKind, basePrice, extra, listingTime, expirationTime);
    }

    function hashToSign_(
        address[9] addrs,
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
        bytes memory orderCallData = buildCallDataInternal(addrs[7],addrs[8],addrs[4],uints,merkleRoot);
        return hashToSign(
            Order(addrs[0], addrs[1], addrs[2], addrs[3], address(0x00), side, saleKind, addrs[4], uints[6], orderCallData, replacementPattern, addrs[5], staticExtradata, IERC20(addrs[6]), uints[0], uints[1], uints[2], uints[3], uints[4]),
            nonces[addrs[1]]
        );
    }

    function validateOrderParameters_ (
        address[9] addrs,
        uint[9] uints,
        SaleKindInterface.Side side,
        SaleKindInterface.SaleKind saleKind,
        bytes replacementPattern,
        bytes staticExtradata,
        bytes32 merkleRoot)
    view
    public
    returns (bool) {
        bytes memory orderCallData = buildCallDataInternal(addrs[7],addrs[8],addrs[4],uints,merkleRoot);
        Order memory order = Order(addrs[0], addrs[1], addrs[2], addrs[3], address(0x00), side, saleKind, addrs[4], uints[6], orderCallData, replacementPattern, addrs[5], staticExtradata, IERC20(addrs[6]), uints[0], uints[1], uints[2], uints[3], uints[4]);
        return validateOrderParameters(
            order
        );
    }

    function validateOrder_ (
        address[9] addrs,
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
        bytes memory orderCallData = buildCallDataInternal(addrs[7],addrs[8],addrs[4],uints,merkleRoot);
        Order memory order = Order(addrs[0], addrs[1], addrs[2], addrs[3], address(0x00), side, saleKind, addrs[4], uints[6], orderCallData, replacementPattern, addrs[5], staticExtradata, IERC20(addrs[6]), uints[0], uints[1], uints[2], uints[3], uints[4]);
        return validateOrder(
            hashToSign(order, nonces[order.maker]),
            order
        );
    }

    function makeOrder_ (
        address[9] addrs,
        uint[9] uints,
        SaleKindInterface.Side side,
        SaleKindInterface.SaleKind saleKind,
        bytes replacementPattern,
        bytes staticExtradata,
        bytes32[2] merkleData)
    public
    {
        bytes memory orderCallData = buildCallDataInternal(addrs[7],addrs[8],addrs[4],uints,merkleData[0]);
        require(addrs[3]!=address(0x00), "makerRelayerFeeRecipient must not be zero");
        require(orderCallData.length==replacementPattern.length, "replacement pattern length mismatch");
        Order memory order = Order(addrs[0], addrs[1], addrs[2], addrs[3], address(0x00), side, saleKind, addrs[4], uints[6], orderCallData, replacementPattern, addrs[5], staticExtradata, IERC20(addrs[6]), uints[0], uints[1], uints[2], uints[3], uints[4]);
        return makeOrder(order, merkleData[1]);
    }

    function cancelOrder_(
        address[9] addrs,
        uint[9] uints,
        SaleKindInterface.Side side,
        SaleKindInterface.SaleKind saleKind,
        bytes replacementPattern,
        bytes staticExtradata,
        bytes32 merkleRoot)
    public
    {
        bytes memory orderCallData = buildCallDataInternal(addrs[7],addrs[8],addrs[4],uints,merkleRoot);
        Order memory order = Order(addrs[0], addrs[1], addrs[2], addrs[3], address(0x00), side, saleKind, addrs[4], uints[6], orderCallData, replacementPattern, addrs[5], staticExtradata, IERC20(addrs[6]), uints[0], uints[1], uints[2], uints[3], uints[4]);
        return cancelOrder(
            order,
            nonces[order.maker]
        );
    }

    function calculateCurrentPrice_(
        address[9] addrs,
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
        bytes memory orderCallData = buildCallDataInternal(addrs[7],addrs[8],addrs[4],uints,merkleRoot);
        return calculateCurrentPrice(
            Order(addrs[0], addrs[1], addrs[2], addrs[3], address(0x00), side, saleKind, addrs[4], uints[6], orderCallData, replacementPattern, addrs[5], staticExtradata, IERC20(addrs[6]), uints[0], uints[1], uints[2], uints[3], uints[4])
        );
    }

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
        Order memory buy = Order(addrs[0], addrs[1], addrs[2], addrs[3], addrs[4], SaleKindInterface.Side(sidesKinds[0]), SaleKindInterface.SaleKind(sidesKinds[1]), addrs[5], uints[5], calldataBuy, replacementPatternBuy, addrs[6], staticExtradataBuy, IERC20(addrs[7]), uints[0], uints[1], uints[2], uints[3], uints[4]);
        Order memory sell = Order(addrs[8], addrs[9], addrs[10], addrs[11], addrs[12], SaleKindInterface.Side(sidesKinds[2]), SaleKindInterface.SaleKind(sidesKinds[3]), addrs[13], uints[11], calldataSell, replacementPatternSell, addrs[14], staticExtradataSell, IERC20(addrs[15]), uints[6], uints[7], uints[8], uints[9], uints[10]);
        return ordersCanMatch(
            buy,
            sell
        );
    }

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
        Order memory buy = Order(addrs[0], addrs[1], addrs[2], addrs[3], addrs[4], SaleKindInterface.Side(sidesKinds[0]), SaleKindInterface.SaleKind(sidesKinds[1]), addrs[5], uints[5], calldataBuy, replacementPatternBuy, addrs[6], staticExtradataBuy, IERC20(addrs[7]), uints[0], uints[1], uints[2], uints[3], uints[4]);
        Order memory sell = Order(addrs[8], addrs[9], addrs[10], addrs[11], addrs[12], SaleKindInterface.Side(sidesKinds[2]), SaleKindInterface.SaleKind(sidesKinds[3]), addrs[13], uints[11], calldataSell, replacementPatternSell, addrs[14], staticExtradataSell, IERC20(addrs[15]), uints[6], uints[7], uints[8], uints[9], uints[10]);
        return calculateMatchPrice(
            buy,
            sell
        );
    }

    function takeOrder_(
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

        return takeOrder(
            Order(addrs[0], addrs[1], addrs[2], addrs[3], addrs[4], SaleKindInterface.Side(sidesKinds[0]), SaleKindInterface.SaleKind(sidesKinds[1]), addrs[5], uints[5], calldataBuy, replacementPatternBuy, addrs[6], staticExtradataBuy, IERC20(addrs[7]), uints[0], uints[1], uints[2], uints[3], uints[4]),
            Order(addrs[8], addrs[9], addrs[10], addrs[11], addrs[12], SaleKindInterface.Side(sidesKinds[2]), SaleKindInterface.SaleKind(sidesKinds[3]), addrs[13], uints[11], calldataSell, replacementPatternSell, addrs[14], staticExtradataSell, IERC20(addrs[15]), uints[6], uints[7], uints[8], uints[9], uints[10]),
            rssMetadata
        );
    }

}