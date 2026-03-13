// Network configuration + deployed addresses (auto-populated by deploy scripts)
import { addresses } from "./contracts";

const config = {
  sepolia: {
    chainId: 11155111,
    chainIdHex: "0xaa36a7",
    name: "Sepolia",
    networkKey: "sepolia",
    rpc: process.env.REACT_APP_SEPOLIA_RPC || "https://rpc.sepolia.org",
    token:
      addresses.sepolia?.BridgeToken ||
      process.env.REACT_APP_SEPOLIA_TOKEN ||
      "",
    bridge:
      addresses.sepolia?.BridgeSepolia ||
      process.env.REACT_APP_SEPOLIA_BRIDGE ||
      "",
    explorer: "https://sepolia.etherscan.io",
  },
  amoy: {
    chainId: 80002,
    chainIdHex: "0x13882",
    name: "Polygon Amoy",
    networkKey: "amoy",
    rpc:
      process.env.REACT_APP_AMOY_RPC || "https://rpc-amoy.polygon.technology",
    token:
      addresses.amoy?.BridgeToken || process.env.REACT_APP_AMOY_TOKEN || "",
    bridge:
      addresses.amoy?.BridgeAmoy || process.env.REACT_APP_AMOY_BRIDGE || "",
    explorer: "https://amoy.polygonscan.com",
  },
  localhost: {
    chainId: 31337,
    chainIdHex: "0x7a69",
    name: "Localhost",
    networkKey: "localhost",
    rpc: "http://127.0.0.1:8545",
    token: addresses.localhost?.BridgeToken || "",
    bridge: addresses.localhost?.BridgeSepolia || "",
    explorer: "",
  },
  pinata: {
    apiKey: process.env.REACT_APP_PINATA_API_KEY || "",
    secret: process.env.REACT_APP_PINATA_SECRET || "",
    gateway: "https://gateway.pinata.cloud/ipfs/",
  },
};

// Warn at startup if no addresses found anywhere
if (!config.sepolia.token && !config.amoy.token && !config.localhost.token) {
  console.warn(
    "[Bridge Config] No contract addresses found!\n" +
      "Run: npx hardhat run scripts/deployAllChains.js --network <network>\n" +
      "This auto-generates frontend/src/contracts/addresses.json",
  );
}

export default config;
