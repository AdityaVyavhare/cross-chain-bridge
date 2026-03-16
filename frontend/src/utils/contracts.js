import { ethers } from "ethers";
import config from "../config";
import {
  BRTTokenAbi,
  HealthcareBridgeAbi,
  MedicalRecordNFTAbi,
  ConsentManagerAbi,
  ValidatorManagerAbi,
} from "../contracts";

// Polygon Gas Station API — returns accurate gas for Amoy (Alchemy RPC is broken, reports 1.5 gwei)
const POLYGON_GAS_STATION_URL = "https://gasstation.polygon.technology/amoy";
const AMOY_FALLBACK_GAS = ethers.utils.parseUnits("30", "gwei");

async function fetchAmoyGas() {
  const res = await fetch(POLYGON_GAS_STATION_URL);
  const data = await res.json();
  // Gas Station returns values in gwei (e.g. { fast: { maxPriorityFee: 25, maxFee: 25 } })
  const fast = data.fast || data.standard;
  const priorityFee = Math.ceil(fast.maxPriorityFee || 25);
  const maxFee = Math.ceil(fast.maxFee || 25);
  return {
    maxPriorityFeePerGas: ethers.utils.parseUnits(String(priorityFee), "gwei"),
    maxFeePerGas: ethers.utils.parseUnits(String(maxFee), "gwei"),
  };
}

export async function getGasOverrides(chainId) {
  if (chainId !== config.amoy.chainId) return {};
  try {
    return await fetchAmoyGas();
  } catch {
    // If Gas Station is down, use safe fallback (NOT the broken Alchemy estimate)
    return {
      maxFeePerGas: AMOY_FALLBACK_GAS,
      maxPriorityFeePerGas: AMOY_FALLBACK_GAS,
    };
  }
}

export function getNetworkConfig(chainId) {
  if (chainId === config.sepolia.chainId) return config.sepolia;
  if (chainId === config.amoy.chainId) return config.amoy;
  return null;
}

// ── Minimal fallback ABIs ─────────────────────────────────────
const TOKEN_ABI_FALLBACK = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)",
  "function transfer(address,uint256) returns (bool)",
  "function transferFrom(address,address,uint256) returns (bool)",
];

const BRIDGE_ABI_FALLBACK = [
  "function lockTokens(uint256)",
  "function burnTokens(uint256)",
  "function lockNFT(uint256,uint256)",
  "function burnMirrorNFT(uint256)",
  "function mintTokens(address,uint256,uint256,uint256,bytes)",
  "function unlockTokens(address,uint256,uint256,uint256,bytes)",
  "function mintMirrorNFT(address,uint256,uint256,uint256,string,string,address,uint256,bytes)",
  "function unlockNFT(address,uint256,uint256,uint256,bytes)",
  "function bridgeFee() view returns (uint256)",
  "function tokenNonce() view returns (uint256)",
  "function nftNonce() view returns (uint256)",
  "function tokenProcessed(uint256) view returns (bool)",
  "function nftProcessed(uint256) view returns (bool)",
  "event TokenLocked(address indexed user, uint256 amount, uint256 nonce)",
  "event TokenUnlocked(address indexed user, uint256 amount, uint256 nonce)",
  "event TokenMinted(address indexed user, uint256 amount, uint256 nonce)",
  "event TokenBurned(address indexed user, uint256 amount, uint256 nonce)",
  "event NFTLocked(address indexed patient, uint256 indexed tokenId, uint256 destinationChainId, uint256 nonce, string recordType, string encryptedCID, address hospital, uint256 originalChainId)",
  "event NFTUnlocked(address indexed patient, uint256 indexed tokenId, uint256 nonce)",
  "event NFTMinted(address indexed patient, uint256 indexed tokenId, uint256 nonce, string recordType, string encryptedCID, address hospital, uint256 originalChainId)",
  "event NFTBurned(address indexed patient, uint256 indexed tokenId, uint256 nonce)",
];

const NFT_ABI_FALLBACK = [
  "function mintRecord(address,string,string) returns (uint256)",
  "function getRecordMetadata(uint256) view returns (address,address,string,string,uint256,uint256)",
  "function getPatientTokens(address) view returns (uint256[])",
  "function ownerOf(uint256) view returns (address)",
  "function lockedForBridge(uint256) view returns (bool)",
  "function isMirror(uint256) view returns (bool)",
  "function nextTokenId() view returns (uint256)",
  "function approvedHospitals(address) view returns (bool)",
  "event RecordMinted(uint256 indexed tokenId, address indexed patient, address indexed hospital, string recordType, string encryptedCID)",
];

const CONSENT_ABI_FALLBACK = [
  "function grantAccess(uint256,address)",
  "function revokeAccess(uint256,address)",
  "function checkAccess(uint256,address) view returns (bool)",
  "function getAccessList(uint256) view returns (address[])",
];

const VALIDATOR_MGR_ABI_FALLBACK = [
  "function isValidator(address) view returns (bool)",
  "function validatorCount() view returns (uint256)",
];

function pickAbi(fullAbi, fallback) {
  return fullAbi && fullAbi.length > 0 ? fullAbi : fallback;
}

export function getTokenContract(networkConfig, signerOrProvider) {
  const addr = networkConfig.brtToken || networkConfig.token;
  if (!addr || !ethers.utils.isAddress(addr)) return null;
  return new ethers.Contract(
    addr,
    pickAbi(BRTTokenAbi, TOKEN_ABI_FALLBACK),
    signerOrProvider,
  );
}

export function getBridgeContract(networkConfig, signerOrProvider) {
  if (!networkConfig.bridge || !ethers.utils.isAddress(networkConfig.bridge))
    return null;
  return new ethers.Contract(
    networkConfig.bridge,
    pickAbi(HealthcareBridgeAbi, BRIDGE_ABI_FALLBACK),
    signerOrProvider,
  );
}

export function getNFTContract(networkConfig, signerOrProvider) {
  if (
    !networkConfig.medicalNFT ||
    !ethers.utils.isAddress(networkConfig.medicalNFT)
  )
    return null;
  return new ethers.Contract(
    networkConfig.medicalNFT,
    pickAbi(MedicalRecordNFTAbi, NFT_ABI_FALLBACK),
    signerOrProvider,
  );
}

export function getConsentContract(networkConfig, signerOrProvider) {
  if (
    !networkConfig.consentManager ||
    !ethers.utils.isAddress(networkConfig.consentManager)
  )
    return null;
  return new ethers.Contract(
    networkConfig.consentManager,
    pickAbi(ConsentManagerAbi, CONSENT_ABI_FALLBACK),
    signerOrProvider,
  );
}

export function getValidatorManagerContract(networkConfig, signerOrProvider) {
  if (
    !networkConfig.validatorManager ||
    !ethers.utils.isAddress(networkConfig.validatorManager)
  )
    return null;
  return new ethers.Contract(
    networkConfig.validatorManager,
    pickAbi(ValidatorManagerAbi, VALIDATOR_MGR_ABI_FALLBACK),
    signerOrProvider,
  );
}

export function isSepolia(chainId) {
  return chainId === config.sepolia.chainId;
}

export function isAmoy(chainId) {
  return chainId === config.amoy.chainId;
}

export function isSupportedNetwork(chainId) {
  return isSepolia(chainId) || isAmoy(chainId);
}

export function shortenAddress(addr) {
  if (!addr) return "";
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

export function formatAmount(wei) {
  try {
    return parseFloat(ethers.utils.formatUnits(wei, 18)).toFixed(4);
  } catch {
    return "0.0000";
  }
}
