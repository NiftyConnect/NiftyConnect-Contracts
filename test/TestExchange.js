const Web3 = require('web3');
const crypto = require('crypto');
const keccak256 = require('keccak256');
const truffleAssert = require('truffle-assertions');
const { expectRevert, time } = require('@openzeppelin/test-helpers');
const sleep = require("await-sleep");
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));

const NiftyConnectExchange = artifacts.require("NiftyConnectExchange");
const NiftyConnectTokenTransferProxy = artifacts.require("NiftyConnectTokenTransferProxy");

const TestERC721 = artifacts.require("TestERC721");
const TestERC1155 = artifacts.require("TestERC1155");
const TestERC20 = artifacts.require("TestERC20");
const MerkleValidator = artifacts.require("MerkleValidator");
const RoyaltyRegisterHub = artifacts.require("RoyaltyRegisterHub");

const ERC721_AMOUNT = web3.utils.toBN(1);

const ERC721TransferSelector = web3.utils.toBN(0);
const ERC721SafeTransferSelector = web3.utils.toBN(1);
const ERC1155SafeTransferSelector = web3.utils.toBN(2);

function stringToBytes32(symbol) {
    let result = symbol;
    for (let i = 0; i < 64 - symbol.length; i++) {
        result = "0" + result;
    }
    return '0x'+result;
}

function calculateProofLength(totalLeaf) {
    let merkleProofLength = 0;
    let divResult = totalLeaf;
    let hasMod = false;
    for(;divResult!==0;) {
        let tempDivResult = Math.floor(divResult/2);
        if (tempDivResult*2<divResult) {
            hasMod = true;
        }
        divResult=tempDivResult;
        merkleProofLength++;
    }
    if (!hasMod) {
        merkleProofLength--;
    }
    return merkleProofLength;
}

function calculateProof(leafA, leafB) {
    if ( typeof leafB === 'undefined' ) {
        leafB = leafA
    }
    const leafABuffer = Buffer.from(web3.utils.hexToBytes(leafA));
    const leafBBuffer = Buffer.from(web3.utils.hexToBytes(leafB));
    let hash;
    if (leafA>leafB) {
        hash = "0x"+keccak256(Buffer.concat([leafBBuffer, leafABuffer])).toString('hex');
    } else {
        hash = "0x"+keccak256(Buffer.concat([leafABuffer, leafBBuffer])).toString('hex');
    }
    return hash;
}

function generateMerkleProofAndRoot(targetTokenId, tokenIds) {
    assert.isTrue(Array.isArray(tokenIds), "expect array");
    tokenIds.sort((a, b) => {
        return a - b
    });

    const merkleProofLength = calculateProofLength(tokenIds.length);

    let merkleProof = new Array(merkleProofLength);
    for(let idx=0; idx<merkleProofLength;idx++) {
        merkleProof[idx] = "0x0000000000000000000000000000000000000000000000000000000000000000"
    }

    let merkleProofInputs = new Array(tokenIds.length);
    for(let idx=0; idx<tokenIds.length;idx++) {
        merkleProofInputs[idx] = stringToBytes32(tokenIds[idx].toString(16))
    }
    let tempProofLength = Math.floor((tokenIds.length+1)/2)
    let tempProof = new Array(tempProofLength);
    let merkleRoot;
    let leaf = stringToBytes32(targetTokenId.toString(16));
    let proofIdx = 0;
    for(;tempProof.length>=1;) {
        for(let idx=0;idx<tempProof.length;idx++){
            let matched = false;
            if (leaf === merkleProofInputs[2*idx]) {
                merkleProof[proofIdx] = merkleProofInputs[2*idx+1];
                proofIdx++;
                matched = true;
            } else if (leaf === merkleProofInputs[2*idx+1]) {
                merkleProof[proofIdx] = merkleProofInputs[2*idx];
                proofIdx++;
                matched = true;
            }
            tempProof[idx] = calculateProof(merkleProofInputs[2*idx], merkleProofInputs[2*idx+1]);
            if (matched) {
                leaf = tempProof[idx];
            }
        }
        merkleProofInputs = tempProof;

        if (tempProof.length===1) {
            merkleRoot = tempProof[0];
            break;
        }

        tempProofLength = Math.floor((tempProofLength+1)/2)
        tempProof = new Array(tempProofLength);
    }
    return {merkleRoot, merkleProof};
}

function generateBuyReplacementPatternForNormalOrder(isERC1155) {
    let buyReplacementPattern = Buffer.from(web3.utils.hexToBytes(
        "0x" +
        "00000000" +                                                          // selector
        "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" +  // from
        "0000000000000000000000000000000000000000000000000000000000000000" +  // to
        "0000000000000000000000000000000000000000000000000000000000000000" +  // token
        "0000000000000000000000000000000000000000000000000000000000000000" +  // tokenId
        "0000000000000000000000000000000000000000000000000000000000000000" +  // merkleRoot
        "0000000000000000000000000000000000000000000000000000000000000000" +  // merkleProof Offset
        "0000000000000000000000000000000000000000000000000000000000000000"    // merkleProof Length
    ));

    if (isERC1155 === true) {
        buyReplacementPattern = Buffer.from(web3.utils.hexToBytes(
            "0x" +
            "00000000" +                                                          // selector
            "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" +  // from
            "0000000000000000000000000000000000000000000000000000000000000000" +  // to
            "0000000000000000000000000000000000000000000000000000000000000000" +  // token
            "0000000000000000000000000000000000000000000000000000000000000000" +  // tokenId
            "0000000000000000000000000000000000000000000000000000000000000000" +  // amount
            "0000000000000000000000000000000000000000000000000000000000000000" +  // merkleRoot
            "0000000000000000000000000000000000000000000000000000000000000000" +  // merkleProof Offset
            "0000000000000000000000000000000000000000000000000000000000000000"    // merkleProof Length
        ));
    }
    return buyReplacementPattern;
}

function generateSellReplacementPatternForNormalOrder(isERC1155) {
    let sellReplacementPattern = Buffer.from(web3.utils.hexToBytes(
        "0x" +
        "00000000" +                                                          // selector
        "0000000000000000000000000000000000000000000000000000000000000000" +  // from
        "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" +  // to
        "0000000000000000000000000000000000000000000000000000000000000000" +  // token
        "0000000000000000000000000000000000000000000000000000000000000000" +  // tokenId
        "0000000000000000000000000000000000000000000000000000000000000000" +  // merkleRoot
        "0000000000000000000000000000000000000000000000000000000000000000" +  // merkleProof Offset
        "0000000000000000000000000000000000000000000000000000000000000000"    // merkleProof Length
    ));

    if (isERC1155 === true) {
        sellReplacementPattern = Buffer.from(web3.utils.hexToBytes(
            "0x" +
            "00000000" +                                                          // selector
            "0000000000000000000000000000000000000000000000000000000000000000" +  // from
            "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" +  // to
            "0000000000000000000000000000000000000000000000000000000000000000" +  // token
            "0000000000000000000000000000000000000000000000000000000000000000" +  // tokenId
            "0000000000000000000000000000000000000000000000000000000000000000" +  // amount
            "0000000000000000000000000000000000000000000000000000000000000000" +  // merkleRoot
            "0000000000000000000000000000000000000000000000000000000000000000" +  // merkleProof Offset
            "0000000000000000000000000000000000000000000000000000000000000000"    // merkleProof Length
        ));
    }

    return sellReplacementPattern;
}

function generateBuyReplacementPatternForCollectionBasedOrder(isERC1155) {
    let buyReplacementPattern = Buffer.from(web3.utils.hexToBytes(
        "0x" +
        "00000000" +                                                          // selector
        "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" +  // from
        "0000000000000000000000000000000000000000000000000000000000000000" +  // to
        "0000000000000000000000000000000000000000000000000000000000000000" +  // token
        "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" +  // tokenId
        "0000000000000000000000000000000000000000000000000000000000000000" +  // merkleRoot
        "0000000000000000000000000000000000000000000000000000000000000000" +  // merkleProof Offset
        "0000000000000000000000000000000000000000000000000000000000000000"    // merkleProof Length
    ));

    if (isERC1155 === true) {
        buyReplacementPattern = Buffer.from(web3.utils.hexToBytes(
            "0x" +
            "00000000" +                                                          // selector
            "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" +  // from
            "0000000000000000000000000000000000000000000000000000000000000000" +  // to
            "0000000000000000000000000000000000000000000000000000000000000000" +  // token
            "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" +  // tokenId
            "0000000000000000000000000000000000000000000000000000000000000000" +  // amount
            "0000000000000000000000000000000000000000000000000000000000000000" +  // merkleRoot
            "0000000000000000000000000000000000000000000000000000000000000000" +  // merkleProof Offset
            "0000000000000000000000000000000000000000000000000000000000000000"    // merkleProof Length
        ));
    }
    return buyReplacementPattern;
}

function generateSellReplacementPatternForCollectionBasedOrder(isERC1155) {
    let sellReplacementPattern = Buffer.from(web3.utils.hexToBytes(
        "0x" +
        "00000000" +                                                          // selector
        "0000000000000000000000000000000000000000000000000000000000000000" +  // from
        "0000000000000000000000000000000000000000000000000000000000000000" +  // to
        "0000000000000000000000000000000000000000000000000000000000000000" +  // token
        "0000000000000000000000000000000000000000000000000000000000000000" +  // tokenId
        "0000000000000000000000000000000000000000000000000000000000000000" +  // merkleRoot
        "0000000000000000000000000000000000000000000000000000000000000000" +  // merkleProof Offset
        "0000000000000000000000000000000000000000000000000000000000000000"    // merkleProof Length
    ));

    if (isERC1155 === true) {
        sellReplacementPattern = Buffer.from(web3.utils.hexToBytes(
            "0x" +
            "00000000" +                                                          // selector
            "0000000000000000000000000000000000000000000000000000000000000000" +  // from
            "0000000000000000000000000000000000000000000000000000000000000000" +  // to
            "0000000000000000000000000000000000000000000000000000000000000000" +  // token
            "0000000000000000000000000000000000000000000000000000000000000000" +  // tokenId
            "0000000000000000000000000000000000000000000000000000000000000000" +  // amount
            "0000000000000000000000000000000000000000000000000000000000000000" +  // merkleRoot
            "0000000000000000000000000000000000000000000000000000000000000000" +  // merkleProof Offset
            "0000000000000000000000000000000000000000000000000000000000000000"    // merkleProof Length
        ));
    }
    return sellReplacementPattern;
}

function generateBuyReplacementPatternForTraitBasedOrder(totalLeaf, isERC1155) {
    let buyReplacementPattern = Buffer.from(web3.utils.hexToBytes(
        "0x" +
        "00000000" +                                                          // selector
        "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" +  // from
        "0000000000000000000000000000000000000000000000000000000000000000" +  // to
        "0000000000000000000000000000000000000000000000000000000000000000" +  // token
        "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" +  // tokenId
        "0000000000000000000000000000000000000000000000000000000000000000" +  // merkleRoot
        "0000000000000000000000000000000000000000000000000000000000000000" +  // merkleProof Offset
        "0000000000000000000000000000000000000000000000000000000000000000"    // merkleProof Length
    ));

    if (isERC1155 === true) {
        buyReplacementPattern = Buffer.from(web3.utils.hexToBytes(
            "0x" +
            "00000000" +                                                          // selector
            "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" +  // from
            "0000000000000000000000000000000000000000000000000000000000000000" +  // to
            "0000000000000000000000000000000000000000000000000000000000000000" +  // token
            "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" +  // tokenId
            "0000000000000000000000000000000000000000000000000000000000000000" +  // amount
            "0000000000000000000000000000000000000000000000000000000000000000" +  // merkleRoot
            "0000000000000000000000000000000000000000000000000000000000000000" +  // merkleProof Offset
            "0000000000000000000000000000000000000000000000000000000000000000"    // merkleProof Length
        ));
    }

    if (totalLeaf>=2) {
        const merkleProofLength = calculateProofLength(totalLeaf);
        for(let idx=0; idx<merkleProofLength;idx++) {
            buyReplacementPattern = Buffer.concat([
                buyReplacementPattern,
                Buffer.from(web3.utils.hexToBytes("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"))
            ]);
        }
    }
    return buyReplacementPattern;
}

function generateSellReplacementPatternForTraitBasedOrder(totalLeaf, isERC1155) {
    let sellReplacementPattern = Buffer.from(web3.utils.hexToBytes(
        "0x" +
        "00000000" +                                                          // selector
        "0000000000000000000000000000000000000000000000000000000000000000" +  // from
        "0000000000000000000000000000000000000000000000000000000000000000" +  // to
        "0000000000000000000000000000000000000000000000000000000000000000" +  // token
        "0000000000000000000000000000000000000000000000000000000000000000" +  // tokenId
        "0000000000000000000000000000000000000000000000000000000000000000" +  // merkleRoot
        "0000000000000000000000000000000000000000000000000000000000000000" +  // merkleProof Offset
        "0000000000000000000000000000000000000000000000000000000000000000"    // merkleProof Length
    ));

    if (isERC1155 === true) {
        sellReplacementPattern = Buffer.from(web3.utils.hexToBytes(
            "0x" +
            "00000000" +                                                          // selector
            "0000000000000000000000000000000000000000000000000000000000000000" +  // from
            "0000000000000000000000000000000000000000000000000000000000000000" +  // to
            "0000000000000000000000000000000000000000000000000000000000000000" +  // token
            "0000000000000000000000000000000000000000000000000000000000000000" +  // tokenId
            "0000000000000000000000000000000000000000000000000000000000000000" +  // amount
            "0000000000000000000000000000000000000000000000000000000000000000" +  // merkleRoot
            "0000000000000000000000000000000000000000000000000000000000000000" +  // merkleProof Offset
            "0000000000000000000000000000000000000000000000000000000000000000"    // merkleProof Length
        ));
    }

    if (totalLeaf>=2) {
        const merkleProofLength = calculateProofLength(totalLeaf);
        for (let idx = 0; idx < merkleProofLength; idx++) {
            sellReplacementPattern = Buffer.concat([
                sellReplacementPattern,
                Buffer.from(web3.utils.hexToBytes("0x0000000000000000000000000000000000000000000000000000000000000000"))
            ]);
        }
    }
    return sellReplacementPattern;
}

contract('NiftyConnect Exchange Contract v2', (accounts) => {
    it('Test Query Initial Status', async () => {
        const niftyConnectExchangeInst = await NiftyConnectExchange.deployed();
        const testERC721Inst = await TestERC721.deployed();
        const testERC1155Inst = await TestERC1155.deployed();

        const exchangeFeeRate = await niftyConnectExchangeInst.exchangeFeeRate();
        assert.equal(exchangeFeeRate.toString(), "200", "wrong exchangeFeeRate");

        const takerRelayerFeeShare = await niftyConnectExchangeInst.takerRelayerFeeShare();
        assert.equal(takerRelayerFeeShare.toString(), "1500", "wrong takerRelayerFeeShare");

        const makerRelayerFeeShare = await niftyConnectExchangeInst.makerRelayerFeeShare();
        assert.equal(makerRelayerFeeShare.toString(), "8000", "wrong makerRelayerFeeShare");

        const protocolFeeShare = await niftyConnectExchangeInst.protocolFeeShare();
        assert.equal(protocolFeeShare.toString(), "500", "wrong protocolFeeShare");

        const merkleValidatorContract = await niftyConnectExchangeInst.merkleValidatorContract();
        assert.equal(merkleValidatorContract.toString(), MerkleValidator.address, "wrong merkleValidatorContract");

        const royaltyRegisterHub = await niftyConnectExchangeInst.royaltyRegisterHub();
        assert.equal(royaltyRegisterHub.toString(), RoyaltyRegisterHub.address, "wrong royaltyRegisterHub");

        const nftERC721Name = await testERC721Inst.name();
        assert.equal(nftERC721Name.toString(), "CryptoKitty", "wrong nftName");

        const nftERC721Symbol = await testERC721Inst.symbol();
        assert.equal(nftERC721Symbol.toString(), "CryptoKitty", "wrong nftSymbol");

        const nftERC1155Name = await testERC1155Inst.name();
        assert.equal(nftERC1155Name.toString(), "ERC1155 Asset", "wrong nftName");

        const nftERC1155Symbol = await testERC1155Inst.symbol();
        assert.equal(nftERC1155Symbol.toString(), "Test1155", "wrong nftSymbol");
    });
    it('Test Account Init', async () => {
        const testERC721Inst = await TestERC721.deployed();
        const testERC1155Inst = await TestERC1155.deployed();
        const testERC20Inst = await TestERC20.deployed();

        const player0 = accounts[1];
        const player1 = accounts[2];

        await testERC721Inst.setApprovalForAll(NiftyConnectExchange.address, true, {from: player0});
        await testERC721Inst.setApprovalForAll(NiftyConnectExchange.address, true, {from: player1});

        await testERC1155Inst.setApprovalForAll(NiftyConnectExchange.address, true, {from: player0});
        await testERC1155Inst.setApprovalForAll(NiftyConnectExchange.address, true, {from: player1});

        await testERC20Inst.approve(NiftyConnectTokenTransferProxy.address, web3.utils.toBN(1e18).mul(web3.utils.toBN(1e18)), {from: player0});
        await testERC20Inst.approve(NiftyConnectTokenTransferProxy.address, web3.utils.toBN(1e18).mul(web3.utils.toBN(1e18)), {from: player1});
    });
    it('FixPrice List: Test ApproveOrder, AtomocSwap and CancelOrder on ERC721 with Native Coin', async () => {
        const player0 = accounts[1];
        const player1 = accounts[2];
        const player0RelayerFeeRecipient = accounts[3];
        const player1RelayerFeeRecipient = accounts[4];

        const niftyConnectExchangeInst = await NiftyConnectExchange.deployed();
        const testERC721Inst = await TestERC721.deployed();

        const tokenIdIdx = await testERC721Inst.tokenIdIdx();
        await testERC721Inst.mint(player0, {from: player0});
        const ownerAddr = await testERC721Inst.ownerOf(tokenIdIdx)

        const exchangePrice = web3.utils.toBN(1e18);

        assert.equal(ownerAddr.toString(), player0.toString(), "wrong owner");

        const sellCalldata = await niftyConnectExchangeInst.buildCallData(
            ERC721TransferSelector, // uint selector,
            player0, // address from,
            "0x0000000000000000000000000000000000000000", // address to,
            TestERC721.address,// address nftAddress,
            tokenIdIdx, // uint256 tokenId,
            ERC721_AMOUNT,// uint256 amount,
            "0x00", // bytes32 merkleRoot
            [],// bytes32[] memory merkleProof
        );

        const buyCalldata = await niftyConnectExchangeInst.buildCallData(
            ERC721TransferSelector, // uint selector,
            "0x0000000000000000000000000000000000000000", // address from,
            player1, // address to,
            TestERC721.address,// address nftAddress,
            tokenIdIdx, // uint256 tokenId,
            ERC721_AMOUNT,// uint256 amount,
            "0x00", // bytes32 merkleRoot
            [],// bytes32[] memory merkleProof
        );

        let sellReplacementPattern = generateSellReplacementPatternForNormalOrder(false)

        let latestBlock = await web3.eth.getBlock("latest");
        let timestamp = latestBlock.timestamp;
        let expireTime = web3.utils.toBN(timestamp).add(web3.utils.toBN(3600)); // expire at one hour later

        let salt = "0x"+crypto.randomBytes(32).toString("hex");

        const isOrderParameterValid = await niftyConnectExchangeInst.validateOrderParameters_(
            [
                NiftyConnectExchange.address,                          // exchange
                player0,                                            // maker
                "0x0000000000000000000000000000000000000000",       // taker
                player0RelayerFeeRecipient,                         // makerRelayerFeeRecipient
                "0x0000000000000000000000000000000000000000",       // takerRelayerFeeRecipient
                TestERC721.address,                                 // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                "0x0000000000000000000000000000000000000000",       // paymentToken
                player0,                                            // from
                "0x0000000000000000000000000000000000000000"        // to
            ],
            [
                exchangePrice,                // uint basePrice
                web3.utils.toBN(0),     // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt),        // uint salt
                ERC721TransferSelector,       // uint merkleValidatorSelector
                tokenIdIdx,                   // uint tokenId
                ERC721_AMOUNT,                // uint amount
                0,                            // uint totalLeaf
            ],
            1,                      // side
            0,                      // saleKind
            sellReplacementPattern, // replacementPattern
            [],                     // staticExtradata
            "0x00",                 // merkleRoot
        );
        assert.equal(isOrderParameterValid, true, "wrong order parameter check result");

        await niftyConnectExchangeInst.makeOrder_(
            [
                NiftyConnectExchange.address,                          // exchange
                player0,                                            // maker
                "0x0000000000000000000000000000000000000000",       // taker
                player0RelayerFeeRecipient,                         // makerRelayerFeeRecipient
                "0x0000000000000000000000000000000000000000",       // takerRelayerFeeRecipient
                TestERC721.address,                                 // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                "0x0000000000000000000000000000000000000000",       // paymentToken
                player0,                                            // from
                "0x0000000000000000000000000000000000000000"        // to
            ],
            [
                exchangePrice,  // uint basePrice
                web3.utils.toBN(0),     // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt),        // uint salt
                ERC721TransferSelector,   // uint merkleValidatorSelector
                tokenIdIdx,                   // uint tokenId
                ERC721_AMOUNT,                // uint amount
                0,                            // uint totalLeaf
            ],
            1,                      // side
            0,                      // saleKind
            sellReplacementPattern, // replacementPattern
            [],                     // staticExtradata
            [
                "0x0000000000000000000000000000000000000000000000000000000000000000",
                "0x0000000000000000000000000000000000000000000000000000000000000000"
            ],                      // merkleData
            {from: player0}
        );

        const orderHash = await niftyConnectExchangeInst.hashToSign_(
            [
                NiftyConnectExchange.address,                          // exchange
                player0,                                            // maker
                "0x0000000000000000000000000000000000000000",       // taker
                player0RelayerFeeRecipient,                         // makerRelayerFeeRecipient
                "0x0000000000000000000000000000000000000000",       // takerRelayerFeeRecipient
                TestERC721.address,                                 // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                "0x0000000000000000000000000000000000000000",       // paymentToken
                player0,                                            // from
                "0x0000000000000000000000000000000000000000"        // to
            ],
            [
                exchangePrice,                // uint basePrice
                web3.utils.toBN(0),     // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt),        // uint salt
                ERC721TransferSelector,       // uint merkleValidatorSelector
                tokenIdIdx,                   // uint tokenId
                ERC721_AMOUNT,                // uint amount
                0,                            // uint totalLeaf
            ],
            1,                      // side
            0,                      // saleKind
            sellReplacementPattern, // replacementPattern
            [],                     // staticExtradata
            "0x00",                 // merkleRoot
        );

        const orderApproved = await niftyConnectExchangeInst.approvedOrders(orderHash);
        assert.equal(orderApproved, true, "wrong order status");

        const isOrderValid = await niftyConnectExchangeInst.validateOrder_(
            [
                NiftyConnectExchange.address,                          // exchange
                player0,                                            // maker
                "0x0000000000000000000000000000000000000000",       // taker
                player0RelayerFeeRecipient,                         // makerRelayerFeeRecipient
                "0x0000000000000000000000000000000000000000",       // takerRelayerFeeRecipient
                TestERC721.address,                                 // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                "0x0000000000000000000000000000000000000000",       // paymentToken
                player0,                                            // from
                "0x0000000000000000000000000000000000000000"        // to
            ],
            [
                exchangePrice,                // uint basePrice
                web3.utils.toBN(0),     // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt),        // uint salt
                ERC721TransferSelector,   // uint merkleValidatorSelector
                tokenIdIdx,                   // uint tokenId
                ERC721_AMOUNT,                // uint amount
                0,                            // uint totalLeaf
            ],
            1,                      // side
            0,                      // saleKind
            sellReplacementPattern, // replacementPattern
            [],                     // staticExtradata
            "0x00",                 // merkleRoot
        );
        assert.equal(isOrderValid, true, "wrong order check result");

        const currentPrice = await niftyConnectExchangeInst.calculateCurrentPrice_(
            [
                NiftyConnectExchange.address,                          // exchange
                player0,                                            // maker
                "0x0000000000000000000000000000000000000000",       // taker
                player0RelayerFeeRecipient,                         // makerRelayerFeeRecipient
                "0x0000000000000000000000000000000000000000",       // takerRelayerFeeRecipient
                TestERC721.address,                                 // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                "0x0000000000000000000000000000000000000000",       // paymentToken
                player0,                                            // from
                "0x0000000000000000000000000000000000000000"        // to
            ],
            [
                exchangePrice,                // uint basePrice
                web3.utils.toBN(0),     // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt),        // uint salt
                ERC721TransferSelector,       // uint merkleValidatorSelector
                tokenIdIdx,                   // uint tokenId
                ERC721_AMOUNT,                // uint amount
                0,                            // uint totalLeaf
            ],
            1,                      // side
            0,                      // saleKind
            sellReplacementPattern, // replacementPattern
            [],                     // staticExtradata
            "0x00"                  // merkleRoot
        );
        assert.equal(currentPrice.toString(), exchangePrice.toString(), "wrong currentPrice");

        // ---------------------------------------------------------------------------------------------------------

        await sleep(2 * 1000);
        await time.advanceBlock();

        const buyReplacementPattern = generateBuyReplacementPatternForNormalOrder(false)

        const orderCalldataCanMatch = await niftyConnectExchangeInst.orderCalldataCanMatch(
            buyCalldata,
            buyReplacementPattern,
            sellCalldata,
            sellReplacementPattern);
        assert.equal(orderCalldataCanMatch, true, "wrong order calldata check result");

        const matchPrice = await niftyConnectExchangeInst.calculateMatchPrice_(
            [   // address[16] addrs,
                //buy
                NiftyConnectExchange.address,                          // exchange
                player1,                                            // maker
                player0,                                            // taker
                "0x0000000000000000000000000000000000000000",       // makerRelayerFeeRecipient
                player1RelayerFeeRecipient,                         // takerRelayerFeeRecipient
                TestERC721.address,                                 // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                "0x0000000000000000000000000000000000000000",       // paymentToken

                //sell
                NiftyConnectExchange.address,                          // exchange
                player0,                                            // maker
                "0x0000000000000000000000000000000000000000",       // taker
                player0RelayerFeeRecipient,                         // makerRelayerFeeRecipient
                "0x0000000000000000000000000000000000000000",       // takerRelayerFeeRecipient
                TestERC721.address,                                 // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                "0x0000000000000000000000000000000000000000"        // paymentToken
            ],
            [   // uint[12] uints,
                //buy
                exchangePrice,                // uint basePrice
                web3.utils.toBN(0),     // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt),        // uint salt
                tokenIdIdx,                   // uint tokenId
                //sell
                exchangePrice,                // uint basePrice
                web3.utils.toBN(0),     // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt),        // uint salt
                tokenIdIdx,                   // uint tokenId
            ],
            [   // uint8[4] sidesKindsHowToCalls,
                0, 0,
                1, 0
            ],
            buyCalldata, // bytes calldataBuy,
            sellCalldata, // bytes calldataSell,
            buyReplacementPattern, // bytes replacementPatternBuy,
            sellReplacementPattern, // bytes replacementPatternSell,
            [],// bytes staticExtradataBuy,
            [],// bytes staticExtradataSell,
        );

        assert.equal(matchPrice.toString(), exchangePrice.toString(), "exchange price mismatch");

        await niftyConnectExchangeInst.takeOrder_(
            [   // address[16] addrs,
                //buy
                NiftyConnectExchange.address,                       // exchange
                player1,                                            // maker
                player0,                                            // taker
                "0x0000000000000000000000000000000000000000",       // makerRelayerFeeRecipient
                player1RelayerFeeRecipient,                         // takerRelayerFeeRecipient
                TestERC721.address,                                 // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                "0x0000000000000000000000000000000000000000",       // paymentToken

                //sell
                NiftyConnectExchange.address,                       // exchange
                player0,                                            // maker
                "0x0000000000000000000000000000000000000000",       // taker
                player0RelayerFeeRecipient,                         // makerRelayerFeeRecipient
                "0x0000000000000000000000000000000000000000",       // takerRelayerFeeRecipient
                TestERC721.address,                                 // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                "0x0000000000000000000000000000000000000000"        // paymentToken
            ],
            [   // uint[12] uints,
                //buy
                exchangePrice,                // uint basePrice
                web3.utils.toBN(0),     // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt),        // uint salt
                tokenIdIdx,                   // uint tokenId
                //sell
                exchangePrice,                // uint basePrice
                web3.utils.toBN(0),     // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt),        // uint salt
                tokenIdIdx,                   // uint tokenId
            ],
            [   // uint8[4] sidesKindsHowToCalls,
                0, 0,
                1, 0
            ],
            buyCalldata, // bytes calldataBuy,
            sellCalldata, // bytes calldataSell,
            buyReplacementPattern, // bytes replacementPatternBuy,
            sellReplacementPattern, // bytes replacementPatternSell,
            [],// bytes staticExtradataBuy,
            [],// bytes staticExtradataSell,
            "0x00",// bytes32 rssMetadata
            {from: player1, value: web3.utils.toBN(1e18)}
        );

        // ---------------------------------------------------------------------------------------------------------

        latestBlock = await web3.eth.getBlock("latest");
        timestamp = latestBlock.timestamp;
        expireTime = web3.utils.toBN(timestamp).add(web3.utils.toBN(3600)); // expire at one hour later

        sellReplacementPattern = generateSellReplacementPatternForNormalOrder(false)

        salt = "0x"+crypto.randomBytes(32).toString("hex")
        await niftyConnectExchangeInst.makeOrder_(
            [
                NiftyConnectExchange.address,                          // exchange
                player1,                                            // maker
                "0x0000000000000000000000000000000000000000",       // taker
                player1RelayerFeeRecipient,                         // makerRelayerFeeRecipient
                "0x0000000000000000000000000000000000000000",       // takerRelayerFeeRecipient
                TestERC721.address,                                 // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                "0x0000000000000000000000000000000000000000",       // paymentToken
                player1,                                            // from
                "0x0000000000000000000000000000000000000000"        // to
            ],
            [
                exchangePrice,                // uint basePrice
                web3.utils.toBN(0),     // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt),        // uint salt
                ERC721TransferSelector,       // uint merkleValidatorSelector
                tokenIdIdx,                   // uint tokenId
                ERC721_AMOUNT,                // uint amount
                0,                            // uint totalLeaf
            ],
            1,                      // side
            0,                      // saleKind
            sellReplacementPattern, // replacementPattern
            [],                     // staticExtradata
            [
                "0x0000000000000000000000000000000000000000000000000000000000000000",
                "0x0000000000000000000000000000000000000000000000000000000000000000"
            ],                     // merkleData
            {from: player1}
        );

        await sleep(2 * 1000);
        await time.advanceBlock();

        await niftyConnectExchangeInst.cancelOrder_(
            [
                NiftyConnectExchange.address,                          // exchange
                player1,                                            // maker
                "0x0000000000000000000000000000000000000000",       // taker
                player1RelayerFeeRecipient,                         // makerRelayerFeeRecipient
                "0x0000000000000000000000000000000000000000",       // takerRelayerFeeRecipient
                TestERC721.address,                                 // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                "0x0000000000000000000000000000000000000000",       // paymentToken
                player1,                                            // from
                "0x0000000000000000000000000000000000000000"        // to
            ],
            [
                exchangePrice,                // uint basePrice
                web3.utils.toBN(0),     // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt),        // uint salt
                ERC721TransferSelector,       // uint merkleValidatorSelector
                tokenIdIdx,                   // uint tokenId
                ERC721_AMOUNT,                // uint amount
                0,                            // uint totalLeaf
            ],
            1,                      // side
            0,                      // saleKind
            sellReplacementPattern, // replacementPattern
            [],                     // staticExtradata
            "0x00",                 // merkleRoot
            {from: player1}
        );
    });
    it('FixPrice List: Test ApproveOrder, AtomocSwap and CancelOrder on ERC721 with ERC20 Token', async () => {
        const exchangeGovernor = accounts[0];
        const tempExchangeGovernor = accounts[10];

        const player0 = accounts[1];
        const player1 = accounts[2];
        const player0RelayerFeeRecipient = accounts[3];
        const player1RelayerFeeRecipient = accounts[4];

        const niftyConnectExchangeInst = await NiftyConnectExchange.deployed();
        const testERC721Inst = await TestERC721.deployed();
        const testERC20Inst = await TestERC20.deployed();

        const tokenIdIdx = await testERC721Inst.tokenIdIdx();
        await testERC721Inst.mint(player0, {from: player0});
        const ownerAddr = await testERC721Inst.ownerOf(tokenIdIdx)
        assert.equal(ownerAddr.toString(), player0.toString(), "wrong owner");

        await testERC20Inst.mint(player1, web3.utils.toBN(1e18).mul(web3.utils.toBN(10000)), {from: player1})

        const initPlayer1ERC20Balance = await testERC20Inst.balanceOf(player1);
        assert.equal(initPlayer1ERC20Balance.toString(), web3.utils.toBN(1e18).mul(web3.utils.toBN(10000)).toString(), "wrong player1 ERC20 balance");

        const sellCalldata = await niftyConnectExchangeInst.buildCallData(
            ERC721SafeTransferSelector, // uint selector,
            player0.toString(), // address from,
            "0x0000000000000000000000000000000000000000", // address to,
            TestERC721.address,// address nftAddress,
            tokenIdIdx, // uint256 tokenId,
            ERC721_AMOUNT,// uint256 amount,
            "0x00", // bytes32 merkleRoot
            [],// bytes32[] memory merkleProof
        );

        const buyCalldata = await niftyConnectExchangeInst.buildCallData(
            ERC721SafeTransferSelector, // uint selector,
            "0x0000000000000000000000000000000000000000", // address from,
            player1, // address to,
            TestERC721.address,// address nftAddress,
            tokenIdIdx, // uint256 tokenId,
            ERC721_AMOUNT,// uint256 amount,
            "0x00", // bytes32 merkleRoot
            [],// bytes32[] memory merkleProof
        );

        let sellReplacementPattern = generateSellReplacementPatternForNormalOrder(false)

        let latestBlock = await web3.eth.getBlock("latest");
        let timestamp = latestBlock.timestamp;
        let expireTime = web3.utils.toBN(timestamp).add(web3.utils.toBN(3600)); // expire at one hour later

        const exchangePrice = web3.utils.toBN(1e18)

        let salt = "0x"+crypto.randomBytes(32).toString("hex")
        await niftyConnectExchangeInst.makeOrder_(
            [
                NiftyConnectExchange.address,                          // exchange
                player0,                                            // maker
                "0x0000000000000000000000000000000000000000",       // taker
                player0RelayerFeeRecipient,                         // makerRelayerFeeRecipient
                "0x0000000000000000000000000000000000000000",       // takerRelayerFeeRecipient
                TestERC721.address,                                 // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                TestERC20.address,                                  // paymentToken
                player0,                                            // from
                "0x0000000000000000000000000000000000000000"        // to
            ],
            [
                exchangePrice,                        // uint basePrice
                web3.utils.toBN(0),     // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt),        // uint salt
                ERC721SafeTransferSelector,   // uint merkleValidatorSelector
                tokenIdIdx,                   // uint tokenId
                web3.utils.toBN(1),     // uint amount
                0,                            // uint totalLeaf
            ],
            1,                      // side
            0,                      // saleKind
            sellReplacementPattern, // replacementPattern
            [],                     // staticExtradata
            [
                "0x0000000000000000000000000000000000000000000000000000000000000000",
                "0x0000000000000000000000000000000000000000000000000000000000000000"
            ],                      // merkleData
            {from: player0}
        );

        // ---------------------------------------------------------------------------------------------------------

        await sleep(2 * 1000);
        await time.advanceBlock();

        const buyReplacementPattern = generateBuyReplacementPatternForNormalOrder(false)

        await niftyConnectExchangeInst.setPendingGovernor(tempExchangeGovernor, {from: exchangeGovernor});
        await niftyConnectExchangeInst.acceptGovernance({from: tempExchangeGovernor});

        await niftyConnectExchangeInst.changeExchangeFeeRate(web3.utils.toBN(150), {from: tempExchangeGovernor});

        try {
            await niftyConnectExchangeInst.changeTakerRelayerFeeShare(
                web3.utils.toBN(7500),
                web3.utils.toBN(1200),
                web3.utils.toBN(800),
                {from: tempExchangeGovernor});
            assert.fail();
        } catch (error) {
            assert.ok(error.toString().includes("invalid new fee share"));
        }
        await niftyConnectExchangeInst.changeTakerRelayerFeeShare(
            web3.utils.toBN(7500),
            web3.utils.toBN(1500),
            web3.utils.toBN(1000),
            {from: tempExchangeGovernor});

        await niftyConnectExchangeInst.setPendingGovernor(exchangeGovernor, {from: tempExchangeGovernor});
        await niftyConnectExchangeInst.acceptGovernance({from: exchangeGovernor});

        const INVERSE_BASIS_POINT = await niftyConnectExchangeInst.INVERSE_BASIS_POINT();

        const exchangeFeeRate = await niftyConnectExchangeInst.exchangeFeeRate();
        const takerRelayerFeeShare = await niftyConnectExchangeInst.takerRelayerFeeShare();
        const makerRelayerFeeShare = await niftyConnectExchangeInst.makerRelayerFeeShare();
        const protocolFeeShare = await niftyConnectExchangeInst.protocolFeeShare();

        const protocolFeeRecipient = await niftyConnectExchangeInst.protocolFeeRecipient();

        const royaltyRegisterHubInst = await RoyaltyRegisterHub.deployed();
        const royaltyInfo = await royaltyRegisterHubInst.royaltyInfo(TestERC721.address, exchangePrice);
        const royaltyReceiver = royaltyInfo["0"]
        const royaltyAmount  = royaltyInfo["1"]

        const initPlayer0ERC20Balance = await testERC20Inst.balanceOf(player0);
        const initPlayer0RelayerFeeRecipientERC20Balance = await testERC20Inst.balanceOf(player0RelayerFeeRecipient);
        const initPlayer1RelayerFeeRecipientERC20Balance = await testERC20Inst.balanceOf(player1RelayerFeeRecipient);
        const initProtocolFeeRecipientERC20Balance = await testERC20Inst.balanceOf(protocolFeeRecipient);
        const initRoyaltyReceiverERC20Balance = await testERC20Inst.balanceOf(royaltyReceiver);

        await niftyConnectExchangeInst.takeOrder_(
            [   // address[16] addrs,
                //buy
                NiftyConnectExchange.address,                          // exchange
                player1,                                            // maker
                player0,                                            // taker
                "0x0000000000000000000000000000000000000000",       // makerRelayerFeeRecipient
                player1RelayerFeeRecipient,                         // takerRelayerFeeRecipient
                TestERC721.address,                                 // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                TestERC20.address,                                  // paymentToken

                //sell
                NiftyConnectExchange.address,                          // exchange
                player0,                                            // maker
                "0x0000000000000000000000000000000000000000",       // taker
                player0RelayerFeeRecipient,                         // makerRelayerFeeRecipient
                "0x0000000000000000000000000000000000000000",       // takerRelayerFeeRecipient
                TestERC721.address,                                 // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                TestERC20.address                                   // paymentToken
            ],
            [   // uint[12] uints,
                //buy
                exchangePrice,                        // uint basePrice
                web3.utils.toBN(0),     // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt),        // uint salt
                tokenIdIdx,                   // uint tokenId
                //sell
                exchangePrice,                        // uint basePrice
                web3.utils.toBN(0),     // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt),        // uint salt
                tokenIdIdx,                   // uint tokenId
            ],
            [   // uint8[4] sidesKindsHowToCalls,
                0, 0,
                1, 0
            ],
            buyCalldata, // bytes calldataBuy,
            sellCalldata, // bytes calldataSell,
            buyReplacementPattern, // bytes replacementPatternBuy,
            sellReplacementPattern, // bytes replacementPatternSell,
            [],// bytes staticExtradataBuy,
            [],// bytes staticExtradataSell,
            "0x00",// bytes32 rssMetadata
            {from: player1}
        );

        const newPlayer0ERC20Balance = await testERC20Inst.balanceOf(player0);
        const newPlayer0RelayerFeeRecipientERC20Balance = await testERC20Inst.balanceOf(player0RelayerFeeRecipient);
        const newPlayer1RelayerFeeRecipientERC20Balance = await testERC20Inst.balanceOf(player1RelayerFeeRecipient);
        const newProtocolFeeRecipientERC20Balance = await testERC20Inst.balanceOf(protocolFeeRecipient);
        const newRoyaltyReceiverERC20Balance = await testERC20Inst.balanceOf(royaltyReceiver);

        const player0ERC20Balance = newPlayer0ERC20Balance.sub(initPlayer0ERC20Balance);
        const player0RelayerFeeRecipientERC20Balance = newPlayer0RelayerFeeRecipientERC20Balance.sub(initPlayer0RelayerFeeRecipientERC20Balance);
        const player1RelayerFeeRecipientERC20Balance = newPlayer1RelayerFeeRecipientERC20Balance.sub(initPlayer1RelayerFeeRecipientERC20Balance);
        const protocolFeeRecipientERC20Balance = newProtocolFeeRecipientERC20Balance.sub(initProtocolFeeRecipientERC20Balance);
        const royaltyReceiverERC20Balance = newRoyaltyReceiverERC20Balance.sub(initRoyaltyReceiverERC20Balance);

        assert.equal(player0ERC20Balance.toString(),
            exchangePrice.mul(web3.utils.toBN(INVERSE_BASIS_POINT).sub(web3.utils.toBN(exchangeFeeRate))).div(web3.utils.toBN(INVERSE_BASIS_POINT)).sub(royaltyAmount).toString(),
            "wrong player0 ERC20 balance");
        assert.equal(player0RelayerFeeRecipientERC20Balance.toString(),
            exchangePrice.mul(web3.utils.toBN(exchangeFeeRate)).mul(web3.utils.toBN(makerRelayerFeeShare)).div(web3.utils.toBN(INVERSE_BASIS_POINT).mul(web3.utils.toBN(INVERSE_BASIS_POINT))).toString(),
            "wrong player0RelayerFeeRecipient ERC20 balance");
        assert.equal(player1RelayerFeeRecipientERC20Balance.toString(),
            exchangePrice.mul(web3.utils.toBN(exchangeFeeRate)).mul(web3.utils.toBN(takerRelayerFeeShare)).div(web3.utils.toBN(INVERSE_BASIS_POINT).mul(web3.utils.toBN(INVERSE_BASIS_POINT))).toString(),
            "wrong player1RelayerFeeRecipient ERC20 balance");
        assert.equal(protocolFeeRecipientERC20Balance.toString(),
            exchangePrice.mul(web3.utils.toBN(exchangeFeeRate)).mul(web3.utils.toBN(protocolFeeShare)).div(web3.utils.toBN(INVERSE_BASIS_POINT).mul(web3.utils.toBN(INVERSE_BASIS_POINT))).toString(),
            "wrong protocolFeeRecipient ERC20 balance");
        assert.equal(royaltyReceiverERC20Balance.toString(), royaltyAmount.toString(), "wrong royaltyAmount");

        assert.equal(exchangePrice.toString(),
            player0ERC20Balance.
            add(player0RelayerFeeRecipientERC20Balance).
            add(player1RelayerFeeRecipientERC20Balance).
            add(protocolFeeRecipientERC20Balance).
            add(royaltyReceiverERC20Balance).
            toString(),
            "balance sum mismatch");
    });
    it('FixPrice List: Test ApproveOrder, AtomocSwap and CancelOrder on ERC1155 with Native Coin', async () => {
        const player0 = accounts[1];
        const player1 = accounts[2];
        const player0RelayerFeeRecipient = accounts[3];
        const player1RelayerFeeRecipient = accounts[4];

        const niftyConnectExchangeInst = await NiftyConnectExchange.deployed();
        const testERC1155Inst = await TestERC1155.deployed();

        const tokenId = web3.utils.toBN(1);
        const supply = web3.utils.toBN(1);
        await testERC1155Inst.mint(tokenId, supply, {from: player0});
        const balanceERC1155 = await testERC1155Inst.balanceOf(player0, tokenId)

        assert.equal(balanceERC1155.toString(), supply.toString(), "wrong supply");

        const sellCalldata = await niftyConnectExchangeInst.buildCallData(
            ERC1155SafeTransferSelector, // uint selector,
            player0.toString(), // address from,
            "0x0000000000000000000000000000000000000000", // address to,
            TestERC1155.address,// address nftAddress,
            tokenId, // uint256 tokenId,
            supply,// uint256 amount,
            "0x00", // bytes32 merkleRoot
            [],// bytes32[] memory merkleProof
        );

        const buyCalldata = await niftyConnectExchangeInst.buildCallData(
            ERC1155SafeTransferSelector, // uint selector,
            "0x0000000000000000000000000000000000000000", // address from,
            player1, // address to,
            TestERC1155.address,// address nftAddress,
            tokenId, // uint256 tokenId,
            supply,// uint256 amount,
            "0x00", // bytes32 merkleRoot
            [],// bytes32[] memory merkleProof
        );

        let sellReplacementPattern = generateSellReplacementPatternForNormalOrder(true)

        let latestBlock = await web3.eth.getBlock("latest");
        let timestamp = latestBlock.timestamp;
        let expireTime = web3.utils.toBN(timestamp).add(web3.utils.toBN(3600)); // expire at one hour later
        let exchangePrice = web3.utils.toBN(1e18);
        let salt = "0x"+crypto.randomBytes(32).toString("hex")
        await niftyConnectExchangeInst.makeOrder_(
            [
                NiftyConnectExchange.address,                          // exchange
                player0,                                            // maker
                "0x0000000000000000000000000000000000000000",       // taker
                player0RelayerFeeRecipient,                         // makerRelayerFeeRecipient
                "0x0000000000000000000000000000000000000000",       // takerRelayerFeeRecipient
                TestERC1155.address,                                // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                "0x0000000000000000000000000000000000000000",       // paymentToken
                player0,                                            // from
                "0x0000000000000000000000000000000000000000"        // to
            ],
            [
                exchangePrice,                // uint basePrice
                web3.utils.toBN(0),     // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt),        // uint salt
                ERC1155SafeTransferSelector,  // uint merkleValidatorSelector
                tokenId,                      // uint tokenId
                supply,                       // uint amount
                0,                            // uint totalLeaf
            ],
            1,                      // side
            0,                      // saleKind
            sellReplacementPattern, // replacementPattern
            [],                     // staticExtradata
            [
                "0x0000000000000000000000000000000000000000000000000000000000000000",
                "0x0000000000000000000000000000000000000000000000000000000000000000"
            ],                      // merkleData
            {from: player0}
        );

        // ---------------------------------------------------------------------------------------------------------

        await sleep(2 * 1000);
        await time.advanceBlock();

        const buyReplacementPattern = generateBuyReplacementPatternForNormalOrder(true)

        const ordersCanMatch_ = await niftyConnectExchangeInst.ordersCanMatch_(
            [   // address[16] addrs,
                //buy
                NiftyConnectExchange.address,                          // exchange
                player1,                                            // maker
                player0,                                            // taker
                "0x0000000000000000000000000000000000000000",       // makerRelayerFeeRecipient
                player1RelayerFeeRecipient,                         // takerRelayerFeeRecipient
                TestERC1155.address,                                // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                "0x0000000000000000000000000000000000000000",       // paymentToken

                //sell
                NiftyConnectExchange.address,                          // exchange
                player0,                                            // maker
                "0x0000000000000000000000000000000000000000",       // taker
                player0RelayerFeeRecipient,                         // makerRelayerFeeRecipient
                "0x0000000000000000000000000000000000000000",       // takerRelayerFeeRecipient
                TestERC1155.address,                                // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                "0x0000000000000000000000000000000000000000"        // paymentToken
            ],
            [   // uint[12] uints,
                //buy
                exchangePrice,                // uint basePrice
                web3.utils.toBN(0),     // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt),        // uint salt
                tokenId,                      // uint tokenId
                //sell
                exchangePrice,                // uint basePrice
                web3.utils.toBN(0),     // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt),        // uint salt
                tokenId,                      // uint tokenId
            ],
            [   // uint8[4] sidesKindsHowToCalls,
                0, 0,
                1, 0
            ],
            buyCalldata, // bytes calldataBuy,
            sellCalldata, // bytes calldataSell,
            buyReplacementPattern, // bytes replacementPatternBuy,
            sellReplacementPattern, // bytes replacementPatternSell,
            [],// bytes staticExtradataBuy,
            [],// bytes staticExtradataSell
        );

        assert.equal(ordersCanMatch_, true, "wrong ordersCanMatch_ result");

        await niftyConnectExchangeInst.takeOrder_(
            [   // address[16] addrs,
                //buy
                NiftyConnectExchange.address,                          // exchange
                player1,                                            // maker
                player0,                                            // taker
                "0x0000000000000000000000000000000000000000",       // makerRelayerFeeRecipient
                player1RelayerFeeRecipient,                         // takerRelayerFeeRecipient
                TestERC1155.address,                                // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                "0x0000000000000000000000000000000000000000",       // paymentToken

                //sell
                NiftyConnectExchange.address,                          // exchange
                player0,                                            // maker
                "0x0000000000000000000000000000000000000000",       // taker
                player0RelayerFeeRecipient,                         // makerRelayerFeeRecipient
                "0x0000000000000000000000000000000000000000",       // takerRelayerFeeRecipient
                TestERC1155.address,                                // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                "0x0000000000000000000000000000000000000000"        // paymentToken
            ],
            [   // uint[12] uints,
                //buy
                exchangePrice,                // uint basePrice
                web3.utils.toBN(0),     // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt),        // uint salt
                tokenId,                      // uint tokenId
                //sell
                exchangePrice,                // uint basePrice
                web3.utils.toBN(0),     // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt),        // uint salt
                tokenId,                      // uint tokenId
            ],
            [   // uint8[4] sidesKindsHowToCalls,
                0, 0,
                1, 0
            ],
            buyCalldata, // bytes calldataBuy,
            sellCalldata, // bytes calldataSell,
            buyReplacementPattern, // bytes replacementPatternBuy,
            sellReplacementPattern, // bytes replacementPatternSell,
            [],// bytes staticExtradataBuy,
            [],// bytes staticExtradataSell,
            "0x00",// bytes32 rssMetadata
            {from: player1, value: web3.utils.toBN(1e18)}
        );

        // ---------------------------------------------------------------------------------------------------------

        latestBlock = await web3.eth.getBlock("latest");
        timestamp = latestBlock.timestamp;
        expireTime = web3.utils.toBN(timestamp).add(web3.utils.toBN(3600)); // expire at one hour later

        sellReplacementPattern = generateSellReplacementPatternForNormalOrder(true)

        salt = "0x"+crypto.randomBytes(32).toString("hex")
        await niftyConnectExchangeInst.makeOrder_(
            [
                NiftyConnectExchange.address,                          // exchange
                player1,                                            // maker
                "0x0000000000000000000000000000000000000000",       // taker
                player1RelayerFeeRecipient,                         // makerRelayerFeeRecipient
                "0x0000000000000000000000000000000000000000",       // takerRelayerFeeRecipient
                TestERC1155.address,                                // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                "0x0000000000000000000000000000000000000000",       // paymentToken
                player1,                                            // from
                "0x0000000000000000000000000000000000000000"        // to
            ],
            [
                exchangePrice,                // uint basePrice
                web3.utils.toBN(0),     // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt),        // uint salt
                ERC1155SafeTransferSelector,  // uint merkleValidatorSelector
                tokenId,                      // uint tokenId
                supply,                       // uint amount
                0,                            // uint totalLeaf
            ],
            1,                      // side
            0,                      // saleKind
            sellReplacementPattern, // replacementPattern
            [],                     // staticExtradata
            [
                "0x0000000000000000000000000000000000000000000000000000000000000000",
                "0x0000000000000000000000000000000000000000000000000000000000000000"
            ],                      // merkleData
            {from: player1}
        );

        await sleep(2 * 1000);
        await time.advanceBlock();

        await niftyConnectExchangeInst.cancelOrder_(
            [
                NiftyConnectExchange.address,                          // exchange
                player1,                                            // maker
                "0x0000000000000000000000000000000000000000",       // taker
                player1RelayerFeeRecipient,                         // makerRelayerFeeRecipient
                "0x0000000000000000000000000000000000000000",       // takerRelayerFeeRecipient
                TestERC1155.address,                                // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                "0x0000000000000000000000000000000000000000",       // paymentToken
                player1,                                            // from
                "0x0000000000000000000000000000000000000000"        // to
            ],
            [
                exchangePrice,                // uint basePrice
                web3.utils.toBN(0),     // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt),        // uint salt
                ERC1155SafeTransferSelector,  // uint merkleValidatorSelector
                tokenId,                      // uint tokenId
                supply,                       // uint amount
                0,                            // uint totalLeaf
            ],
            1,                      // side
            0,                      // saleKind
            sellReplacementPattern, // replacementPattern
            [],                     // staticExtradata
            "0x00",                 // merkleRoot
            {from: player1}
        );
    });
    it('FixPrice List: Test ApproveOrder, AtomocSwap and CancelOrder on ERC1155 with ERC20 Token', async () => {
        const player0 = accounts[1];
        const player1 = accounts[2];
        const player0RelayerFeeRecipient = accounts[3];
        const player1RelayerFeeRecipient = accounts[4];

        const niftyConnectExchangeInst = await NiftyConnectExchange.deployed();
        const testERC1155Inst = await TestERC1155.deployed();
        const testERC20Inst = await TestERC20.deployed();

        const tokenId = web3.utils.toBN(2);
        const supply = web3.utils.toBN(1);
        await testERC1155Inst.mint(tokenId, supply, {from: player0});
        const balanceERC1155 = await testERC1155Inst.balanceOf(player0, tokenId)

        assert.equal(balanceERC1155.toString(), supply.toString(), "wrong supply");

        await testERC20Inst.mint(player1, web3.utils.toBN(1e18).mul(web3.utils.toBN(10000)), {from: player1})

        const sellCalldata = await niftyConnectExchangeInst.buildCallData(
            ERC1155SafeTransferSelector, // uint selector,
            player0.toString(), // address from,
            "0x0000000000000000000000000000000000000000", // address to,
            TestERC1155.address,// address nftAddress,
            tokenId, // uint256 tokenId,
            supply,// uint256 amount,
            "0x00", // bytes32 merkleRoot
            [],// bytes32[] memory merkleProof
        );

        const buyCalldata = await niftyConnectExchangeInst.buildCallData(
            ERC1155SafeTransferSelector, // uint selector,
            "0x0000000000000000000000000000000000000000", // address from,
            player1, // address to,
            TestERC1155.address,// address nftAddress,
            tokenId, // uint256 tokenId,
            supply,// uint256 amount,
            "0x00", // bytes32 merkleRoot
            [],// bytes32[] memory merkleProof
        );

        let sellReplacementPattern = generateSellReplacementPatternForNormalOrder(true)

        let latestBlock = await web3.eth.getBlock("latest");
        let timestamp = latestBlock.timestamp;
        let expireTime = web3.utils.toBN(timestamp).add(web3.utils.toBN(3600)); // expire at one hour later

        const exchangePrice = web3.utils.toBN(1e18)

        let salt = "0x"+crypto.randomBytes(32).toString("hex")
        await niftyConnectExchangeInst.makeOrder_(
            [
                NiftyConnectExchange.address,                          // exchange
                player0,                                            // maker
                "0x0000000000000000000000000000000000000000",       // taker
                player0RelayerFeeRecipient,                         // makerRelayerFeeRecipient
                "0x0000000000000000000000000000000000000000",       // takerRelayerFeeRecipient
                TestERC1155.address,                                // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                TestERC20.address,                                  // paymentToken
                player0,                                            // from
                "0x0000000000000000000000000000000000000000"        // to
            ],
            [
                exchangePrice,                // uint basePrice
                web3.utils.toBN(0),     // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt),        // uint salt
                ERC1155SafeTransferSelector,  // uint merkleValidatorSelector
                tokenId,                      // uint tokenId
                web3.utils.toBN(1),     // uint amount
                0,                            // uint totalLeaf
            ],
            1,                      // side
            0,                      // saleKind
            sellReplacementPattern, // replacementPattern
            [],                     // staticExtradata
            [
                "0x0000000000000000000000000000000000000000000000000000000000000000",
                "0x0000000000000000000000000000000000000000000000000000000000000000"
            ],                      // merkleData
            {from: player0}
        );

        // ---------------------------------------------------------------------------------------------------------

        await sleep(2 * 1000);
        await time.advanceBlock();

        const buyReplacementPattern = generateBuyReplacementPatternForNormalOrder(true)

        const INVERSE_BASIS_POINT = await niftyConnectExchangeInst.INVERSE_BASIS_POINT();

        const exchangeFeeRate = await niftyConnectExchangeInst.exchangeFeeRate();
        const takerRelayerFeeShare = await niftyConnectExchangeInst.takerRelayerFeeShare();
        const makerRelayerFeeShare = await niftyConnectExchangeInst.makerRelayerFeeShare();
        const protocolFeeShare = await niftyConnectExchangeInst.protocolFeeShare();

        const protocolFeeRecipient = await niftyConnectExchangeInst.protocolFeeRecipient();

        const royaltyRegisterHubInst = await RoyaltyRegisterHub.deployed();
        const royaltyInfo = await royaltyRegisterHubInst.royaltyInfo(TestERC721.address, exchangePrice);
        const royaltyReceiver = royaltyInfo["0"]
        const royaltyAmount  = royaltyInfo["1"]

        const initPlayer0ERC20Balance = await testERC20Inst.balanceOf(player0);
        const initPlayer0RelayerFeeRecipientERC20Balance = await testERC20Inst.balanceOf(player0RelayerFeeRecipient);
        const initPlayer1RelayerFeeRecipientERC20Balance = await testERC20Inst.balanceOf(player1RelayerFeeRecipient);
        const initProtocolFeeRecipientERC20Balance = await testERC20Inst.balanceOf(protocolFeeRecipient);
        const initRoyaltyReceiverERC20Balance = await testERC20Inst.balanceOf(royaltyReceiver);

        await niftyConnectExchangeInst.takeOrder_(
            [   // address[16] addrs,
                //buy
                NiftyConnectExchange.address,                          // exchange
                player1,                                            // maker
                player0,                                            // taker
                "0x0000000000000000000000000000000000000000",       // makerRelayerFeeRecipient
                player1RelayerFeeRecipient,                         // takerRelayerFeeRecipient
                TestERC1155.address,                                // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                TestERC20.address,                                  // paymentToken

                //sell
                NiftyConnectExchange.address,                          // exchange
                player0,                                            // maker
                "0x0000000000000000000000000000000000000000",       // taker
                player0RelayerFeeRecipient,                         // makerRelayerFeeRecipient
                "0x0000000000000000000000000000000000000000",       // takerRelayerFeeRecipient
                TestERC1155.address,                                // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                TestERC20.address                                   // paymentToken
            ],
            [   // uint[12] uints,
                //buy
                exchangePrice,                // uint basePrice
                web3.utils.toBN(0),     // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt),        // uint salt
                tokenId,                      // uint tokenId
                //sell
                exchangePrice,                // uint basePrice
                web3.utils.toBN(0),     // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt),        // uint salt
                tokenId,                      // uint tokenId
            ],
            [   // uint8[4] sidesKindsHowToCalls,
                0, 0,
                1, 0
            ],
            buyCalldata, // bytes calldataBuy,
            sellCalldata, // bytes calldataSell,
            buyReplacementPattern, // bytes replacementPatternBuy,
            sellReplacementPattern, // bytes replacementPatternSell,
            [],// bytes staticExtradataBuy,
            [],// bytes staticExtradataSell,
            "0x00",// bytes32 rssMetadata
            {from: player1}
        );

        const newPlayer0ERC20Balance = await testERC20Inst.balanceOf(player0);
        const newPlayer0RelayerFeeRecipientERC20Balance = await testERC20Inst.balanceOf(player0RelayerFeeRecipient);
        const newPlayer1RelayerFeeRecipientERC20Balance = await testERC20Inst.balanceOf(player1RelayerFeeRecipient);
        const newProtocolFeeRecipientERC20Balance = await testERC20Inst.balanceOf(protocolFeeRecipient);
        const newRoyaltyReceiverERC20Balance = await testERC20Inst.balanceOf(royaltyReceiver);

        const player0ERC20Balance = newPlayer0ERC20Balance.sub(initPlayer0ERC20Balance);
        const player0RelayerFeeRecipientERC20Balance = newPlayer0RelayerFeeRecipientERC20Balance.sub(initPlayer0RelayerFeeRecipientERC20Balance);
        const player1RelayerFeeRecipientERC20Balance = newPlayer1RelayerFeeRecipientERC20Balance.sub(initPlayer1RelayerFeeRecipientERC20Balance);
        const protocolFeeRecipientERC20Balance = newProtocolFeeRecipientERC20Balance.sub(initProtocolFeeRecipientERC20Balance);
        const royaltyReceiverERC20Balance = newRoyaltyReceiverERC20Balance.sub(initRoyaltyReceiverERC20Balance);

        assert.equal(player0ERC20Balance.toString(),
            exchangePrice.mul(web3.utils.toBN(INVERSE_BASIS_POINT).sub(web3.utils.toBN(exchangeFeeRate))).div(web3.utils.toBN(INVERSE_BASIS_POINT)).sub(royaltyAmount).toString(),
            "wrong player0 ERC20 balance");
        assert.equal(player0RelayerFeeRecipientERC20Balance.toString(),
            exchangePrice.mul(web3.utils.toBN(exchangeFeeRate)).mul(web3.utils.toBN(makerRelayerFeeShare)).div(web3.utils.toBN(INVERSE_BASIS_POINT).mul(web3.utils.toBN(INVERSE_BASIS_POINT))).toString(),
            "wrong player0RelayerFeeRecipient ERC20 balance");
        assert.equal(player1RelayerFeeRecipientERC20Balance.toString(),
            exchangePrice.mul(web3.utils.toBN(exchangeFeeRate)).mul(web3.utils.toBN(takerRelayerFeeShare)).div(web3.utils.toBN(INVERSE_BASIS_POINT).mul(web3.utils.toBN(INVERSE_BASIS_POINT))).toString(),
            "wrong player1RelayerFeeRecipient ERC20 balance");
        assert.equal(protocolFeeRecipientERC20Balance.toString(),
            exchangePrice.mul(web3.utils.toBN(exchangeFeeRate)).mul(web3.utils.toBN(protocolFeeShare)).div(web3.utils.toBN(INVERSE_BASIS_POINT).mul(web3.utils.toBN(INVERSE_BASIS_POINT))).toString(),
            "wrong protocolFeeRecipient ERC20 balance");
        assert.equal(royaltyReceiverERC20Balance.toString(), royaltyAmount.toString(), "wrong royaltyAmount");

        assert.equal(exchangePrice.toString(),
            player0ERC20Balance.
            add(player0RelayerFeeRecipientERC20Balance).
            add(player1RelayerFeeRecipientERC20Balance).
            add(protocolFeeRecipientERC20Balance).
            add(royaltyReceiverERC20Balance).
            toString(),
            "balance sum mismatch");
    });
    it('MakerOffer for ERC721', async () => {
        const player0 = accounts[1];
        const player1 = accounts[2];
        const player0RelayerFeeRecipient = accounts[3];
        const player1RelayerFeeRecipient = accounts[4];

        const niftyConnectExchangeInst = await NiftyConnectExchange.deployed();
        const testERC721Inst = await TestERC721.deployed();
        const testERC20Inst = await TestERC20.deployed();

        const tokenIdIdx = await testERC721Inst.tokenIdIdx();
        await testERC721Inst.mint(player0, {from: player0});

        const buyCalldata = await niftyConnectExchangeInst.buildCallData(
            ERC721TransferSelector, // uint selector,
            "0x0000000000000000000000000000000000000000", // address from,
            player1, // address to,
            TestERC721.address,// address nftAddress,
            tokenIdIdx, // uint256 tokenId,
            ERC721_AMOUNT,// uint256 amount,
            "0x00", // bytes32 merkleRoot
            [],// bytes32[] memory merkleProof
        );

        let buyReplacementPattern = generateBuyReplacementPatternForNormalOrder(false)

        let latestBlock = await web3.eth.getBlock("latest");
        let timestamp = latestBlock.timestamp;
        let expireTime = web3.utils.toBN(timestamp).add(web3.utils.toBN(3600)); // expire at one hour later
        let exchangePrice = web3.utils.toBN(1e18);
        let salt = "0x"+crypto.randomBytes(32).toString("hex")
        await niftyConnectExchangeInst.makeOrder_(
            [
                NiftyConnectExchange.address,                          // exchange
                player1,                                            // maker
                "0x0000000000000000000000000000000000000000",       // taker
                player1RelayerFeeRecipient,                         // makerRelayerFeeRecipient
                "0x0000000000000000000000000000000000000000",       // takerRelayerFeeRecipient
                TestERC721.address,                                 // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                TestERC20.address,                                  // paymentToken
                "0x0000000000000000000000000000000000000000",       // from
                player1                                             // to
            ],
            [
                exchangePrice,                // uint basePrice
                web3.utils.toBN(0),     // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt),        // uint salt
                ERC721TransferSelector,       // uint merkleValidatorSelector
                tokenIdIdx,                   // uint tokenId
                ERC721_AMOUNT,                // uint amount
                0,                            // uint totalLeaf
            ],
            0,                      // side
            0,                      // saleKind
            buyReplacementPattern,  // replacementPattern
            [],                     // staticExtradata
            [
                "0x0000000000000000000000000000000000000000000000000000000000000000",
                "0x0000000000000000000000000000000000000000000000000000000000000000"
            ],                      // merkleData
            {from: player1}
        );

        // ---------------------------------------------------------------------------------------------------------

        await sleep(2 * 1000);
        await time.advanceBlock();

        const sellCalldata = await niftyConnectExchangeInst.buildCallData(
            ERC721TransferSelector, // uint selector,
            player0, // address from,
            player1, // address to,
            TestERC721.address,// address nftAddress,
            tokenIdIdx, // uint256 tokenId,
            ERC721_AMOUNT,// uint256 amount,
            "0x00", // bytes32 merkleRoot
            [],// bytes32[] memory merkleProof
        );

        const sellReplacementPattern = generateSellReplacementPatternForNormalOrder(false)

        const INVERSE_BASIS_POINT = await niftyConnectExchangeInst.INVERSE_BASIS_POINT();
        const exchangeFeeRate = await niftyConnectExchangeInst.exchangeFeeRate();
        const takerRelayerFeeShare = await niftyConnectExchangeInst.takerRelayerFeeShare();
        const makerRelayerFeeShare = await niftyConnectExchangeInst.makerRelayerFeeShare();
        const protocolFeeShare = await niftyConnectExchangeInst.protocolFeeShare();
        const protocolFeeRecipient = await niftyConnectExchangeInst.protocolFeeRecipient();

        const royaltyRegisterHubInst = await RoyaltyRegisterHub.deployed();
        const royaltyInfo = await royaltyRegisterHubInst.royaltyInfo(TestERC721.address, exchangePrice);
        const royaltyReceiver = royaltyInfo["0"]
        const royaltyAmount  = royaltyInfo["1"]

        const initPlayer0ERC20Balance = await testERC20Inst.balanceOf(player0);
        const initPlayer0RelayerFeeRecipientERC20Balance = await testERC20Inst.balanceOf(player0RelayerFeeRecipient);
        const initPlayer1RelayerFeeRecipientERC20Balance = await testERC20Inst.balanceOf(player1RelayerFeeRecipient);
        const initProtocolFeeRecipientERC20Balance = await testERC20Inst.balanceOf(protocolFeeRecipient);
        const initRoyaltyReceiverERC20Balance = await testERC20Inst.balanceOf(royaltyReceiver);

        await niftyConnectExchangeInst.takeOrder_(
            [   // address[16] addrs,
                //buy
                NiftyConnectExchange.address,                          // exchange
                player1,                                            // maker
                "0x0000000000000000000000000000000000000000",       // taker
                player1RelayerFeeRecipient,                         // makerRelayerFeeRecipient
                "0x0000000000000000000000000000000000000000",       // takerRelayerFeeRecipient
                TestERC721.address,                                 // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                TestERC20.address,                                  // paymentToken

                //sell
                NiftyConnectExchange.address,                          // exchange
                player0,                                            // maker
                player1,                                            // taker
                "0x0000000000000000000000000000000000000000",       // makerRelayerFeeRecipient
                player0RelayerFeeRecipient,                         // takerRelayerFeeRecipient
                TestERC721.address,                                 // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                TestERC20.address,                                  // paymentToken
            ],
            [   // uint[12] uints,
                //buy
                exchangePrice,                // uint basePrice
                web3.utils.toBN(0),     // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt),        // uint salt
                tokenIdIdx,                   // uint tokenId
                //sell
                exchangePrice,                // uint basePrice
                web3.utils.toBN(0),     // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt),        // uint salt
                tokenIdIdx,                   // uint tokenId
            ],
            [   // uint8[4] sidesKindsHowToCalls,
                0, 0,
                1, 0
            ],
            buyCalldata, // bytes calldataBuy,
            sellCalldata, // bytes calldataSell,
            buyReplacementPattern, // bytes replacementPatternBuy,
            sellReplacementPattern, // bytes replacementPatternSell,
            [],// bytes staticExtradataBuy,
            [],// bytes staticExtradataSell,
            "0x00",// bytes32 rssMetadata
            {from: player0}
        );

        const newPlayer0ERC20Balance = await testERC20Inst.balanceOf(player0);
        const newPlayer0RelayerFeeRecipientERC20Balance = await testERC20Inst.balanceOf(player0RelayerFeeRecipient);
        const newPlayer1RelayerFeeRecipientERC20Balance = await testERC20Inst.balanceOf(player1RelayerFeeRecipient);
        const newProtocolFeeRecipientERC20Balance = await testERC20Inst.balanceOf(protocolFeeRecipient);
        const newRoyaltyReceiverERC20Balance = await testERC20Inst.balanceOf(royaltyReceiver);

        const player0ERC20Balance = newPlayer0ERC20Balance.sub(initPlayer0ERC20Balance);
        const player0RelayerFeeRecipientERC20Balance = newPlayer0RelayerFeeRecipientERC20Balance.sub(initPlayer0RelayerFeeRecipientERC20Balance);
        const player1RelayerFeeRecipientERC20Balance = newPlayer1RelayerFeeRecipientERC20Balance.sub(initPlayer1RelayerFeeRecipientERC20Balance);
        const protocolFeeRecipientERC20Balance = newProtocolFeeRecipientERC20Balance.sub(initProtocolFeeRecipientERC20Balance);
        const royaltyReceiverERC20Balance = newRoyaltyReceiverERC20Balance.sub(initRoyaltyReceiverERC20Balance);

        assert.equal(player0ERC20Balance.toString(),
            exchangePrice.mul(web3.utils.toBN(INVERSE_BASIS_POINT).sub(web3.utils.toBN(exchangeFeeRate))).div(web3.utils.toBN(INVERSE_BASIS_POINT)).sub(royaltyAmount).toString(),
            "wrong player0 ERC20 balance");
        assert.equal(player0RelayerFeeRecipientERC20Balance.toString(),
            exchangePrice.mul(web3.utils.toBN(exchangeFeeRate)).mul(web3.utils.toBN(takerRelayerFeeShare)).div(web3.utils.toBN(INVERSE_BASIS_POINT).mul(web3.utils.toBN(INVERSE_BASIS_POINT))).toString(),
            "wrong player0RelayerFeeRecipient ERC20 balance");
        assert.equal(player1RelayerFeeRecipientERC20Balance.toString(),
            exchangePrice.mul(web3.utils.toBN(exchangeFeeRate)).mul(web3.utils.toBN(makerRelayerFeeShare)).div(web3.utils.toBN(INVERSE_BASIS_POINT).mul(web3.utils.toBN(INVERSE_BASIS_POINT))).toString(),
            "wrong player1RelayerFeeRecipient ERC20 balance");
        assert.equal(protocolFeeRecipientERC20Balance.toString(),
            exchangePrice.mul(web3.utils.toBN(exchangeFeeRate)).mul(web3.utils.toBN(protocolFeeShare)).div(web3.utils.toBN(INVERSE_BASIS_POINT).mul(web3.utils.toBN(INVERSE_BASIS_POINT))).toString(),
            "wrong protocolFeeRecipient ERC20 balance");
        assert.equal(royaltyReceiverERC20Balance.toString(), royaltyAmount.toString(), "wrong royaltyAmount");

        assert.equal(exchangePrice.toString(),
            player0ERC20Balance.
            add(player0RelayerFeeRecipientERC20Balance).
            add(player1RelayerFeeRecipientERC20Balance).
            add(protocolFeeRecipientERC20Balance).
            add(royaltyReceiverERC20Balance).
            toString(),
            "balance sum mismatch");
    });
    it('MakerOffer for ERC1155', async () => {
        const player0 = accounts[1];
        const player1 = accounts[2];
        const player0RelayerFeeRecipient = accounts[3];
        const player1RelayerFeeRecipient = accounts[4];

        const niftyConnectExchangeInst = await NiftyConnectExchange.deployed();
        const testERC1155Inst = await TestERC1155.deployed();
        const testERC20Inst = await TestERC20.deployed();

        const tokenId = web3.utils.toBN(3);
        const supply = web3.utils.toBN(1);
        await testERC1155Inst.mint(tokenId, supply, {from: player0});

        const buyCalldata = await niftyConnectExchangeInst.buildCallData(
            ERC1155SafeTransferSelector, // uint selector,
            "0x0000000000000000000000000000000000000000", // address from,
            player1, // address to,
            TestERC1155.address,// address nftAddress,
            tokenId, // uint256 tokenId,
            supply,// uint256 amount,
            "0x00", // bytes32 merkleRoot
            [],// bytes32[] memory merkleProof
        );

        let buyReplacementPattern = generateBuyReplacementPatternForNormalOrder(true)

        let latestBlock = await web3.eth.getBlock("latest");
        let timestamp = latestBlock.timestamp;
        let expireTime = web3.utils.toBN(timestamp).add(web3.utils.toBN(3600)); // expire at one hour later
        let exchangePrice = web3.utils.toBN(1e18);
        let salt = "0x"+crypto.randomBytes(32).toString("hex")
        await niftyConnectExchangeInst.makeOrder_(
            [
                NiftyConnectExchange.address,                          // exchange
                player1,                                            // maker
                "0x0000000000000000000000000000000000000000",       // taker
                player1RelayerFeeRecipient,                         // makerRelayerFeeRecipient
                "0x0000000000000000000000000000000000000000",       // takerRelayerFeeRecipient
                TestERC1155.address,                                 // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                TestERC20.address,                                  // paymentToken
                "0x0000000000000000000000000000000000000000",       // from
                player1                                             // to
            ],
            [
                exchangePrice,                // uint basePrice
                web3.utils.toBN(0),     // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt),        // uint salt
                ERC1155SafeTransferSelector,  // uint merkleValidatorSelector
                tokenId,                      // uint tokenId
                supply,                       // uint amount
                0,                            // uint totalLeaf
            ],
            0,                      // side
            0,                      // saleKind
            buyReplacementPattern,  // replacementPattern
            [],                     // staticExtradata
            [
                "0x0000000000000000000000000000000000000000000000000000000000000000",
                "0x0000000000000000000000000000000000000000000000000000000000000000"
            ],                      // merkleData
            {from: player1}
        );

        // ---------------------------------------------------------------------------------------------------------

        await sleep(2 * 1000);
        await time.advanceBlock();

        const sellCalldata = await niftyConnectExchangeInst.buildCallData(
            ERC1155SafeTransferSelector, // uint selector,
            player0, // address from,
            player1, // address to,
            TestERC1155.address,// address nftAddress,
            tokenId, // uint256 tokenId,
            supply,// uint256 amount,
            "0x00", // bytes32 merkleRoot
            [],// bytes32[] memory merkleProof
        );

        const sellReplacementPattern = generateSellReplacementPatternForNormalOrder(true)

        const INVERSE_BASIS_POINT = await niftyConnectExchangeInst.INVERSE_BASIS_POINT();
        const exchangeFeeRate = await niftyConnectExchangeInst.exchangeFeeRate();
        const takerRelayerFeeShare = await niftyConnectExchangeInst.takerRelayerFeeShare();
        const makerRelayerFeeShare = await niftyConnectExchangeInst.makerRelayerFeeShare();
        const protocolFeeShare = await niftyConnectExchangeInst.protocolFeeShare();
        const protocolFeeRecipient = await niftyConnectExchangeInst.protocolFeeRecipient();

        const royaltyRegisterHubInst = await RoyaltyRegisterHub.deployed();
        const royaltyInfo = await royaltyRegisterHubInst.royaltyInfo(TestERC721.address, exchangePrice);
        const royaltyReceiver = royaltyInfo["0"]
        const royaltyAmount  = royaltyInfo["1"]

        const initPlayer0ERC20Balance = await testERC20Inst.balanceOf(player0);
        const initPlayer0RelayerFeeRecipientERC20Balance = await testERC20Inst.balanceOf(player0RelayerFeeRecipient);
        const initPlayer1RelayerFeeRecipientERC20Balance = await testERC20Inst.balanceOf(player1RelayerFeeRecipient);
        const initProtocolFeeRecipientERC20Balance = await testERC20Inst.balanceOf(protocolFeeRecipient);
        const initRoyaltyReceiverERC20Balance = await testERC20Inst.balanceOf(royaltyReceiver);

        await niftyConnectExchangeInst.takeOrder_(
            [   // address[16] addrs,
                //buy
                NiftyConnectExchange.address,                          // exchange
                player1,                                            // maker
                "0x0000000000000000000000000000000000000000",       // taker
                player1RelayerFeeRecipient,                         // makerRelayerFeeRecipient
                "0x0000000000000000000000000000000000000000",       // takerRelayerFeeRecipient
                TestERC1155.address,                                // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                TestERC20.address,                                  // paymentToken

                //sell
                NiftyConnectExchange.address,                          // exchange
                player0,                                            // maker
                player1,                                            // taker
                "0x0000000000000000000000000000000000000000",       // makerRelayerFeeRecipient
                player0RelayerFeeRecipient,                         // takerRelayerFeeRecipient
                TestERC1155.address,                                // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                TestERC20.address,                                  // paymentToken
            ],
            [   // uint[12] uints,
                //buy
                exchangePrice,                // uint basePrice
                web3.utils.toBN(0),     // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt),        // uint salt
                tokenId,                      // uint tokenId
                //sell
                exchangePrice,                // uint basePrice
                web3.utils.toBN(0),     // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt),        // uint salt
                tokenId,                      // uint tokenId
            ],
            [   // uint8[4] sidesKindsHowToCalls,
                0, 0,
                1, 0
            ],
            buyCalldata, // bytes calldataBuy,
            sellCalldata, // bytes calldataSell,
            buyReplacementPattern, // bytes replacementPatternBuy,
            sellReplacementPattern, // bytes replacementPatternSell,
            [],// bytes staticExtradataBuy,
            [],// bytes staticExtradataSell,
            "0x00",// bytes32 rssMetadata
            {from: player0}
        );

        const newPlayer0ERC20Balance = await testERC20Inst.balanceOf(player0);
        const newPlayer0RelayerFeeRecipientERC20Balance = await testERC20Inst.balanceOf(player0RelayerFeeRecipient);
        const newPlayer1RelayerFeeRecipientERC20Balance = await testERC20Inst.balanceOf(player1RelayerFeeRecipient);
        const newProtocolFeeRecipientERC20Balance = await testERC20Inst.balanceOf(protocolFeeRecipient);
        const newRoyaltyReceiverERC20Balance = await testERC20Inst.balanceOf(royaltyReceiver);

        const player0ERC20Balance = newPlayer0ERC20Balance.sub(initPlayer0ERC20Balance);
        const player0RelayerFeeRecipientERC20Balance = newPlayer0RelayerFeeRecipientERC20Balance.sub(initPlayer0RelayerFeeRecipientERC20Balance);
        const player1RelayerFeeRecipientERC20Balance = newPlayer1RelayerFeeRecipientERC20Balance.sub(initPlayer1RelayerFeeRecipientERC20Balance);
        const protocolFeeRecipientERC20Balance = newProtocolFeeRecipientERC20Balance.sub(initProtocolFeeRecipientERC20Balance);
        const royaltyReceiverERC20Balance = newRoyaltyReceiverERC20Balance.sub(initRoyaltyReceiverERC20Balance);

        assert.equal(player0ERC20Balance.toString(),
            exchangePrice.mul(web3.utils.toBN(INVERSE_BASIS_POINT).sub(web3.utils.toBN(exchangeFeeRate))).div(web3.utils.toBN(INVERSE_BASIS_POINT)).sub(royaltyAmount).toString(),
            "wrong player0 ERC20 balance");
        assert.equal(player0RelayerFeeRecipientERC20Balance.toString(),
            exchangePrice.mul(web3.utils.toBN(exchangeFeeRate)).mul(web3.utils.toBN(takerRelayerFeeShare)).div(web3.utils.toBN(INVERSE_BASIS_POINT).mul(web3.utils.toBN(INVERSE_BASIS_POINT))).toString(),
            "wrong player0RelayerFeeRecipient ERC20 balance");
        assert.equal(player1RelayerFeeRecipientERC20Balance.toString(),
            exchangePrice.mul(web3.utils.toBN(exchangeFeeRate)).mul(web3.utils.toBN(makerRelayerFeeShare)).div(web3.utils.toBN(INVERSE_BASIS_POINT).mul(web3.utils.toBN(INVERSE_BASIS_POINT))).toString(),
            "wrong player1RelayerFeeRecipient ERC20 balance");
        assert.equal(protocolFeeRecipientERC20Balance.toString(),
            exchangePrice.mul(web3.utils.toBN(exchangeFeeRate)).mul(web3.utils.toBN(protocolFeeShare)).div(web3.utils.toBN(INVERSE_BASIS_POINT).mul(web3.utils.toBN(INVERSE_BASIS_POINT))).toString(),
            "wrong protocolFeeRecipient ERC20 balance");
        assert.equal(royaltyReceiverERC20Balance.toString(), royaltyAmount.toString(), "wrong royaltyAmount");

        assert.equal(exchangePrice.toString(),
            player0ERC20Balance.
            add(player0RelayerFeeRecipientERC20Balance).
            add(player1RelayerFeeRecipientERC20Balance).
            add(protocolFeeRecipientERC20Balance).
            add(royaltyReceiverERC20Balance).
            toString(),
            "balance sum mismatch");
    });
    it('Declining Bidder', async () => {
        const player0 = accounts[1];
        const player1 = accounts[2];
        const player0RelayerFeeRecipient = accounts[3];
        const player1RelayerFeeRecipient = accounts[4];

        const niftyConnectExchangeInst = await NiftyConnectExchange.deployed();
        const testERC721Inst = await TestERC721.deployed();
        const testERC20Inst = await TestERC20.deployed();

        const tokenIdIdx = await testERC721Inst.tokenIdIdx();
        await testERC721Inst.mint(player0, {from: player0});
        const ownerAddr = await testERC721Inst.ownerOf(tokenIdIdx)

        const exchangePrice = web3.utils.toBN(1e18);
        const extraPrice = web3.utils.toBN(1e17);

        assert.equal(ownerAddr.toString(), player0.toString(), "wrong owner");

        const sellCalldata = await niftyConnectExchangeInst.buildCallData(
            ERC721TransferSelector, // uint selector,
            player0, // address from,
            "0x0000000000000000000000000000000000000000", // address to,
            TestERC721.address,// address nftAddress,
            tokenIdIdx, // uint256 tokenId,
            ERC721_AMOUNT,// uint256 amount,
            "0x00", // bytes32 merkleRoot
            [],// bytes32[] memory merkleProof
        );

        let sellReplacementPattern = generateSellReplacementPatternForNormalOrder(false)

        let latestBlock = await web3.eth.getBlock("latest");
        let timestamp = latestBlock.timestamp;
        let expireTime = web3.utils.toBN(timestamp).add(web3.utils.toBN(10)); // expire at one minute later

        let salt = "0x"+crypto.randomBytes(32).toString("hex");

        await niftyConnectExchangeInst.makeOrder_(
            [
                NiftyConnectExchange.address,                          // exchange
                player0,                                            // maker
                "0x0000000000000000000000000000000000000000",       // taker
                player0RelayerFeeRecipient,                         // makerRelayerFeeRecipient
                "0x0000000000000000000000000000000000000000",       // takerRelayerFeeRecipient
                TestERC721.address,                                 // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                TestERC20.address,                                  // paymentToken
                player0,                                            // from
                "0x0000000000000000000000000000000000000000"        // to
            ],
            [
                exchangePrice,                // uint basePrice
                extraPrice,                   // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt),        // uint salt
                ERC721TransferSelector,       // uint merkleValidatorSelector
                tokenIdIdx,                   // uint tokenId
                ERC721_AMOUNT,                // uint amount
                0,                            // uint totalLeaf
            ],
            1,                      // side
            1,                      // saleKind
            sellReplacementPattern, // replacementPattern
            [],                     // staticExtradata
            [
                "0x0000000000000000000000000000000000000000000000000000000000000000",
                "0x0000000000000000000000000000000000000000000000000000000000000000"
            ],                      // merkleData
            {from: player0}
        );

        // ---------------------------------------------------------------------------------------------------------

        const buyCalldata = await niftyConnectExchangeInst.buildCallData(
            ERC721TransferSelector, // uint selector,
            "0x0000000000000000000000000000000000000000", // address from,
            player1, // address to,
            TestERC721.address,// address nftAddress,
            tokenIdIdx, // uint256 tokenId,
            ERC721_AMOUNT,// uint256 amount,
            "0x00", // bytes32 merkleRoot
            [],// bytes32[] memory merkleProof
        );

        const buyReplacementPattern = generateBuyReplacementPatternForNormalOrder(false)

        const INVERSE_BASIS_POINT = await niftyConnectExchangeInst.INVERSE_BASIS_POINT();
        const exchangeFeeRate = await niftyConnectExchangeInst.exchangeFeeRate();
        const takerRelayerFeeShare = await niftyConnectExchangeInst.takerRelayerFeeShare();
        const makerRelayerFeeShare = await niftyConnectExchangeInst.makerRelayerFeeShare();
        const protocolFeeShare = await niftyConnectExchangeInst.protocolFeeShare();
        const protocolFeeRecipient = await niftyConnectExchangeInst.protocolFeeRecipient();

        const royaltyRegisterHubInst = await RoyaltyRegisterHub.deployed();
        let royaltyInfo = await royaltyRegisterHubInst.royaltyInfo(TestERC721.address, exchangeFeeRate);
        let royaltyReceiver = royaltyInfo["0"]
        let royaltyAmount  = royaltyInfo["1"]

        const initPlayer0ERC20Balance = await testERC20Inst.balanceOf(player0);
        const initPlayer0RelayerFeeRecipientERC20Balance = await testERC20Inst.balanceOf(player0RelayerFeeRecipient);
        const initPlayer1RelayerFeeRecipientERC20Balance = await testERC20Inst.balanceOf(player1RelayerFeeRecipient);
        const initProtocolFeeRecipientERC20Balance = await testERC20Inst.balanceOf(protocolFeeRecipient);
        const initRoyaltyReceiverERC20Balance = await testERC20Inst.balanceOf(royaltyReceiver);

        await sleep(5 * 1000);
        await time.advanceBlock();

        let currentPrice = await niftyConnectExchangeInst.calculateCurrentPrice_(
            [
                NiftyConnectExchange.address,                          // exchange
                player0,                                            // maker
                "0x0000000000000000000000000000000000000000",       // taker
                player0RelayerFeeRecipient,                         // makerRelayerFeeRecipient
                "0x0000000000000000000000000000000000000000",       // takerRelayerFeeRecipient
                TestERC721.address,                                 // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                TestERC20.address,                                  // paymentToken
                player0,                                            // from
                "0x0000000000000000000000000000000000000000"        // to
            ],
            [
                exchangePrice,                // uint basePrice
                extraPrice,                   // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt),        // uint salt
                ERC721TransferSelector,       // uint merkleValidatorSelector
                tokenIdIdx,                   // uint tokenId
                ERC721_AMOUNT,                // uint amount
                0,                            // uint totalLeaf
            ],
            1,                      // side
            1,                      // saleKind
            sellReplacementPattern, // replacementPattern
            [],                     // staticExtradata
            "0x00",                 // merkleRoot
        );

        const atomicMatchTx = await niftyConnectExchangeInst.takeOrder_(
            [   // address[16] addrs,
                //buy
                NiftyConnectExchange.address,                          // exchange
                player1,                                            // maker
                "0x0000000000000000000000000000000000000000",       // taker
                "0x0000000000000000000000000000000000000000",       // makerRelayerFeeRecipient
                player1RelayerFeeRecipient,                         // takerRelayerFeeRecipient
                TestERC721.address,                                 // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                TestERC20.address,                                  // paymentToken

                //sell
                NiftyConnectExchange.address,                          // exchange
                player0,                                            // maker
                "0x0000000000000000000000000000000000000000",       // taker
                player0RelayerFeeRecipient,                         // makerRelayerFeeRecipient
                "0x0000000000000000000000000000000000000000",       // takerRelayerFeeRecipient
                TestERC721.address,                                 // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                TestERC20.address,                                  // paymentToken
            ],
            [   // uint[12] uints,
                //buy
                exchangePrice,                // uint basePrice
                extraPrice,                   // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt),        // uint salt
                tokenIdIdx,                   // uint tokenId
                //sell
                exchangePrice,                // uint basePrice
                extraPrice,                   // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt),        // uint salt
                tokenIdIdx,                   // uint tokenId
            ],
            [   // uint8[4] sidesKindsHowToCalls,
                0, 1,
                1, 1
            ],
            buyCalldata, // bytes calldataBuy,
            sellCalldata, // bytes calldataSell,
            buyReplacementPattern, // bytes replacementPatternBuy,
            sellReplacementPattern, // bytes replacementPatternSell,
            [],// bytes staticExtradataBuy,
            [],// bytes staticExtradataSell,
            "0x00",// bytes32 rssMetadata
            {from: player1}
        );

        truffleAssert.eventEmitted(atomicMatchTx, "OrdersMatched",(ev) => {
            return ev.price.toString() === currentPrice.toString();
        });

        royaltyInfo = await royaltyRegisterHubInst.royaltyInfo(TestERC721.address, currentPrice);
        royaltyReceiver = royaltyInfo["0"]
        royaltyAmount  = royaltyInfo["1"]

        const newPlayer0ERC20Balance = await testERC20Inst.balanceOf(player0);
        const newPlayer0RelayerFeeRecipientERC20Balance = await testERC20Inst.balanceOf(player0RelayerFeeRecipient);
        const newPlayer1RelayerFeeRecipientERC20Balance = await testERC20Inst.balanceOf(player1RelayerFeeRecipient);
        const newProtocolFeeRecipientERC20Balance = await testERC20Inst.balanceOf(protocolFeeRecipient);
        const newRoyaltyReceiverERC20Balance = await testERC20Inst.balanceOf(royaltyReceiver);

        const player0ERC20Balance = newPlayer0ERC20Balance.sub(initPlayer0ERC20Balance);
        const player0RelayerFeeRecipientERC20Balance = newPlayer0RelayerFeeRecipientERC20Balance.sub(initPlayer0RelayerFeeRecipientERC20Balance);
        const player1RelayerFeeRecipientERC20Balance = newPlayer1RelayerFeeRecipientERC20Balance.sub(initPlayer1RelayerFeeRecipientERC20Balance);
        const protocolFeeRecipientERC20Balance = newProtocolFeeRecipientERC20Balance.sub(initProtocolFeeRecipientERC20Balance);
        const royaltyReceiverERC20Balance = newRoyaltyReceiverERC20Balance.sub(initRoyaltyReceiverERC20Balance);

        assert.equal(player0ERC20Balance.toString(),
            currentPrice.mul(web3.utils.toBN(INVERSE_BASIS_POINT).sub(web3.utils.toBN(exchangeFeeRate))).div(web3.utils.toBN(INVERSE_BASIS_POINT)).sub(royaltyAmount).toString(),
            "wrong player0 ERC20 balance");
        assert.equal(player0RelayerFeeRecipientERC20Balance.toString(),
            currentPrice.mul(web3.utils.toBN(exchangeFeeRate)).mul(web3.utils.toBN(makerRelayerFeeShare)).div(web3.utils.toBN(INVERSE_BASIS_POINT).mul(web3.utils.toBN(INVERSE_BASIS_POINT))).toString(),
            "wrong player0RelayerFeeRecipient ERC20 balance");
        assert.equal(player1RelayerFeeRecipientERC20Balance.toString(),
            currentPrice.mul(web3.utils.toBN(exchangeFeeRate)).mul(web3.utils.toBN(takerRelayerFeeShare)).div(web3.utils.toBN(INVERSE_BASIS_POINT).mul(web3.utils.toBN(INVERSE_BASIS_POINT))).toString(),
            "wrong player1RelayerFeeRecipient ERC20 balance");
        assert.equal(protocolFeeRecipientERC20Balance.toString(),
            currentPrice.mul(web3.utils.toBN(exchangeFeeRate)).mul(web3.utils.toBN(protocolFeeShare)).div(web3.utils.toBN(INVERSE_BASIS_POINT).mul(web3.utils.toBN(INVERSE_BASIS_POINT))).toString(),
            "wrong protocolFeeRecipient ERC20 balance");
        assert.equal(royaltyReceiverERC20Balance.toString(), royaltyAmount.toString(), "wrong royaltyAmount");

        assert.equal(currentPrice.toString(),
            player0ERC20Balance.
            add(player0RelayerFeeRecipientERC20Balance).
            add(player1RelayerFeeRecipientERC20Balance).
            add(protocolFeeRecipientERC20Balance).
            add(royaltyReceiverERC20Balance).
            toString(),
            "balance sum mismatch");
    });
    it('Collection Based Maker Offer', async () => {
        const player0 = accounts[1];
        const player1 = accounts[2];
        const player0RelayerFeeRecipient = accounts[3];
        const player1RelayerFeeRecipient = accounts[4];

        const niftyConnectExchangeInst = await NiftyConnectExchange.deployed();
        const testERC721Inst = await TestERC721.deployed();

        const tokenIdIdx1 = await testERC721Inst.tokenIdIdx();
        await testERC721Inst.mint(player0, {from: player0});
        const tokenIdIdx2 = await testERC721Inst.tokenIdIdx();
        await testERC721Inst.mint(player0, {from: player0});

        const emptyTokenId = web3.utils.toBN(0);

        const buyCalldata = await niftyConnectExchangeInst.buildCallData(
            ERC721TransferSelector, // uint selector,
            "0x0000000000000000000000000000000000000000", // address from,
            player1, // address to,
            TestERC721.address,// address nftAddress,
            emptyTokenId, // uint256 tokenId,
            ERC721_AMOUNT,// uint256 amount,
            "0x00", // bytes32 merkleRoot
            [],// bytes32[] memory merkleProof
        );

        let buyReplacementPattern = generateBuyReplacementPatternForCollectionBasedOrder(false)

        let latestBlock = await web3.eth.getBlock("latest");
        let timestamp = latestBlock.timestamp;
        let expireTime = web3.utils.toBN(timestamp).add(web3.utils.toBN(3600)); // expire at one hour later
        let exchangePrice = web3.utils.toBN(1e18);
        let salt1 = "0x"+crypto.randomBytes(32).toString("hex")
        let salt2 = "0x"+crypto.randomBytes(32).toString("hex")
        await niftyConnectExchangeInst.makeOrder_(
            [
                NiftyConnectExchange.address,                          // exchange
                player1,                                            // maker
                "0x0000000000000000000000000000000000000000",       // taker
                player1RelayerFeeRecipient,                         // makerRelayerFeeRecipient
                "0x0000000000000000000000000000000000000000",       // takerRelayerFeeRecipient
                TestERC721.address,                                 // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                TestERC20.address,                                  // paymentToken
                "0x0000000000000000000000000000000000000000",       // from
                player1                                             // to
            ],
            [
                exchangePrice,                // uint basePrice
                web3.utils.toBN(0),     // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt1),       // uint salt
                ERC721TransferSelector,       // uint merkleValidatorSelector
                emptyTokenId,                 // uint tokenId
                ERC721_AMOUNT,                // uint amount
                0,                            // uint totalLeaf
            ],
            0,                      // side
            0,                      // saleKind
            buyReplacementPattern,  // replacementPattern
            [],                     // staticExtradata
            [
                "0x0000000000000000000000000000000000000000000000000000000000000000",
                "0x0000000000000000000000000000000000000000000000000000000000000000"
            ],                      // merkleData
            {from: player1}
        );
        await niftyConnectExchangeInst.makeOrder_(
            [
                NiftyConnectExchange.address,                          // exchange
                player1,                                            // maker
                "0x0000000000000000000000000000000000000000",       // taker
                player1RelayerFeeRecipient,                         // makerRelayerFeeRecipient
                "0x0000000000000000000000000000000000000000",       // takerRelayerFeeRecipient
                TestERC721.address,                                 // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                TestERC20.address,                                  // paymentToken
                "0x0000000000000000000000000000000000000000",       // from
                player1                                             // to
            ],
            [
                exchangePrice,                // uint basePrice
                web3.utils.toBN(0),     // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt2),       // uint salt
                ERC721TransferSelector,       // uint merkleValidatorSelector
                emptyTokenId,                 // uint tokenId
                ERC721_AMOUNT,                // uint amount
                0,                            // uint totalLeaf
            ],
            0,                      // side
            0,                      // saleKind
            buyReplacementPattern,  // replacementPattern
            [],                     // staticExtradata
            [
                "0x0000000000000000000000000000000000000000000000000000000000000000",
                "0x0000000000000000000000000000000000000000000000000000000000000000"
            ],                      // merkleData
            {from: player1}
        );

        // ---------------------------------------------------------------------------------------------------------

        await sleep(2 * 1000);
        await time.advanceBlock();

        const sellCalldata1 = await niftyConnectExchangeInst.buildCallData(
            ERC721TransferSelector, // uint selector,
            player0, // address from,
            player1, // address to,
            TestERC721.address,// address nftAddress,
            tokenIdIdx1, // uint256 tokenId,
            ERC721_AMOUNT,// uint256 amount,
            "0x00", // bytes32 merkleRoot
            [],// bytes32[] memory merkleProof
        );

        const sellReplacementPattern = generateSellReplacementPatternForCollectionBasedOrder(false)

        await niftyConnectExchangeInst.takeOrder_(
            [   // address[16] addrs,
                //buy
                NiftyConnectExchange.address,                          // exchange
                player1,                                            // maker
                "0x0000000000000000000000000000000000000000",       // taker
                player1RelayerFeeRecipient,                         // makerRelayerFeeRecipient
                "0x0000000000000000000000000000000000000000",       // takerRelayerFeeRecipient
                TestERC721.address,                                 // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                TestERC20.address,                                  // paymentToken

                //sell
                NiftyConnectExchange.address,                          // exchange
                player0,                                            // maker
                player1,                                            // taker
                "0x0000000000000000000000000000000000000000",       // makerRelayerFeeRecipient
                player0RelayerFeeRecipient,                         // takerRelayerFeeRecipient
                TestERC721.address,                                 // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                TestERC20.address,                                  // paymentToken
            ],
            [   // uint[12] uints,
                //buy
                exchangePrice,                // uint basePrice
                web3.utils.toBN(0),     // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt1),        // uint salt
                emptyTokenId,                 // uint tokenId
                //sell
                exchangePrice,                // uint basePrice
                web3.utils.toBN(0),     // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt1),        // uint salt
                tokenIdIdx1,                  // uint tokenId
            ],
            [   // uint8[4] sidesKindsHowToCalls,
                0, 0,
                1, 0
            ],
            buyCalldata, // bytes calldataBuy,
            sellCalldata1, // bytes calldataSell,
            buyReplacementPattern, // bytes replacementPatternBuy,
            sellReplacementPattern, // bytes replacementPatternSell,
            [],// bytes staticExtradataBuy,
            [],// bytes staticExtradataSell,
            "0x00",// bytes32 rssMetadata
            {from: player0}
        );

        const sellCalldata2 = await niftyConnectExchangeInst.buildCallData(
            ERC721TransferSelector, // uint selector,
            player0, // address from,
            player1, // address to,
            TestERC721.address,// address nftAddress,
            tokenIdIdx2, // uint256 tokenId,
            ERC721_AMOUNT,// uint256 amount,
            "0x00", // bytes32 merkleRoot
            [],// bytes32[] memory merkleProof
        );

        await niftyConnectExchangeInst.takeOrder_(
            [   // address[16] addrs,
                //buy
                NiftyConnectExchange.address,                          // exchange
                player1,                                            // maker
                "0x0000000000000000000000000000000000000000",       // taker
                player1RelayerFeeRecipient,                         // makerRelayerFeeRecipient
                "0x0000000000000000000000000000000000000000",       // takerRelayerFeeRecipient
                TestERC721.address,                                 // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                TestERC20.address,                                  // paymentToken

                //sell
                NiftyConnectExchange.address,                          // exchange
                player0,                                            // maker
                player1,                                            // taker
                "0x0000000000000000000000000000000000000000",       // makerRelayerFeeRecipient
                player0RelayerFeeRecipient,                         // takerRelayerFeeRecipient
                TestERC721.address,                                 // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                TestERC20.address,                                  // paymentToken
            ],
            [   // uint[12] uints,
                //buy
                exchangePrice,                // uint basePrice
                web3.utils.toBN(0),     // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt2),        // uint salt
                emptyTokenId,                 // uint tokenId
                //sell
                exchangePrice,                // uint basePrice
                web3.utils.toBN(0),     // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt2),       // uint salt
                tokenIdIdx2,                  // uint tokenId
            ],
            [   // uint8[4] sidesKindsHowToCalls,
                0, 0,
                1, 0
            ],
            buyCalldata, // bytes calldataBuy,
            sellCalldata2, // bytes calldataSell,
            buyReplacementPattern, // bytes replacementPatternBuy,
            sellReplacementPattern, // bytes replacementPatternSell,
            [],// bytes staticExtradataBuy,
            [],// bytes staticExtradataSell,
            "0x00",// bytes32 rssMetadata
            {from: player0}
        );
    });
    it('Trait Based Maker Offer', async () => {
        const player0 = accounts[1];
        const player1 = accounts[2];
        const player0RelayerFeeRecipient = accounts[3];
        const player1RelayerFeeRecipient = accounts[4];

        const niftyConnectExchangeInst = await NiftyConnectExchange.deployed();
        const testERC721Inst = await TestERC721.deployed();
        const testERC20Inst = await TestERC20.deployed();
        const merkleValidatorInst = await MerkleValidator.deployed();

        const tokenIdIdx1 = await testERC721Inst.tokenIdIdx();
        await testERC721Inst.mint(player0, {from: player0});
        const tokenIdIdx2 = await testERC721Inst.tokenIdIdx();
        await testERC721Inst.mint(player0, {from: player0});
        const tokenIdIdx3 = await testERC721Inst.tokenIdIdx();
        await testERC721Inst.mint(player0, {from: player0});
        const tokenIdIdx4 = await testERC721Inst.tokenIdIdx();
        await testERC721Inst.mint(player0, {from: player0});
        const tokenIdIdx5 = await testERC721Inst.tokenIdIdx();
        await testERC721Inst.mint(player0, {from: player0});
        const tokenIdIdx6 = await testERC721Inst.tokenIdIdx();
        await testERC721Inst.mint(player0, {from: player0});
        const tokenIdIdx7 = await testERC721Inst.tokenIdIdx();
        await testERC721Inst.mint(player0, {from: player0});

        const proof1 = await merkleValidatorInst.calculateProof(tokenIdIdx1, tokenIdIdx2);
        const proof2 = await merkleValidatorInst.calculateProof(tokenIdIdx3, tokenIdIdx4);
        const proof3 = await merkleValidatorInst.calculateProof(proof1, proof2);

        const {merkleRoot, merkleProof} = generateMerkleProofAndRoot(tokenIdIdx1,
            [
                tokenIdIdx1,
                tokenIdIdx2,
                tokenIdIdx3,
                tokenIdIdx4,
                tokenIdIdx5,
                tokenIdIdx6,
                tokenIdIdx7,
            ]
        )

        const emptyTokenId = web3.utils.toBN(0);

        const buyCalldata = await niftyConnectExchangeInst.buildCallData(
            ERC721TransferSelector, // uint selector,
            "0x0000000000000000000000000000000000000000", // address from,
            player1, // address to,
            TestERC721.address,// address nftAddress,
            emptyTokenId, // uint256 tokenId,
            ERC721_AMOUNT,// uint256 amount,
            merkleRoot, // bytes32 merkleRoot
            [
                "0x0000000000000000000000000000000000000000000000000000000000000000",
                "0x0000000000000000000000000000000000000000000000000000000000000000",
                "0x0000000000000000000000000000000000000000000000000000000000000000"
            ],          // merkleProof
        );
        const buyReplacementPattern = generateBuyReplacementPatternForTraitBasedOrder(7, false);

        let latestBlock = await web3.eth.getBlock("latest");
        let timestamp = latestBlock.timestamp;
        let expireTime = web3.utils.toBN(timestamp).add(web3.utils.toBN(3600)); // expire at one hour later
        let exchangePrice = web3.utils.toBN(1e18);
        let salt = "0x"+crypto.randomBytes(32).toString("hex")
        const approveOrderTx = await niftyConnectExchangeInst.makeOrder_(
            [
                NiftyConnectExchange.address,                          // exchange
                player1,                                            // maker
                "0x0000000000000000000000000000000000000000",       // taker
                player1RelayerFeeRecipient,                         // makerRelayerFeeRecipient
                "0x0000000000000000000000000000000000000000",       // takerRelayerFeeRecipient
                TestERC721.address,                                 // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                TestERC20.address,                                  // paymentToken
                "0x0000000000000000000000000000000000000000",       // from
                player1                                             // to
            ],
            [
                exchangePrice,                // uint basePrice
                web3.utils.toBN(0),     // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt),        // uint salt
                ERC721TransferSelector,       // uint merkleValidatorSelector
                emptyTokenId,                 // uint tokenId
                ERC721_AMOUNT,                // uint amount
                7,                            // uint totalLeaf
            ],
            0,                      // side
            0,                      // saleKind
            buyReplacementPattern,  // replacementPattern
            [],                     // staticExtradata
            [
                merkleRoot,
                "0x0000000000000000000000000000000000000000000000000000000000000000"
            ],                      // merkleData
            {from: player1}
        );

        truffleAssert.eventEmitted(approveOrderTx, "OrderApprovedPartTwo",(ev) => {
            return ev.calldata.toString() === buyCalldata.toString();
        });

        // ---------------------------------------------------------------------------------------------------------

        await sleep(2 * 1000);
        await time.advanceBlock();

        const sellCalldata = await niftyConnectExchangeInst.buildCallData(
            ERC721TransferSelector, // uint selector,
            player0, // address from,
            player1, // address to,
            TestERC721.address,// address nftAddress,
            tokenIdIdx1, // uint256 tokenId,
            ERC721_AMOUNT,// uint256 amount,
            merkleRoot, // bytes32 merkleRoot
            merkleProof,// bytes32[] memory merkleProof
        );

        const sellReplacementPattern = generateSellReplacementPatternForTraitBasedOrder(7, false)

        await niftyConnectExchangeInst.takeOrder_(
            [   // address[16] addrs,
                //buy
                NiftyConnectExchange.address,                          // exchange
                player1,                                            // maker
                "0x0000000000000000000000000000000000000000",       // taker
                player1RelayerFeeRecipient,                         // makerRelayerFeeRecipient
                "0x0000000000000000000000000000000000000000",       // takerRelayerFeeRecipient
                TestERC721.address,                                 // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                TestERC20.address,                                  // paymentToken

                //sell
                NiftyConnectExchange.address,                          // exchange
                player0,                                            // maker
                player1,                                            // taker
                "0x0000000000000000000000000000000000000000",       // makerRelayerFeeRecipient
                player0RelayerFeeRecipient,                         // takerRelayerFeeRecipient
                TestERC721.address,                                 // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                TestERC20.address,                                  // paymentToken
            ],
            [   // uint[12] uints,
                //buy
                exchangePrice,                // uint basePrice
                web3.utils.toBN(0),     // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt),        // uint salt
                emptyTokenId,                 // uint tokenId
                //sell
                exchangePrice,                // uint basePrice
                web3.utils.toBN(0),     // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt),        // uint salt
                tokenIdIdx1,                  // uint tokenId
            ],
            [   // uint8[4] sidesKindsHowToCalls,
                0, 0,
                1, 0
            ],
            buyCalldata, // bytes calldataBuy,
            sellCalldata, // bytes calldataSell,
            buyReplacementPattern, // bytes replacementPatternBuy,
            sellReplacementPattern, // bytes replacementPatternSell,
            [],// bytes staticExtradataBuy,
            [],// bytes staticExtradataSell,
            "0x00",// bytes32 rssMetadata
            {from: player0}
        );

        latestBlock = await web3.eth.getBlock("latest");
        timestamp = latestBlock.timestamp;
        expireTime = web3.utils.toBN(timestamp).add(web3.utils.toBN(3600)); // expire at one hour later
        exchangePrice = web3.utils.toBN(1e18);
        salt = "0x"+crypto.randomBytes(32).toString("hex")
        await niftyConnectExchangeInst.makeOrder_(
            [
                NiftyConnectExchange.address,                       // exchange
                player1,                                            // maker
                "0x0000000000000000000000000000000000000000",       // taker
                player1RelayerFeeRecipient,                         // makerRelayerFeeRecipient
                "0x0000000000000000000000000000000000000000",       // takerRelayerFeeRecipient
                TestERC721.address,                                 // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                TestERC20.address,                                  // paymentToken
                "0x0000000000000000000000000000000000000000",       // from
                player1                                             // to
            ],
            [
                exchangePrice,                // uint basePrice
                web3.utils.toBN(0),     // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt),        // uint salt
                ERC721TransferSelector,       // uint merkleValidatorSelector
                emptyTokenId,                 // uint tokenId
                ERC721_AMOUNT,                // uint amount
                7,                            // uint totalLeaf
            ],
            0,                      // side
            0,                      // saleKind
            buyReplacementPattern,  // replacementPattern
            [],                     // staticExtradata
            [
                merkleRoot,
                "0x0000000000000000000000000000000000000000000000000000000000000000"
            ],                      // merkleData
            {from: player1}
        );

        await sleep(2 * 1000);
        await time.advanceBlock();

        const merkleResult = generateMerkleProofAndRoot(tokenIdIdx2,
            [
                tokenIdIdx1,
                tokenIdIdx2,
                tokenIdIdx3,
                tokenIdIdx4,
                tokenIdIdx5,
                tokenIdIdx6,
                tokenIdIdx7,
            ]
        )
        assert.equal(merkleRoot.toString(), merkleResult.merkleRoot.toString(), "wrong merkleRoot");
        const sellCalldataNew = await niftyConnectExchangeInst.buildCallData(
            ERC721TransferSelector, // uint selector,
            player0, // address from,
            player1, // address to,
            TestERC721.address,// address nftAddress,
            tokenIdIdx2, // uint256 tokenId,
            ERC721_AMOUNT,// uint256 amount,
            merkleResult.merkleRoot, // bytes32 merkleRoot
            merkleResult.merkleProof,// bytes32[] memory merkleProof
        );

        await niftyConnectExchangeInst.takeOrder_(
            [   // address[16] addrs,
                //buy
                NiftyConnectExchange.address,                       // exchange
                player1,                                            // maker
                "0x0000000000000000000000000000000000000000",       // taker
                player1RelayerFeeRecipient,                         // makerRelayerFeeRecipient
                "0x0000000000000000000000000000000000000000",       // takerRelayerFeeRecipient
                TestERC721.address,                                 // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                TestERC20.address,                                  // paymentToken

                //sell
                NiftyConnectExchange.address,                       // exchange
                player0,                                            // maker
                player1,                                            // taker
                "0x0000000000000000000000000000000000000000",       // makerRelayerFeeRecipient
                player0RelayerFeeRecipient,                         // takerRelayerFeeRecipient
                TestERC721.address,                                 // nftAddress
                "0x0000000000000000000000000000000000000000",       // staticTarget
                TestERC20.address,                                  // paymentToken
            ],
            [   // uint[12] uints,
                //buy
                exchangePrice,                // uint basePrice
                web3.utils.toBN(0),     // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt),        // uint salt
                emptyTokenId,                 // uint tokenId
                //sell
                exchangePrice,                // uint basePrice
                web3.utils.toBN(0),     // uint extra
                timestamp,                    // uint listingTime
                expireTime,                   // uint expirationTime
                web3.utils.toBN(salt),        // uint salt
                tokenIdIdx2,                  // uint tokenId
            ],
            [   // uint8[4] sidesKindsHowToCalls,
                0, 0,
                1, 0
            ],
            buyCalldata, // bytes calldataBuy,
            sellCalldataNew, // bytes calldataSell,
            buyReplacementPattern, // bytes replacementPatternBuy,
            sellReplacementPattern, // bytes replacementPatternSell,
            [],// bytes staticExtradataBuy,
            [],// bytes staticExtradataSell,
            "0x00",// bytes32 rssMetadata
            {from: player0}
        );
    });
});
