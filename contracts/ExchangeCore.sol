pragma solidity 0.4.26;

import "./ArrayUtils.sol";
import "./TokenTransferProxy.sol";
import "./IERC2981.sol";
import "./IRoyaltyRegisterHub.sol";
import "./ReentrancyGuarded.sol";
import "./Ownable.sol";
import "./Governable.sol";
import "./SaleKindInterface.sol";

contract ExchangeCore is ReentrancyGuarded, Ownable, Governable {
    string public constant name = "NiftyConnect Exchange Contract";
    string public constant version = "1.0";

    // NOTE: these hashes are derived and verified in the constructor.
    bytes32 private constant _EIP_712_DOMAIN_TYPEHASH = 0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f;
    bytes32 private constant _NAME_HASH = 0x97b3fae253daa304aa40063e4f71c3efec8d260848d7379fc623e35f84c73f47;
    bytes32 private constant _VERSION_HASH = 0xe6bbd6277e1bf288eed5e8d1780f9a50b239e86b153736bceebccf4ea79d90b3;
    bytes32 private constant _ORDER_TYPEHASH = 0xf446866267029076a71bb126e250b9480cd4ac2699baa745a582b10b361ec951;

    bytes4 private constant _INTERFACE_ID_ERC2981 = 0x2a55205a; // bytes4(keccak256("royaltyInfo(uint256,uint256)"));
    bytes4 private constant _EIP_165_SUPPORT_INTERFACE = 0x01ffc9a7; // bytes4(keccak256("supportsInterface(bytes4)"));

    //    // NOTE: chainId opcode is not supported in solidiy 0.4.x; here we hardcode as 56.
    // In order to protect against orders that are replayable across forked chains,
    // either the solidity version needs to be bumped up or it needs to be retrieved
    // from another contract.
    uint256 private constant _CHAIN_ID = 56;

    // Note: the domain separator is derived and verified in the constructor. */
    bytes32 public constant DOMAIN_SEPARATOR = 0xf3d2ac68c052856a4466531fc8d3592e2a6dfa240a8bb1e088b036e6a98baffe;

    uint256 public constant MAXIMUM_EXCHANGE_RATE = 500; //5%

    /* Token transfer proxy. */
    TokenTransferProxy public tokenTransferProxy;

    /* Cancelled / finalized orders, by hash. */
    mapping(bytes32 => bool) public cancelledOrFinalized;

    /* Orders verified by on-chain approval (alternative to ECDSA signatures so that smart contracts can place orders directly). */
    /* Note that the maker's nonce at the time of approval **plus one** is stored in the mapping. */
    mapping(bytes32 => uint256) private _approvedOrdersByNonce;

    /* Track per-maker nonces that can be incremented by the maker to cancel orders in bulk. */
    // The current nonce for the maker represents the only valid nonce that can be signed by the maker
    // If a signature was signed with a nonce that's different from the one stored in nonces, it
    // will fail validation.
    mapping(address => uint256) public nonces;

    /* Required protocol taker fee, in basis points. Paid to takerRelayerFeeRecipient, makerRelayerFeeRecipient and protocol owner */
    /* Initial rate 2% */
    uint public exchangeFeeRate = 200;

    /* Share of exchangeFee which will be paid to takerRelayerFeeRecipient, in basis points. */
    /* Initial share 15% */
    uint public takerRelayerFeeShare = 1500;

    /* Share of exchangeFee which will be paid to makerRelayerFeeRecipient, in basis points. */
    /* Initial share 80% */
    uint public makerRelayerFeeShare = 8000;

    /* Share of exchangeFee which will be paid to protocolFeeRecipient, in basis points. */
    /* Initial share 5% */
    uint public protocolFeeShare = 500;

    /* Recipient of protocol fees. */
    address public protocolFeeRecipient;

    /* Inverse basis point. */
    uint public constant INVERSE_BASIS_POINT = 10000;

    /*  */
    address public merkleValidatorContract;

    /*  */
    address public royaltyRegisterHub;

    /* An order on the exchange. */
    struct Order {
        /* Exchange address, intended as a versioning mechanism. */
        address exchange;
        /* Order maker address. */
        address maker;
        /* Order taker address, if specified. */
        address taker;
        /*  Order fee recipient or zero address for taker order. */
        address makerRelayerFeeRecipient;
        /*  Taker order fee recipient */
        address takerRelayerFeeRecipient;
        /* Side (buy/sell). */
        SaleKindInterface.Side side;
        /* Kind of sale. */
        SaleKindInterface.SaleKind saleKind;
        /* nftAddress. */
        address nftAddress;
        /* nft tokenId. */
        uint tokenId;
        /* Calldata. */
        bytes calldata;
        /* Calldata replacement pattern, or an empty byte array for no replacement. */
        bytes replacementPattern;
        /* Static call target, zero-address for no static call. */
        address staticTarget;
        /* Static call extra data. */
        bytes staticExtradata;
        /* Token used to pay for the order, or the zero-address as a sentinel value for Ether. */
        address paymentToken;
        /* Base price of the order (in paymentTokens). */
        uint basePrice;
        /* Auction extra parameter - minimum bid increment for English auctions, starting/ending price difference. */
        uint extra;
        /* Listing timestamp. */
        uint listingTime;
        /* Expiration timestamp - 0 for no expiry. */
        uint expirationTime;
        /* Order salt, used to prevent duplicate hashes. */
        uint salt;
        /* NOTE: uint nonce is an additional component of the order but is read from storage */
    }

    event OrderApprovedPartOne    (bytes32 indexed hash, address exchange, address indexed maker, address taker, address indexed makerRelayerFeeRecipient, SaleKindInterface.Side side, SaleKindInterface.SaleKind saleKind, address nftAddress, uint256 tokenId, bytes32 ipfsHash);
    event OrderApprovedPartTwo    (bytes32 indexed hash, bytes calldata, bytes replacementPattern, address staticTarget, bytes staticExtradata, address paymentToken, uint basePrice, uint extra, uint listingTime, uint expirationTime, uint salt);
    event OrderCancelled          (bytes32 indexed hash);
    event OrdersMatched           (bytes32 buyHash, bytes32 sellHash, address indexed maker, address indexed taker, uint price, bytes32 indexed metadata);
    event NonceIncremented        (address indexed maker, uint newNonce);

    constructor () public {
        require(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)") == _EIP_712_DOMAIN_TYPEHASH);
        require(keccak256(bytes(name)) == _NAME_HASH);
        require(keccak256(bytes(version)) == _VERSION_HASH);
        require(keccak256("Order(address exchange,address maker,address taker,address makerRelayerFeeRecipient,address takerRelayerFeeRecipient,uint8 side,uint8 saleKind,address nftAddress,uint tokenId,bytes32 merkleRoot,bytes calldata,bytes replacementPattern,address staticTarget,bytes staticExtradata,address paymentToken,uint256 basePrice,uint256 extra,uint256 listingTime,uint256 expirationTime,uint256 salt,uint256 nonce)") == _ORDER_TYPEHASH);
        require(DOMAIN_SEPARATOR == _deriveDomainSeparator());
    }

    /**
     * @dev Derive the domain separator for EIP-712 signatures.
     * @return The domain separator.
     */
    function _deriveDomainSeparator() private view returns (bytes32) {
        return keccak256(
            abi.encode(
            _EIP_712_DOMAIN_TYPEHASH, // keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
            _NAME_HASH, // keccak256("NiftyConnect Exchange Contract")
            _VERSION_HASH, // keccak256(bytes("1.0"))
            _CHAIN_ID,
            address(this)
        )); // NOTE: this is fixed, need to use solidity 0.5+ or make external call to support!
    }

    function checkRoyalties(address _contract) internal returns (bool) {
        bool success;
        bytes memory data = abi.encodeWithSelector(_EIP_165_SUPPORT_INTERFACE, _INTERFACE_ID_ERC2981);
        bytes memory result = new bytes(32);
        assembly {
            success := call(
                gas,            // gas remaining
                _contract,      // destination address
                0,              // no ether
                add(data, 32),  // input buffer (starts after the first 32 bytes in the `data` array)
                mload(data),    // input length (loaded from the first 32 bytes in the `data` array)
                result,         // output buffer
                32              // output length
            )
        }
        if (!success) {
            return false;
        }
        bool supportERC2981;
        assembly {
            supportERC2981 := mload(result)
        }
        return supportERC2981;
    }

    /**
     * Increment a particular maker's nonce, thereby invalidating all orders that were not signed
     * with the original nonce.
     */
    function incrementNonce() external {
        uint newNonce = ++nonces[msg.sender];
        emit NonceIncremented(msg.sender, newNonce);
    }

    /**
     * @dev Change the exchange fee rate
     * @param newExchangeFeeRate New fee to set in basis points
     */
    function changeExchangeFeeRate(uint newExchangeFeeRate)
    public
    onlyGovernor
    {
        require(newExchangeFeeRate<=MAXIMUM_EXCHANGE_RATE, "invalid exchange fee rate");
        exchangeFeeRate = newExchangeFeeRate;
    }

    /**
     * @dev Change the taker fee paid to the taker relayer (owner only)
     * @param newTakerRelayerFeeShare New fee to set in basis points
     * @param newMakerRelayerFeeShare New fee to set in basis points
     * @param newProtocolFeeShare New fee to set in basis points
     */
    function changeTakerRelayerFeeShare(uint newTakerRelayerFeeShare, uint newMakerRelayerFeeShare, uint newProtocolFeeShare)
    public
    onlyGovernor
    {
        require(SafeMath.add(SafeMath.add(newTakerRelayerFeeShare, newMakerRelayerFeeShare), newProtocolFeeShare) == INVERSE_BASIS_POINT, "invalid new fee share");
        takerRelayerFeeShare = newTakerRelayerFeeShare;
        makerRelayerFeeShare = newMakerRelayerFeeShare;
        protocolFeeShare = newProtocolFeeShare;
    }

    /**
     * @dev Change the protocol fee recipient (owner only)
     * @param newProtocolFeeRecipient New protocol fee recipient address
     */
    function changeProtocolFeeRecipient(address newProtocolFeeRecipient)
    public
    onlyOwner
    {
        protocolFeeRecipient = newProtocolFeeRecipient;
    }

    /**
     * @dev Transfer tokens
     * @param token Token to transfer
     * @param from Address to charge fees
     * @param to Address to receive fees
     * @param amount Amount of protocol tokens to charge
     */
    function transferTokens(address token, address from, address to, uint amount)
    internal
    {
        if (amount > 0) {
            require(tokenTransferProxy.transferFrom(token, from, to, amount));
        }
    }

    /**
     * @dev Execute a STATICCALL (introduced with Ethereum Metropolis, non-state-modifying external call)
     * @param target Contract to call
     * @param calldata Calldata (appended to extradata)
     * @param extradata Base data for STATICCALL (probably function selector and argument encoding)
     * @return The result of the call (success or failure)
     */
    function staticCall(address target, bytes memory calldata, bytes memory extradata)
    public
    view
    returns (bool result)
    {
        bytes memory combined = new bytes(calldata.length + extradata.length);
        uint index;
        assembly {
            index := add(combined, 0x20)
        }
        index = ArrayUtils.unsafeWriteBytes(index, extradata);
        ArrayUtils.unsafeWriteBytes(index, calldata);
        assembly {
            result := staticcall(gas, target, add(combined, 0x20), mload(combined), mload(0x40), 0)
        }
        return result;
    }

    /**
     * @dev Hash an order, returning the canonical EIP-712 order hash without the domain separator
     * @param order Order to hash
     * @param nonce maker nonce to hash
     * @return Hash of order
     */
    function hashOrder(Order memory order, uint nonce)
    internal
    pure
    returns (bytes32 hash)
    {
        /* Unfortunately abi.encodePacked doesn't work here, stack size constraints. */
        uint size = 672;
        bytes memory array = new bytes(size);
        uint index;
        assembly {
            index := add(array, 0x20)
        }
        index = ArrayUtils.unsafeWriteBytes32(index, _ORDER_TYPEHASH);
        index = ArrayUtils.unsafeWriteAddressWord(index, order.exchange);
        index = ArrayUtils.unsafeWriteAddressWord(index, order.maker);
        index = ArrayUtils.unsafeWriteAddressWord(index, order.taker);
        index = ArrayUtils.unsafeWriteAddressWord(index, order.makerRelayerFeeRecipient);
        index = ArrayUtils.unsafeWriteAddressWord(index, order.takerRelayerFeeRecipient);
        index = ArrayUtils.unsafeWriteUint8Word(index, uint8(order.side));
        index = ArrayUtils.unsafeWriteUint8Word(index, uint8(order.saleKind));
        index = ArrayUtils.unsafeWriteAddressWord(index, order.nftAddress);
        index = ArrayUtils.unsafeWriteUint(index, order.tokenId);
        index = ArrayUtils.unsafeWriteBytes32(index, keccak256(order.calldata));
        index = ArrayUtils.unsafeWriteBytes32(index, keccak256(order.replacementPattern));
        index = ArrayUtils.unsafeWriteAddressWord(index, order.staticTarget);
        index = ArrayUtils.unsafeWriteBytes32(index, keccak256(order.staticExtradata));
        index = ArrayUtils.unsafeWriteAddressWord(index, order.paymentToken);
        index = ArrayUtils.unsafeWriteUint(index, order.basePrice);
        index = ArrayUtils.unsafeWriteUint(index, order.extra);
        index = ArrayUtils.unsafeWriteUint(index, order.listingTime);
        index = ArrayUtils.unsafeWriteUint(index, order.expirationTime);
        index = ArrayUtils.unsafeWriteUint(index, order.salt);
        index = ArrayUtils.unsafeWriteUint(index, nonce);
        assembly {
            hash := keccak256(add(array, 0x20), size)
        }
        return hash;
    }

    /**
     * @dev Hash an order, returning the hash that a client must sign via EIP-712 including the message prefix
     * @param order Order to hash
     * @param nonce Nonce to hash
     * @return Hash of message prefix and order hash per Ethereum format
     */
    function hashToSign(Order memory order, uint nonce)
    internal
    pure
    returns (bytes32)
    {
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, hashOrder(order, nonce)));
    }

    /**
     * @dev Assert an order is valid and return its hash
     * @param order Order to validate
     * @param nonce Nonce to validate
     */
    function requireValidOrder(Order memory order, uint nonce)
    internal
    view
    returns (bytes32)
    {
        bytes32 hash = hashToSign(order, nonce);
        require(validateOrder(hash, order), "invalid order");
        return hash;
    }

    /**
     * @dev Validate order parameters
     * @param order Order to validate
     */
    function validateOrderParameters(Order memory order)
    internal
    view
    returns (bool)
    {
        /* Order must be targeted at this protocol version (this Exchange contract). */
        if (order.exchange != address(this)) {
            return false;
        }

        /* Order must have a maker. */
        if (order.maker == address(0)) {
            return false;
        }

        /* Order must possess valid sale kind parameter combination. */
        if (!SaleKindInterface.validateParameters(order.saleKind, order.expirationTime)) {
            return false;
        }

        return true;
    }

    /**
     * @dev Validate a provided previously approved / signed order, hash
     * @param hash Order hash (already calculated, passed to avoid recalculation)
     * @param order Order to validate
     */
    function validateOrder(bytes32 hash, Order memory order)
    internal
    view
    returns (bool)
    {
        /* Not done in an if-conditional to prevent unnecessary ecrecover evaluation, which seems to happen even though it should short-circuit. */

        /* Order must have valid parameters. */
        if (!validateOrderParameters(order)) {
            return false;
        }

        /* Order must have not been canceled or already filled. */
        if (cancelledOrFinalized[hash]) {
            return false;
        }

        /* Return true if order has been previously approved with the current nonce */
        uint approvedOrderNoncePlusOne = _approvedOrdersByNonce[hash];
        if (approvedOrderNoncePlusOne == 0) {
            return false;
        }
        return approvedOrderNoncePlusOne == nonces[order.maker] + 1;
    }

    /**
     * @dev Determine if an order has been approved. Note that the order may not still
     * be valid in cases where the maker's nonce has been incremented.
     * @param hash Hash of the order
     * @return whether or not the order was approved.
     */
    function approvedOrders(bytes32 hash) public view returns (bool approved) {
        return _approvedOrdersByNonce[hash] != 0;
    }

    /**
     * @dev Approve an order and optionally mark it for orderbook inclusion. Must be called by the maker of the order
     * @param order Order to approve
     * @param ipfsHash Order metadata on IPFS
     */
    function makeOrder(Order memory order, bytes32 ipfsHash)
    internal
    {
        /* CHECKS */

        /* Assert sender is authorized to approve order. */
        require(msg.sender == order.maker);

        /* Calculate order hash. */
        bytes32 hash = hashToSign(order, nonces[order.maker]);

        /* Assert order has not already been approved. */
        require(_approvedOrdersByNonce[hash] == 0, "duplicated order hash");

        /* EFFECTS */

        /* Mark order as approved. */
        _approvedOrdersByNonce[hash] = nonces[order.maker] + 1;

        /* Log approval event. Must be split in two due to Solidity stack size limitations. */
        {
            emit OrderApprovedPartOne(hash, order.exchange, order.maker, order.taker, order.makerRelayerFeeRecipient, order.side, order.saleKind, order.nftAddress, order.tokenId, ipfsHash);
        }
        {
            emit OrderApprovedPartTwo(hash, order.calldata, order.replacementPattern, order.staticTarget, order.staticExtradata, order.paymentToken, order.basePrice, order.extra, order.listingTime, order.expirationTime, order.salt);
        }
    }

    /**
     * @dev Cancel an order, preventing it from being matched. Must be called by the maker of the order
     * @param order Order to cancel
     * @param nonce Nonce to cancel
     */
    function cancelOrder(Order memory order, uint nonce)
    internal
    {
        /* CHECKS */

        /* Calculate order hash. */
        bytes32 hash = requireValidOrder(order, nonce);

        /* Assert sender is authorized to cancel order. */
        require(msg.sender == order.maker);

        /* EFFECTS */

        /* Mark order as cancelled, preventing it from being matched. */
        cancelledOrFinalized[hash] = true;

        /* Log cancel event. */
        emit OrderCancelled(hash);
    }

    /**
     * @dev Calculate the current price of an order (convenience function)
     * @param order Order to calculate the price of
     * @return The current price of the order
     */
    function calculateCurrentPrice (Order memory order)
    internal
    view
    returns (uint)
    {
        return SaleKindInterface.calculateFinalPrice(order.side, order.saleKind, order.basePrice, order.extra, order.listingTime, order.expirationTime);
    }

    /**
     * @dev Calculate the price two orders would match at, if in fact they would match (otherwise fail)
     * @param buy Buy-side order
     * @param sell Sell-side order
     * @return Match price
     */
    function calculateMatchPrice(Order memory buy, Order memory sell)
    view
    internal
    returns (uint)
    {
        /* Calculate sell price. */
        uint sellPrice = SaleKindInterface.calculateFinalPrice(sell.side, sell.saleKind, sell.basePrice, sell.extra, sell.listingTime, sell.expirationTime);

        /* Calculate buy price. */
        uint buyPrice = SaleKindInterface.calculateFinalPrice(buy.side, buy.saleKind, buy.basePrice, buy.extra, buy.listingTime, buy.expirationTime);

        /* Require price cross. */
        require(buyPrice >= sellPrice);

        /* Maker/taker priority. */
        return sell.makerRelayerFeeRecipient != address(0) ? sellPrice : buyPrice;
    }

    /**
     * @dev Execute all IERC20 token / Ether transfers associated with an order match (fees and buyer => seller transfer)
     * @param buy Buy-side order
     * @param sell Sell-side order
     */
    function executeFundsTransfer(Order memory buy, Order memory sell)
    internal
    returns (uint)
    {
        /* Only payable in the special case of unwrapped Ether. */
        if (sell.paymentToken != address(0)) {
            require(msg.value == 0);
        }

        /* Calculate match price. */
        uint price = calculateMatchPrice(buy, sell);

        /* If paying using a token (not Ether), transfer tokens. This is done prior to fee payments to that a seller will have tokens before being charged fees. */
        if (price > 0 && sell.paymentToken != address(0)) {
            transferTokens(sell.paymentToken, buy.maker, sell.maker, price);
        }

        /* Amount that will be received by seller (for Ether). */
        uint receiveAmount = price;

        /* Amount that must be sent by buyer (for Ether). */
        uint requiredAmount = price;

        uint exchangeFee = SafeMath.div(SafeMath.mul(exchangeFeeRate, price), INVERSE_BASIS_POINT);

        address royaltyReceiver = address(0x00);
        uint256 royaltyAmount;
        if (checkRoyalties(sell.nftAddress)) {
            (royaltyReceiver, royaltyAmount) = IERC2981(sell.nftAddress).royaltyInfo(buy.tokenId, price);
        } else {
            (royaltyReceiver, royaltyAmount) = IRoyaltyRegisterHub(royaltyRegisterHub).royaltyInfo(sell.nftAddress, price);
        }

        if (royaltyReceiver != address(0x00) && royaltyAmount != 0) {
            if (sell.paymentToken == address(0)) {
                receiveAmount = SafeMath.sub(receiveAmount, royaltyAmount);
                royaltyReceiver.transfer(royaltyAmount);
            } else {
                transferTokens(sell.paymentToken, sell.maker, royaltyReceiver, royaltyAmount);
            }
        }

        /* Determine maker/taker and charge fees accordingly. */
        if (sell.makerRelayerFeeRecipient != address(0)) {
            /* Sell-side order is maker. */

            /* Maker fees are deducted from the token amount that the maker receives. Taker fees are extra tokens that must be paid by the taker. */

            uint makerRelayerFee = SafeMath.div(SafeMath.mul(makerRelayerFeeShare, exchangeFee), INVERSE_BASIS_POINT);
            if (sell.paymentToken == address(0)) {
                receiveAmount = SafeMath.sub(receiveAmount, makerRelayerFee);
                sell.makerRelayerFeeRecipient.transfer(makerRelayerFee);
            } else {
                transferTokens(sell.paymentToken, sell.maker, sell.makerRelayerFeeRecipient, makerRelayerFee);
            }

            uint takerRelayerFee = SafeMath.div(SafeMath.mul(takerRelayerFeeShare, exchangeFee), INVERSE_BASIS_POINT);
            if (sell.paymentToken == address(0)) {
                receiveAmount = SafeMath.sub(receiveAmount, takerRelayerFee);
                buy.takerRelayerFeeRecipient.transfer(takerRelayerFee);
            } else {
                transferTokens(sell.paymentToken, sell.maker, buy.takerRelayerFeeRecipient, takerRelayerFee);
            }

            uint protocolFee = SafeMath.div(SafeMath.mul(protocolFeeShare, exchangeFee), INVERSE_BASIS_POINT);
            if (sell.paymentToken == address(0)) {
                receiveAmount = SafeMath.sub(receiveAmount, protocolFee);
                protocolFeeRecipient.transfer(protocolFee);
            } else {
                transferTokens(sell.paymentToken, sell.maker, protocolFeeRecipient, protocolFee);
            }
        } else {
            /* Buy-side order is maker. */

            /* The Exchange does not escrow Ether, so direct Ether can only be used to with sell-side maker / buy-side taker orders. */
            require(sell.paymentToken != address(0));

            makerRelayerFee = SafeMath.div(SafeMath.mul(makerRelayerFeeShare, exchangeFee), INVERSE_BASIS_POINT);
            transferTokens(sell.paymentToken, sell.maker, buy.makerRelayerFeeRecipient, makerRelayerFee);

            takerRelayerFee = SafeMath.div(SafeMath.mul(takerRelayerFeeShare, exchangeFee), INVERSE_BASIS_POINT);
            transferTokens(sell.paymentToken, sell.maker, sell.takerRelayerFeeRecipient, takerRelayerFee);

            protocolFee = SafeMath.div(SafeMath.mul(protocolFeeShare, exchangeFee), INVERSE_BASIS_POINT);
            transferTokens(sell.paymentToken, sell.maker, protocolFeeRecipient, protocolFee);
        }

        if (sell.paymentToken == address(0)) {
            /* Special-case Ether, order must be matched by buyer. */
            require(msg.value >= requiredAmount);
            sell.maker.transfer(receiveAmount);
            /* Allow overshoot for variable-price auctions, refund difference. */
            uint diff = SafeMath.sub(msg.value, requiredAmount);
            if (diff > 0) {
                buy.maker.transfer(diff);
            }
        }

        /* This contract should never hold Ether, however, we cannot assert this, since it is impossible to prevent anyone from sending Ether e.g. with selfdestruct. */

        return price;
    }

    /**
     * @dev Return whether or not two orders can be matched with each other by basic parameters (does not check order signatures / calldata or perform static calls)
     * @param buy Buy-side order
     * @param sell Sell-side order
     * @return Whether or not the two orders can be matched
     */
    function ordersCanMatch(Order memory buy, Order memory sell)
    internal
    view
    returns (bool)
    {
        return (
        /* Must be opposite-side. */
        (buy.side == SaleKindInterface.Side.Buy && sell.side == SaleKindInterface.Side.Sell) &&
        /* Must use same payment token. */
        (buy.paymentToken == sell.paymentToken) &&
        /* Must match maker/taker addresses. */
        (sell.taker == address(0) || sell.taker == buy.maker) &&
        (buy.taker == address(0) || buy.taker == sell.maker) &&
        /* One must be maker and the other must be taker (no bool XOR in Solidity). */
        ((sell.makerRelayerFeeRecipient == address(0) && buy.makerRelayerFeeRecipient != address(0)) || (sell.makerRelayerFeeRecipient != address(0) && buy.makerRelayerFeeRecipient == address(0))) &&
        /* Must match nftAddress. */
        (buy.nftAddress == sell.nftAddress) &&
        /* Buy-side order must be settleable. */
        SaleKindInterface.canSettleOrder(buy.listingTime, buy.expirationTime) &&
        /* Sell-side order must be settleable. */
        SaleKindInterface.canSettleOrder(sell.listingTime, sell.expirationTime)
        );
    }

    /**
     * @dev Atomically match two orders, ensuring validity of the match, and execute all associated state transitions. Protected against reentrancy by a contract-global lock.
     * @param buy Buy-side order
     * @param sell Sell-side order
     */
    function takeOrder(Order memory buy, Order memory sell, bytes32 metadata)
    internal
    reentrancyGuard
    {
        /* CHECKS */

        /* Ensure buy order validity and calculate hash if necessary. */
        bytes32 buyHash;
        if (buy.maker == msg.sender) {
            require(validateOrderParameters(buy), "invalid buy params");
        } else {
            buyHash = _requireValidOrderWithNonce(buy);
        }

        /* Ensure sell order validity and calculate hash if necessary. */
        bytes32 sellHash;
        if (sell.maker == msg.sender) {
            require(validateOrderParameters(sell), "invalid sell params");
        } else {
            sellHash = _requireValidOrderWithNonce(sell);
        }

        /* Must be matchable. */
        require(ordersCanMatch(buy, sell), "order can't match");

        /* Must match calldata after replacement, if specified. */
        if (buy.replacementPattern.length > 0) {
            ArrayUtils.guardedArrayReplace(buy.calldata, sell.calldata, buy.replacementPattern);
        }
        if (sell.replacementPattern.length > 0) {
            ArrayUtils.guardedArrayReplace(sell.calldata, buy.calldata, sell.replacementPattern);
        }
        require(ArrayUtils.arrayEq(buy.calldata, sell.calldata), "calldata doesn't equal");

        /* EFFECTS */

        /* Mark previously signed or approved orders as finalized. */
        if (msg.sender != buy.maker) {
            cancelledOrFinalized[buyHash] = true;
        }
        if (msg.sender != sell.maker) {
            cancelledOrFinalized[sellHash] = true;
        }

        /* INTERACTIONS */

        /* Execute funds transfer and pay fees. */
        uint price = executeFundsTransfer(buy, sell);

        require(merkleValidatorContract.delegatecall(sell.calldata), "order calldata failure");

        /* Static calls are intentionally done after the effectful call so they can check resulting state. */

        /* Handle buy-side static call if specified. */
        if (buy.staticTarget != address(0)) {
            require(staticCall(buy.staticTarget, sell.calldata, buy.staticExtradata));
        }

        /* Handle sell-side static call if specified. */
        if (sell.staticTarget != address(0)) {
            require(staticCall(sell.staticTarget, sell.calldata, sell.staticExtradata));
        }

        /* Log match event. */
        emit OrdersMatched(buyHash, sellHash, sell.makerRelayerFeeRecipient != address(0) ? sell.maker : buy.maker, sell.makerRelayerFeeRecipient != address(0) ? buy.maker : sell.maker, price, metadata);
    }

    function _requireValidOrderWithNonce(Order memory order) internal view returns (bytes32) {
        return requireValidOrder(order, nonces[order.maker]);
    }
}
