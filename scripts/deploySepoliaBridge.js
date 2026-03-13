const hre = require("hardhat");
const { exportAbis, saveAddresses } = require("./updateFrontend");
require("dotenv").config();

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying BridgeSepolia with:", deployer.address);

  const tokenAddress = process.env.SEPOLIA_TOKEN;
  if (!tokenAddress) {
    throw new Error("Set SEPOLIA_TOKEN in .env first (deploy token first)");
  }

  const validator = deployer.address;

  const BridgeSepolia = await hre.ethers.getContractFactory("BridgeSepolia");
  const bridge = await BridgeSepolia.deploy(tokenAddress, validator);
  await bridge.deployed();

  console.log("BridgeSepolia deployed to:", bridge.address);
  console.log("Validator:", validator);

  // Auto-update frontend
  exportAbis();
  saveAddresses(hre.network.name, { BridgeSepolia: bridge.address });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
