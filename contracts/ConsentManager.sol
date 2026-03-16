// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ConsentManager
 * @notice Manages patient consent — which hospitals can view which records.
 *
 * Only the patient who owns a medical record NFT can grant/revoke access.
 */

interface IMedicalRecordNFT {
    function ownerOf(uint256 tokenId) external view returns (address);
}

contract ConsentManager {
    IMedicalRecordNFT public nftContract;

    /// @notice tokenId → hospital → hasAccess
    mapping(uint256 => mapping(address => bool)) private _access;

    /// @notice tokenId → list of hospitals with access
    mapping(uint256 => address[]) private _accessList;

    event AccessGranted(
        uint256 indexed tokenId,
        address indexed patient,
        address indexed hospital
    );
    event AccessRevoked(
        uint256 indexed tokenId,
        address indexed patient,
        address indexed hospital
    );

    constructor(address _nftContract) {
        nftContract = IMedicalRecordNFT(_nftContract);
    }

    modifier onlyPatient(uint256 tokenId) {
        require(nftContract.ownerOf(tokenId) == msg.sender, "Not record owner");
        _;
    }

    /// @notice Grant a hospital access to view a specific record
    function grantAccess(
        uint256 tokenId,
        address hospital
    ) external onlyPatient(tokenId) {
        require(!_access[tokenId][hospital], "Already granted");
        _access[tokenId][hospital] = true;
        _accessList[tokenId].push(hospital);
        emit AccessGranted(tokenId, msg.sender, hospital);
    }

    /// @notice Revoke a hospital's access to a specific record
    function revokeAccess(
        uint256 tokenId,
        address hospital
    ) external onlyPatient(tokenId) {
        require(_access[tokenId][hospital], "Not granted");
        _access[tokenId][hospital] = false;
        // Remove from list
        address[] storage list = _accessList[tokenId];
        for (uint256 i = 0; i < list.length; i++) {
            if (list[i] == hospital) {
                list[i] = list[list.length - 1];
                list.pop();
                break;
            }
        }
        emit AccessRevoked(tokenId, msg.sender, hospital);
    }

    /// @notice Check if a hospital has access to a record
    function checkAccess(
        uint256 tokenId,
        address hospital
    ) external view returns (bool) {
        return _access[tokenId][hospital];
    }

    /// @notice Get all hospitals with access to a record
    function getAccessList(
        uint256 tokenId
    ) external view returns (address[] memory) {
        return _accessList[tokenId];
    }
}
