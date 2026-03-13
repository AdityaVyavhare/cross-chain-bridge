const hre = require("hardhat");
const { exportAbis, saveAddresses } = require("./updateFrontend");
require("dotenv").config();

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying BridgeAmoy with:", deployer.address);

  const tokenAddress = process.env.AMOY_TOKEN;
  if (!tokenAddress) {
    throw new Error("Set AMOY_TOKEN in .env first (deploy token first)");
  }

  const validator = deployer.address;

  const BridgeAmoy = await hre.ethers.getContractFactory("BridgeAmoy");
  const bridge = await BridgeAmoy.deploy(tokenAddress, validator);
  await bridge.deployed();

  console.log("BridgeAmoy deployed to:", bridge.address);
  console.log("Validator:", validator);

  // Auto-update frontend
  exportAbis();
  saveAddresses(hre.network.name, { BridgeAmoy: bridge.address });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
