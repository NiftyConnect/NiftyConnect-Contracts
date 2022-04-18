// Contracts are compiled without optimization
// and with gas estimation distortion
// https://github.com/sc-forks/solidity-coverage/blob/master/HARDHAT_README.md#usage

module.exports = {
    measureStatementCoverage: true,
    measureFunctionCoverage: true,
    providerOptions: {
        total_accounts: 100,
        mnemonic: "miss eight laundry magnet country gospel cruise flavor pledge street patient catch"
    }
};