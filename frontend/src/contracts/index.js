import addressesJson from "./addresses.json";

// Try to import ABIs — they may not exist until after first deploy
let BRTTokenAbi = [];
let MedicalRecordNFTAbi = [];
let ConsentManagerAbi = [];
let ValidatorManagerAbi = [];
let HealthcareBridgeAbi = [];

try {
  BRTTokenAbi = require("./abis/BRTToken.json");
} catch {}
try {
  MedicalRecordNFTAbi = require("./abis/MedicalRecordNFT.json");
} catch {}
try {
  ConsentManagerAbi = require("./abis/ConsentManager.json");
} catch {}
try {
  ValidatorManagerAbi = require("./abis/ValidatorManager.json");
} catch {}
try {
  HealthcareBridgeAbi = require("./abis/HealthcareBridge.json");
} catch {}

const addresses = addressesJson;

export function getAddress(network, contractName) {
  return addresses[network]?.[contractName] || "";
}

export { addresses };

export {
  BRTTokenAbi,
  MedicalRecordNFTAbi,
  ConsentManagerAbi,
  ValidatorManagerAbi,
  HealthcareBridgeAbi,
};
