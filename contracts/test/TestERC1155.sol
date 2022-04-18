pragma solidity 0.4.26;

import "../SafeMath.sol";
import "./IERC1155.sol";

// A sample implementation of core ERC1155 function.
contract ERC1155 is IERC1155 {
    using SafeMath for uint256;

    mapping (uint256 => mapping(address => uint256)) internal balances;

    mapping (address => mapping(address => bool)) internal operatorApproval;

    constructor() public {
    }

    function _mint(uint256 _id, uint256 _supply) internal {
        balances[_id][msg.sender] = balances[_id][msg.sender].add(_supply);

        emit TransferSingle(msg.sender, address(0x0), msg.sender, _id, _supply);
    }


    function safeTransferFrom(address _from, address _to, uint256 _id, uint256 _value, bytes _data) public {

        require(_to != address(0x0), "_to must be non-zero.");
        require(_from == msg.sender || operatorApproval[_from][msg.sender] == true, "Need operator approval for 3rd party transfers.");

        balances[_id][_from] = balances[_id][_from].sub(_value);
        balances[_id][_to]   = _value.add(balances[_id][_to]);

        emit TransferSingle(msg.sender, _from, _to, _id, _value);
    }

    function safeBatchTransferFrom(address _from, address _to, uint256[] _ids, uint256[] _values, bytes _data) public {
        require(_to != address(0x0), "destination address must be non-zero.");
        require(_ids.length == _values.length, "_ids and _values array lenght must match.");
        require(_from == msg.sender || operatorApproval[_from][msg.sender] == true, "Need operator approval for 3rd party transfers.");

        for (uint256 i = 0; i < _ids.length; ++i) {
            uint256 id = _ids[i];
            uint256 value = _values[i];

            balances[id][_from] = balances[id][_from].sub(value);
            balances[id][_to]   = value.add(balances[id][_to]);
        }

        emit TransferBatch(msg.sender, _from, _to, _ids, _values);
    }

    function balanceOf(address _owner, uint256 _id) public view returns (uint256) {
        return balances[_id][_owner];
    }

    function balanceOfBatch(address[] _owners, uint256[] _ids) public view returns (uint256[]) {

        require(_owners.length == _ids.length);

        uint256[] memory balances_ = new uint256[](_owners.length);

        for (uint256 i = 0; i < _owners.length; ++i) {
            balances_[i] = balances[_ids[i]][_owners[i]];
        }

        return balances_;
    }

    function setApprovalForAll(address _operator, bool _approved) public {
        operatorApproval[msg.sender][_operator] = _approved;
        emit ApprovalForAll(msg.sender, _operator, _approved);
    }

    function isApprovedForAll(address _owner, address _operator) public view returns (bool) {
        return operatorApproval[_owner][_operator];
    }
}

contract TestERC1155 is ERC1155 {
    string public name;
    string public symbol;

    constructor(string _name, string _symbol) public {
        name = _name;
        symbol = _symbol;
    }

    function mint(uint256 id, uint256 supply) public {
        _mint(id, supply);
    }
}