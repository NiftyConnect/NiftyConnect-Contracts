const NiftyConnectExchange = artifacts.require("NiftyConnectExchange");
const NiftyConnectTokenTransferProxy = artifacts.require("NiftyConnectTokenTransferProxy");
const MerkleValidator = artifacts.require("MerkleValidator");
const RoyaltyRegisterHub = artifacts.require("RoyaltyRegisterHub");

const TestERC721 = artifacts.require("TestERC721");
const TestERC1155 = artifacts.require("TestERC1155");
const TestERC20 = artifacts.require("TestERC20");

module.exports = function (deployer, network, accounts) {
  const protocolFeeAddress = accounts[0];
  const royaltyFeeAddresss = accounts[5];
  deployer.deploy(NiftyConnectTokenTransferProxy).then(async () => {

    await deployer.deploy(MerkleValidator);
    await deployer.deploy(RoyaltyRegisterHub);

    await deployer.deploy(NiftyConnectExchange,
        NiftyConnectTokenTransferProxy.address,
        protocolFeeAddress,
        MerkleValidator.address,
        RoyaltyRegisterHub.address);

    const NiftyConnectTokenTransferProxyInst = await NiftyConnectTokenTransferProxy.deployed();
    await NiftyConnectTokenTransferProxyInst.initialize(NiftyConnectExchange.address, {from: accounts[0]});

    await deployer.deploy(TestERC721, "CryptoKitty", "CryptoKitty");
    await deployer.deploy(TestERC1155, "ERC1155 Asset", "Test1155");
    await deployer.deploy(TestERC20, "Tether USD", "USDT", 18);

    const royaltyRegisterHubInst = await RoyaltyRegisterHub.deployed();
    await royaltyRegisterHubInst.setRoyaltyRateFromNFTOwners(TestERC721.address, 100, royaltyFeeAddresss, {from: accounts[0]}); // 1% Royalty
    await royaltyRegisterHubInst.setRoyaltyRate(TestERC1155.address, 100, royaltyFeeAddresss, {from: accounts[0]}); // 1% Royalty
  });
};
