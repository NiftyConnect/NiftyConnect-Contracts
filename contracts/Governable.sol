pragma solidity 0.4.26;

contract Governable {
    address public governor;
    address public pendingGovernor;

    event GovernanceTransferred(
        address indexed previousGovernor,
        address indexed newGovernor
    );
    event NewPendingGovernor(address indexed newPendingGovernor);


    /**
     * @dev The Governable constructor sets the original `governor` of the contract to the sender
     * account.
     */
    constructor() public {
        governor = msg.sender;
    }

    /**
     * @dev Throws if called by any account other than the governor.
     */
    modifier onlyGovernor() {
        require(msg.sender == governor);
        _;
    }

    function acceptGovernance() external {
        require(msg.sender == pendingGovernor, "acceptGovernance: Call must come from pendingGovernor.");
        address previousGovernor = governor;
        governor = msg.sender;
        pendingGovernor = address(0);

        emit GovernanceTransferred(previousGovernor, governor);
    }

    function setPendingGovernor(address pendingGovernor_) external {
        require(msg.sender == governor, "setPendingGovernor: Call must come from governor.");
        pendingGovernor = pendingGovernor_;

        emit NewPendingGovernor(pendingGovernor);
    }
}