// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

interface IBridgeToken {
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool);

    function transfer(address to, uint256 amount) external returns (bool);
}

contract BridgeSepolia is Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    IBridgeToken public token;
    address public validator;
    uint256 public nonce;

    mapping(uint256 => bool) public processed;

    event TokensLocked(address user, uint256 amount, uint256 nonce);
    event TokensUnlocked(address user, uint256 amount, uint256 nonce);

    constructor(address _token, address _validator) Ownable(msg.sender) {
        token = IBridgeToken(_token);
        validator = _validator;
    }

    /// @notice Lock tokens on Sepolia (user calls this to bridge to Amoy)
    function lock(uint256 amount) external {
        token.transferFrom(msg.sender, address(this), amount);
        emit TokensLocked(msg.sender, amount, nonce);
        nonce++;
    }

    /// @notice Unlock tokens on Sepolia (validator relays from Amoy burn)
    function unlock(
        address user,
        uint256 amount,
        uint256 _nonce,
        uint256 sourceChainId,
        bytes calldata signature
    ) external {
        require(!processed[_nonce], "Already processed");

        bytes32 messageHash = keccak256(
            abi.encodePacked(user, amount, _nonce, sourceChainId)
        );
        bytes32 ethSignedHash = messageHash.toEthSignedMessageHash();

        require(
            ethSignedHash.recover(signature) == validator,
            "Invalid signature"
        );

        processed[_nonce] = true;
        token.transfer(user, amount);
        emit TokensUnlocked(user, amount, _nonce);
    }

    function setValidator(address _validator) external onlyOwner {
        validator = _validator;
    }
}
