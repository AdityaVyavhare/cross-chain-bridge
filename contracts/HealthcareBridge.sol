// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title HealthcareBridge
 * @notice Cross-chain bridge supporting both BRT token and Medical NFT bridging.
 *
 * Token bridge: lock/unlock on origin chain, mint/burn on destination chain.
 * NFT bridge:   lock on origin → mint mirror on dest; burn mirror → unlock origin.
 *
 * Validator signatures prevent unauthorized minting/unlocking.
 * Nonce-based replay protection is applied separately for tokens and NFTs.
 */

interface IBRTToken {
    function mint(address to, uint256 amount) external;

    function burn(address from, uint256 amount) external;

    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool);

    function transfer(address to, uint256 amount) external returns (bool);

    function balanceOf(address account) external view returns (uint256);
}

interface IMedicalNFT {
    function lockForBridge(
        uint256 tokenId,
        uint256 destinationChainId
    ) external;

    function unlockRecord(uint256 tokenId) external;

    function mintMirror(
        address patient,
        uint256 tokenId,
        string calldata recordType,
        string calldata encryptedCID,
        address hospital,
        uint256 originalChainId
    ) external;

    function burnMirror(uint256 tokenId) external;

    function ownerOf(uint256 tokenId) external view returns (address);

    function getRecordMetadata(
        uint256 tokenId
    )
        external
        view
        returns (
            address patient,
            address hospital,
            string memory recordType,
            string memory encryptedCID,
            uint256 timestamp,
            uint256 originalChainId
        );
}

interface IValidatorManager {
    function isValidator(address validator) external view returns (bool);
}

contract HealthcareBridge is Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // ── State ───────────────────────────────────────────────
    IBRTToken public brtToken;
    IMedicalNFT public nftContract;
    IValidatorManager public validatorManager;

    /// @notice Bridge fee in BRT tokens (paid by user on bridge initiation)
    uint256 public bridgeFee;

    /// @notice Reward for validator per relay
    uint256 public validatorReward;

    // Token bridge nonces
    uint256 public tokenNonce;
    mapping(uint256 => bool) public tokenProcessed;

    // NFT bridge nonces
    uint256 public nftNonce;
    mapping(uint256 => bool) public nftProcessed;

    // ── Events ──────────────────────────────────────────────

    // Token events
    event TokenLocked(address indexed user, uint256 amount, uint256 nonce);
    event TokenUnlocked(address indexed user, uint256 amount, uint256 nonce);
    event TokenMinted(address indexed user, uint256 amount, uint256 nonce);
    event TokenBurned(address indexed user, uint256 amount, uint256 nonce);

    // NFT events
    event NFTLocked(
        address indexed patient,
        uint256 indexed tokenId,
        uint256 destinationChainId,
        uint256 nonce,
        string recordType,
        string encryptedCID,
        address hospital,
        uint256 originalChainId
    );
    event NFTUnlocked(
        address indexed patient,
        uint256 indexed tokenId,
        uint256 nonce
    );
    event NFTMinted(
        address indexed patient,
        uint256 indexed tokenId,
        uint256 nonce,
        string recordType,
        string encryptedCID,
        address hospital,
        uint256 originalChainId
    );
    event NFTBurned(
        address indexed patient,
        uint256 indexed tokenId,
        uint256 nonce
    );

    // Fee events
    event ValidatorRewarded(address indexed validator, uint256 amount);
    event BridgeFeeUpdated(uint256 newFee);
    event ValidatorRewardUpdated(uint256 newReward);

    // ── Constructor ─────────────────────────────────────────
    constructor(
        address _brtToken,
        address _nftContract,
        address _validatorManager
    ) Ownable(msg.sender) {
        brtToken = IBRTToken(_brtToken);
        nftContract = IMedicalNFT(_nftContract);
        validatorManager = IValidatorManager(_validatorManager);
        bridgeFee = 1 * 10 ** 18; // 1 BRT default fee
        validatorReward = 0.5 * 10 ** 18; // 0.5 BRT default reward
    }

    // ── Admin ───────────────────────────────────────────────

    function setBridgeFee(uint256 _fee) external onlyOwner {
        bridgeFee = _fee;
        emit BridgeFeeUpdated(_fee);
    }

    function setValidatorReward(uint256 _reward) external onlyOwner {
        validatorReward = _reward;
        emit ValidatorRewardUpdated(_reward);
    }

    function setContracts(
        address _brtToken,
        address _nftContract,
        address _validatorManager
    ) external onlyOwner {
        if (_brtToken != address(0)) brtToken = IBRTToken(_brtToken);
        if (_nftContract != address(0)) nftContract = IMedicalNFT(_nftContract);
        if (_validatorManager != address(0))
            validatorManager = IValidatorManager(_validatorManager);
    }

    // ═══════════════════════════════════════════════════════
    //  TOKEN BRIDGE
    // ═══════════════════════════════════════════════════════

    /// @notice Lock BRT tokens on source chain to bridge
    function lockTokens(uint256 amount) external {
        require(amount > 0, "Zero amount");

        // Collect bridge fee
        if (bridgeFee > 0) {
            brtToken.transferFrom(msg.sender, address(this), bridgeFee);
        }

        // Lock tokens
        brtToken.transferFrom(msg.sender, address(this), amount);

        emit TokenLocked(msg.sender, amount, tokenNonce);
        tokenNonce++;
    }

    /// @notice Unlock BRT tokens on source chain (validator relays from burn)
    function unlockTokens(
        address user,
        uint256 amount,
        uint256 _nonce,
        uint256 sourceChainId,
        bytes calldata signature
    ) external {
        require(!tokenProcessed[_nonce], "Already processed");
        _verifySignature(
            keccak256(
                abi.encodePacked("TOKEN", user, amount, _nonce, sourceChainId)
            ),
            signature
        );

        tokenProcessed[_nonce] = true;
        brtToken.transfer(user, amount);
        _rewardValidator(msg.sender);

        emit TokenUnlocked(user, amount, _nonce);
    }

    /// @notice Mint wrapped BRT tokens on destination chain (validator relays from lock)
    function mintTokens(
        address user,
        uint256 amount,
        uint256 _nonce,
        uint256 sourceChainId,
        bytes calldata signature
    ) external {
        require(!tokenProcessed[_nonce], "Already processed");
        _verifySignature(
            keccak256(
                abi.encodePacked("TOKEN", user, amount, _nonce, sourceChainId)
            ),
            signature
        );

        tokenProcessed[_nonce] = true;
        brtToken.mint(user, amount);
        _rewardValidator(msg.sender);

        emit TokenMinted(user, amount, _nonce);
    }

    /// @notice Burn wrapped BRT tokens on destination chain to bridge back
    function burnTokens(uint256 amount) external {
        require(amount > 0, "Zero amount");

        // Collect bridge fee
        if (bridgeFee > 0) {
            brtToken.transferFrom(msg.sender, address(this), bridgeFee);
        }

        brtToken.burn(msg.sender, amount);

        emit TokenBurned(msg.sender, amount, tokenNonce);
        tokenNonce++;
    }

    // ═══════════════════════════════════════════════════════
    //  NFT BRIDGE
    // ═══════════════════════════════════════════════════════

    /// @notice Lock NFT on source chain for cross-chain bridging
    function lockNFT(uint256 tokenId, uint256 destinationChainId) external {
        require(nftContract.ownerOf(tokenId) == msg.sender, "Not NFT owner");

        // Collect bridge fee
        if (bridgeFee > 0) {
            brtToken.transferFrom(msg.sender, address(this), bridgeFee);
        }

        // Lock via NFT contract
        nftContract.lockForBridge(tokenId, destinationChainId);

        // Retrieve metadata to emit in event
        (
            address patient,
            address hospital,
            string memory recordType,
            string memory encryptedCID,
            ,
            uint256 originalChainId
        ) = nftContract.getRecordMetadata(tokenId);

        emit NFTLocked(
            patient,
            tokenId,
            destinationChainId,
            nftNonce,
            recordType,
            encryptedCID,
            hospital,
            originalChainId
        );
        nftNonce++;
    }

    /// @notice Mint mirror NFT on destination chain (validator relays from lock)
    function mintMirrorNFT(
        address patient,
        uint256 tokenId,
        uint256 _nonce,
        uint256 sourceChainId,
        string calldata recordType,
        string calldata encryptedCID,
        address hospital,
        uint256 originalChainId,
        bytes calldata signature
    ) external {
        require(!nftProcessed[_nonce], "Already processed");
        _verifySignature(
            keccak256(
                abi.encodePacked("NFT", patient, tokenId, _nonce, sourceChainId)
            ),
            signature
        );

        nftProcessed[_nonce] = true;
        nftContract.mintMirror(
            patient,
            tokenId,
            recordType,
            encryptedCID,
            hospital,
            originalChainId
        );
        _rewardValidator(msg.sender);

        emit NFTMinted(
            patient,
            tokenId,
            _nonce,
            recordType,
            encryptedCID,
            hospital,
            originalChainId
        );
    }

    /// @notice Burn mirror NFT to bridge back to source chain
    function burnMirrorNFT(uint256 tokenId) external {
        require(nftContract.ownerOf(tokenId) == msg.sender, "Not NFT owner");

        // Collect bridge fee
        if (bridgeFee > 0) {
            brtToken.transferFrom(msg.sender, address(this), bridgeFee);
        }

        // Retrieve patient before burn
        (address patient, , , , , ) = nftContract.getRecordMetadata(tokenId);

        nftContract.burnMirror(tokenId);

        emit NFTBurned(patient, tokenId, nftNonce);
        nftNonce++;
    }

    /// @notice Unlock original NFT on source chain (validator relays from mirror burn)
    function unlockNFT(
        address patient,
        uint256 tokenId,
        uint256 _nonce,
        uint256 sourceChainId,
        bytes calldata signature
    ) external {
        require(!nftProcessed[_nonce], "Already processed");
        _verifySignature(
            keccak256(
                abi.encodePacked("NFT", patient, tokenId, _nonce, sourceChainId)
            ),
            signature
        );

        nftProcessed[_nonce] = true;
        nftContract.unlockRecord(tokenId);
        _rewardValidator(msg.sender);

        emit NFTUnlocked(patient, tokenId, _nonce);
    }

    // ═══════════════════════════════════════════════════════
    //  INTERNAL HELPERS
    // ═══════════════════════════════════════════════════════

    function _verifySignature(
        bytes32 messageHash,
        bytes calldata signature
    ) internal view {
        bytes32 ethSignedHash = messageHash.toEthSignedMessageHash();
        address recovered = ethSignedHash.recover(signature);
        require(
            validatorManager.isValidator(recovered),
            "Invalid validator signature"
        );
    }

    function _rewardValidator(address validator) internal {
        if (validatorReward > 0) {
            // Mint reward to validator
            try brtToken.mint(validator, validatorReward) {
                emit ValidatorRewarded(validator, validatorReward);
            } catch {
                // Skip reward if mint fails (e.g. bridge not authorized)
            }
        }
    }
}
