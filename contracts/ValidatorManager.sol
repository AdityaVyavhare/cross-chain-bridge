// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ValidatorManager
 * @notice Manages approved validators that can execute bridge transactions.
 */
contract ValidatorManager is Ownable {
    mapping(address => bool) public validators;
    uint256 public validatorCount;

    event ValidatorAdded(address indexed validator);
    event ValidatorRemoved(address indexed validator);

    constructor() Ownable(msg.sender) {}

    function addValidator(address validator) external onlyOwner {
        require(!validators[validator], "Already a validator");
        require(validator != address(0), "Zero address");
        validators[validator] = true;
        validatorCount++;
        emit ValidatorAdded(validator);
    }

    function removeValidator(address validator) external onlyOwner {
        require(validators[validator], "Not a validator");
        validators[validator] = false;
        validatorCount--;
        emit ValidatorRemoved(validator);
    }

    function isValidator(address validator) external view returns (bool) {
        return validators[validator];
    }
}
