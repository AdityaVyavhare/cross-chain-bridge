/**
 * Deploy ALL Healthcare Bridge contracts to Sepolia AND Amoy in one run.
 *
 * Uses the PRIVATE_KEY from .env (your MetaMask account).
 *
 * Usage:
 *   npx hardhat run scripts/deployAll.js
 */
const hre = require("hardhat");
const { ethers } = require("ethers");
const { exportAbis, saveAddresses } = require("./updateFrontend");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) {
  throw new Error("Set PRIVATE_KEY in .env (your MetaMask account private key)");
}

const NETWORKS = {
  sepolia: {
    name: "sepolia",
    rpc: process.env.SEPOLIA_RPC || "https://rpc.sepolia.org",
    chainId: 11155111,
    nativeToken: "ETH",
    nftStartTokenId: 1,        // Sepolia: token IDs 1–9999
  },
  amoy: {
    name: "amoy",
    rpc: process.env.AMOY_RPC || "https://rpc-amoy.polygon.technology",
    chainId: 80002,
    nativeToken: "POL",
    nftStartTokenId: 10000,    // Amoy: token IDs 10000+
  },
};

// Polygon Gas Station API — returns accurate gas prices for Amoy
// Alchemy's getFeeData() is broken (reports 1.5 gwei, network needs 25+)
const POLYGON_GAS_STATION_URL = "https://gasstation.polygon.technology/amoy";
const AMOY_FALLBACK_GAS = ethers.utils.parseUnits("30", "gwei");

async function fetchAmoyGas() {
  const https = require("https");
  return new Promise((resolve, reject) => {
    https.get(POLYGON_GAS_STATION_URL, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        const data = JSON.parse(body);
        const fast = data.fast || data.standard;
        const priorityFee = Math.ceil(fast.maxPriorityFee || 25);
        const maxFee = Math.ceil(fast.maxFee || 25);
        resolve({
          maxPriorityFeePerGas: ethers.utils.parseUnits(String(priorityFee), "gwei"),
          maxFeePerGas: ethers.utils.parseUnits(String(maxFee), "gwei"),
        });
      });
      res.on("error", reject);
    }).on("error", reject);
  });
}

async function getGasOverrides(provider, networkName) {
  if (networkName !== "amoy") return {};
  try {
    const gas = await fetchAmoyGas();
    console.log(`  Gas (from Polygon Gas Station):`);
    console.log(`    maxFeePerGas:         ${ethers.utils.formatUnits(gas.maxFeePerGas, "gwei")} gwei`);
    console.log(`    maxPriorityFeePerGas: ${ethers.utils.formatUnits(gas.maxPriorityFeePerGas, "gwei")} gwei\n`);
    return gas;
  } catch (e) {
    console.log(`  Gas Station API failed (${e.message}), using 30 gwei fallback\n`);
    return { maxFeePerGas: AMOY_FALLBACK_GAS, maxPriorityFeePerGas: AMOY_FALLBACK_GAS };
  }
}

// Read compiled artifact (ABI + bytecode)
function loadArtifact(contractName) {
  const artifactPath = path.resolve(
    __dirname,
    `../artifacts/contracts/${contractName}.sol/${contractName}.json`
  );
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Artifact not found: ${artifactPath}. Run "npx hardhat compile" first.`);
  }
  return JSON.parse(fs.readFileSync(artifactPath, "utf8"));
}

// Deploy a single contract
async function deployContract(wallet, contractName, args = [], gasOverrides = {}) {
  const artifact = loadArtifact(contractName);
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const contract = await factory.deploy(...args, gasOverrides);
  await contract.deployTransaction.wait();
  return contract;
}

// Deploy all 5 contracts + wire permissions on one network
async function deployToNetwork(networkConfig) {
  const { name, rpc, chainId, nativeToken, nftStartTokenId } = networkConfig;
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Deploying to ${name.toUpperCase()} (chainId: ${chainId})`);
  console.log(`${"=".repeat(60)}\n`);

  const provider = new ethers.providers.JsonRpcProvider(rpc);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const balance = await wallet.getBalance();

  console.log(`  Deployer:  ${wallet.address}`);
  console.log(`  Balance:   ${ethers.utils.formatEther(balance)} ${nativeToken}\n`);

  if (balance.eq(0)) {
    throw new Error(`No balance on ${name}. Fund ${wallet.address} with ${nativeToken} first.`);
  }

  // Get gas overrides (Amoy needs boosted gas price)
  const gasOverrides = await getGasOverrides(provider, name);

  // 1. BRTToken
  console.log("  [1/5] Deploying BRTToken...");
  const brt = await deployContract(wallet, "BRTToken", ["Bridge Token", "BRT"], gasOverrides);
  console.log(`         -> ${brt.address}`);

  // 2. MedicalRecordNFT
  console.log("  [2/5] Deploying MedicalRecordNFT...");
  const nft = await deployContract(wallet, "MedicalRecordNFT", [nftStartTokenId], gasOverrides);
  console.log(`         -> ${nft.address} (startTokenId: ${nftStartTokenId})`);

  // 3. ValidatorManager
  console.log("  [3/5] Deploying ValidatorManager...");
  const vm = await deployContract(wallet, "ValidatorManager", [], gasOverrides);
  console.log(`         -> ${vm.address}`);

  // Add deployer as first validator
  let tx = await vm.addValidator(wallet.address, gasOverrides);
  await tx.wait();
  console.log(`         -> Added deployer as validator`);

  // 4. ConsentManager
  console.log("  [4/5] Deploying ConsentManager...");
  const consent = await deployContract(wallet, "ConsentManager", [nft.address], gasOverrides);
  console.log(`         -> ${consent.address}`);

  // 5. HealthcareBridge
  console.log("  [5/5] Deploying HealthcareBridge...");
  const bridge = await deployContract(wallet, "HealthcareBridge", [
    brt.address,
    nft.address,
    vm.address,
  ], gasOverrides);
  console.log(`         -> ${bridge.address}`);

  // Wire permissions
  console.log("\n  Wiring permissions...");

  tx = await brt.setBridge(bridge.address, true, gasOverrides);
  await tx.wait();
  console.log("    -> BRTToken: authorized bridge for mint/burn");

  tx = await nft.setBridgeContract(bridge.address, gasOverrides);
  await tx.wait();
  console.log("    -> MedicalRecordNFT: bridge contract set");

  tx = await nft.setHospitalApproval(wallet.address, true, gasOverrides);
  await tx.wait();
  console.log("    -> MedicalRecordNFT: deployer approved as hospital");

  // Save addresses for this network
  saveAddresses(name, {
    BRTToken: brt.address,
    MedicalRecordNFT: nft.address,
    ValidatorManager: vm.address,
    ConsentManager: consent.address,
    HealthcareBridge: bridge.address,
  });

  console.log(`\n  ${name.toUpperCase()} deployment complete!\n`);

  return {
    BRTToken: brt.address,
    MedicalRecordNFT: nft.address,
    ValidatorManager: vm.address,
    ConsentManager: consent.address,
    HealthcareBridge: bridge.address,
  };
}

async function main() {
  // Compile first
  console.log("\nCompiling contracts...\n");
  await hre.run("compile");

  const wallet = new ethers.Wallet(PRIVATE_KEY);
  console.log(`\nDeployer (MetaMask account): ${wallet.address}`);

  // Export ABIs to frontend
  exportAbis();

  // Deploy to both networks (Amoy first, then Sepolia)
  const amoyAddresses = await deployToNetwork(NETWORKS.amoy);
  const sepoliaAddresses = await deployToNetwork(NETWORKS.sepolia);

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log("  DEPLOYMENT COMPLETE - ALL CONTRACTS LIVE");
  console.log(`${"=".repeat(60)}\n`);

  console.log("  SEPOLIA:");
  for (const [name, addr] of Object.entries(sepoliaAddresses)) {
    console.log(`    ${name.padEnd(20)} ${addr}`);
  }

  console.log("\n  AMOY:");
  for (const [name, addr] of Object.entries(amoyAddresses)) {
    console.log(`    ${name.padEnd(20)} ${addr}`);
  }

  console.log(`\n  Update .env with the new addresses if needed.`);
  console.log(`  Frontend addresses.json has been auto-updated.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
