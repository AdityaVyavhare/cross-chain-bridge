// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

interface IBridgeToken {
    function mint(address to, uint256 amount) external;

    function burn(address from, uint256 amount) external;

    function balanceOf(address account) external view returns (uint256);
}

contract BridgeAmoy is Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    IBridgeToken public token;
    address public validator;
    uint256 public nonce;

    mapping(uint256 => bool) public processed;

    event TokensBurned(address user, uint256 amount, uint256 nonce);
    event TokensMinted(address user, uint256 amount, uint256 nonce);

    constructor(address _token, address _validator) Ownable(msg.sender) {
        token = IBridgeToken(_token);
        validator = _validator;
    }

    /// @notice Burn tokens on Amoy (user calls this to bridge back to Sepolia)
    function burn(uint256 amount) external {
        token.burn(msg.sender, amount);
        emit TokensBurned(msg.sender, amount, nonce);
        nonce++;
    }

    /// @notice Mint tokens on Amoy (validator relays from Sepolia lock)
    function mint(
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
        token.mint(user, amount);
        emit TokensMinted(user, amount, _nonce);
    }

    function setValidator(address _validator) external onlyOwner {
        validator = _validator;
    }
}
