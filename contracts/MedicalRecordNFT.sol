// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MedicalRecordNFT
 * @notice Soulbound-style ERC721 representing encrypted medical records.
 *
 * Each NFT stores metadata on-chain:
 *   - patient address
 *   - hospital address
 *   - record type (e.g. "X-Ray", "Blood Test")
 *   - encrypted IPFS CID
 *   - creation timestamp
 *   - original chain ID
 *
 * Transfers between wallets are DISABLED (soulbound) except via the
 * bridge contract (lock/unlock/mint/burn for cross-chain bridging).
 */
contract MedicalRecordNFT is ERC721, Ownable {
    // ── Types ───────────────────────────────────────────────
    struct RecordMetadata {
        address patient;
        address hospital;
        string recordType;
        string encryptedCID;
        uint256 timestamp;
        uint256 originalChainId;
    }

    // ── State ───────────────────────────────────────────────
    uint256 public nextTokenId;
    address public bridgeContract;

    /// @notice Approved hospitals that can mint records
    mapping(address => bool) public approvedHospitals;

    /// @notice Token ID → metadata
    mapping(uint256 => RecordMetadata) private _records;

    /// @notice Token ID → locked for bridge (non-transferable while locked)
    mapping(uint256 => bool) public lockedForBridge;

    /// @notice Whether a token is a mirror (minted by bridge on dest chain)
    mapping(uint256 => bool) public isMirror;

    /// @notice Patient address → array of owned token IDs
    mapping(address => uint256[]) private _patientTokens;

    // ── Events ──────────────────────────────────────────────
    event HospitalApproved(address indexed hospital, bool approved);
    event RecordMinted(
        uint256 indexed tokenId,
        address indexed patient,
        address indexed hospital,
        string recordType,
        string encryptedCID
    );
    event RecordLockedForBridge(
        uint256 indexed tokenId,
        uint256 destinationChainId
    );
    event RecordUnlocked(uint256 indexed tokenId);
    event MirrorMinted(
        uint256 indexed tokenId,
        address indexed patient,
        string encryptedCID
    );
    event MirrorBurned(uint256 indexed tokenId);
    event BridgeContractUpdated(address indexed bridge);

    // ── Constructor ─────────────────────────────────────────
    /// @param startTokenId Starting token ID (use different values per chain to avoid collision)
    constructor(uint256 startTokenId) ERC721("Medical Record NFT", "MRNFT") Ownable(msg.sender) {
        nextTokenId = startTokenId;
    }

    // ── Modifiers ───────────────────────────────────────────
    modifier onlyApprovedHospital() {
        require(approvedHospitals[msg.sender], "Not approved hospital");
        _;
    }

    modifier onlyBridge() {
        require(
            msg.sender == bridgeContract && bridgeContract != address(0),
            "Only bridge"
        );
        _;
    }

    modifier onlyPatientOf(uint256 tokenId) {
        require(ownerOf(tokenId) == msg.sender, "Not record owner");
        _;
    }

    // ── Admin ───────────────────────────────────────────────

    function setBridgeContract(address _bridge) external onlyOwner {
        bridgeContract = _bridge;
        emit BridgeContractUpdated(_bridge);
    }

    function setHospitalApproval(
        address hospital,
        bool approved
    ) external onlyOwner {
        approvedHospitals[hospital] = approved;
        emit HospitalApproved(hospital, approved);
    }

    // ── Hospital Minting ────────────────────────────────────

    /// @notice Hospital mints a medical record NFT to a patient
    function mintRecord(
        address patient,
        string calldata recordType,
        string calldata encryptedCID
    ) external onlyApprovedHospital returns (uint256) {
        // Skip token IDs already occupied by mirror NFTs from bridging
        while (_ownerOf(nextTokenId) != address(0)) {
            nextTokenId++;
        }
        uint256 tokenId = nextTokenId++;

        _records[tokenId] = RecordMetadata({
            patient: patient,
            hospital: msg.sender,
            recordType: recordType,
            encryptedCID: encryptedCID,
            timestamp: block.timestamp,
            originalChainId: block.chainid
        });

        _safeMint(patient, tokenId);
        _patientTokens[patient].push(tokenId);

        emit RecordMinted(
            tokenId,
            patient,
            msg.sender,
            recordType,
            encryptedCID
        );
        return tokenId;
    }

    // ── Bridge Operations ───────────────────────────────────

    /// @notice Lock NFT for cross-chain bridging (patient or bridge calls)
    function lockForBridge(
        uint256 tokenId,
        uint256 destinationChainId
    ) external {
        // Allow the patient directly, or the bridge (which already verified ownership)
        require(
            ownerOf(tokenId) == msg.sender || msg.sender == bridgeContract,
            "Not authorized"
        );
        require(!lockedForBridge[tokenId], "Already locked");
        lockedForBridge[tokenId] = true;
        emit RecordLockedForBridge(tokenId, destinationChainId);
    }

    /// @notice Unlock original NFT after reverse bridge (bridge calls)
    function unlockRecord(uint256 tokenId) external onlyBridge {
        require(lockedForBridge[tokenId], "Not locked");
        lockedForBridge[tokenId] = false;
        emit RecordUnlocked(tokenId);
    }

    /// @notice Mint a mirror NFT on destination chain (bridge calls)
    function mintMirror(
        address patient,
        uint256 tokenId,
        string calldata recordType,
        string calldata encryptedCID,
        address hospital,
        uint256 originalChainId
    ) external onlyBridge {
        _records[tokenId] = RecordMetadata({
            patient: patient,
            hospital: hospital,
            recordType: recordType,
            encryptedCID: encryptedCID,
            timestamp: block.timestamp,
            originalChainId: originalChainId
        });

        _safeMint(patient, tokenId);
        isMirror[tokenId] = true;
        _patientTokens[patient].push(tokenId);

        // Keep nextTokenId ahead of any mirror IDs to avoid collision
        if (tokenId >= nextTokenId) {
            nextTokenId = tokenId + 1;
        }

        emit MirrorMinted(tokenId, patient, encryptedCID);
    }

    /// @notice Burn a mirror NFT for reverse bridge (bridge calls)
    function burnMirror(uint256 tokenId) external onlyBridge {
        require(isMirror[tokenId], "Not a mirror NFT");
        address patient = ownerOf(tokenId);
        _burn(tokenId);
        isMirror[tokenId] = false;
        _removePatientToken(patient, tokenId);
        emit MirrorBurned(tokenId);
    }

    // ── View Functions ──────────────────────────────────────

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
        )
    {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        RecordMetadata storage r = _records[tokenId];
        return (
            r.patient,
            r.hospital,
            r.recordType,
            r.encryptedCID,
            r.timestamp,
            r.originalChainId
        );
    }

    function getPatientTokens(
        address patient
    ) external view returns (uint256[] memory) {
        return _patientTokens[patient];
    }

    // ── Soulbound: Disable normal transfers ─────────────────
    // Transfers only allowed when:
    //  1. Minting (from == address(0))
    //  2. Burning (to == address(0))
    //  All other transfers are blocked (soulbound).

    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        address from = _ownerOf(tokenId);

        // Allow minting
        if (from == address(0)) {
            return super._update(to, tokenId, auth);
        }
        // Allow burning
        if (to == address(0)) {
            return super._update(to, tokenId, auth);
        }
        // Block all other transfers (soulbound)
        revert("Soulbound: transfers disabled");
    }

    // ── Internal ────────────────────────────────────────────

    function _removePatientToken(address patient, uint256 tokenId) internal {
        uint256[] storage tokens = _patientTokens[patient];
        for (uint256 i = 0; i < tokens.length; i++) {
            if (tokens[i] == tokenId) {
                tokens[i] = tokens[tokens.length - 1];
                tokens.pop();
                break;
            }
        }
    }
}
