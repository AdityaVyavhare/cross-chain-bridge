import { addresses } from "./contracts";

const config = {
  sepolia: {
    chainId: 11155111,
    chainIdHex: "0xaa36a7",
    name: "Sepolia",
    networkKey: "sepolia",
    rpc: process.env.REACT_APP_SEPOLIA_RPC || "https://rpc.sepolia.org",
    brtToken:
      addresses.sepolia?.BRTToken || process.env.REACT_APP_SEPOLIA_BRT || "",
    medicalNFT: addresses.sepolia?.MedicalRecordNFT || "",
    bridge:
      addresses.sepolia?.HealthcareBridge ||
      process.env.REACT_APP_SEPOLIA_BRIDGE ||
      "",
    consentManager: addresses.sepolia?.ConsentManager || "",
    validatorManager: addresses.sepolia?.ValidatorManager || "",
    token:
      addresses.sepolia?.BRTToken || process.env.REACT_APP_SEPOLIA_TOKEN || "",
    explorer: "https://sepolia.etherscan.io",
  },
  amoy: {
    chainId: 80002,
    chainIdHex: "0x13882",
    name: "Polygon Amoy",
    networkKey: "amoy",
    rpc:
      process.env.REACT_APP_AMOY_RPC || "https://rpc-amoy.polygon.technology",
    brtToken: addresses.amoy?.BRTToken || process.env.REACT_APP_AMOY_BRT || "",
    medicalNFT: addresses.amoy?.MedicalRecordNFT || "",
    bridge:
      addresses.amoy?.HealthcareBridge ||
      process.env.REACT_APP_AMOY_BRIDGE ||
      "",
    consentManager: addresses.amoy?.ConsentManager || "",
    validatorManager: addresses.amoy?.ValidatorManager || "",
    token: addresses.amoy?.BRTToken || process.env.REACT_APP_AMOY_TOKEN || "",
    explorer: "https://amoy.polygonscan.com",
  },
  pinata: {
    apiKey: process.env.REACT_APP_PINATA_API_KEY || "",
    secret: process.env.REACT_APP_PINATA_SECRET || "",
    gateway: "https://gateway.pinata.cloud/ipfs/",
  },
};

export default config;
