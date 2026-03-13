import { ethers } from "ethers";
import config from "../config";
import { BridgeTokenAbi, BridgeSepoliaAbi, BridgeAmoyAbi } from "../contracts";

export function getNetworkConfig(chainId) {
  if (chainId === config.sepolia.chainId) return config.sepolia;
  if (chainId === config.amoy.chainId) return config.amoy;
  if (chainId === config.localhost.chainId) return config.localhost;
  return null;
}

export function getTokenContract(networkConfig, signerOrProvider) {
  if (!networkConfig.token || !ethers.utils.isAddress(networkConfig.token)) {
    console.error(
      "Invalid token address for",
      networkConfig.name,
      ":",
      networkConfig.token,
    );
    return null;
  }
  // Use full ABI from artifacts when available, else minimal fallback
  const abi =
    BridgeTokenAbi.length > 0
      ? BridgeTokenAbi
      : [
          "function balanceOf(address) view returns (uint256)",
          "function approve(address,uint256) returns (bool)",
          "function allowance(address,address) view returns (uint256)",
        ];
  return new ethers.Contract(networkConfig.token, abi, signerOrProvider);
}

export function getBridgeContract(networkConfig, signerOrProvider) {
  const onSepolia =
    networkConfig.chainId === config.sepolia.chainId ||
    networkConfig.chainId === config.localhost.chainId;
  const abi = onSepolia
    ? BridgeSepoliaAbi.length > 0
      ? BridgeSepoliaAbi
      : [
          "function lock(uint256)",
          "function unlock(address,uint256,uint256,uint256,bytes)",
        ]
    : BridgeAmoyAbi.length > 0
    ? BridgeAmoyAbi
    : [
        "function burn(uint256)",
        "function mint(address,uint256,uint256,uint256,bytes)",
      ];
  return new ethers.Contract(networkConfig.bridge, abi, signerOrProvider);
}

export function isSepolia(chainId) {
  return chainId === config.sepolia.chainId;
}

export function isAmoy(chainId) {
  return chainId === config.amoy.chainId;
}

export function isLocalhost(chainId) {
  return chainId === config.localhost.chainId;
}

export function isSupportedNetwork(chainId) {
  return isSepolia(chainId) || isAmoy(chainId) || isLocalhost(chainId);
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
