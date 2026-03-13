const hre = require("hardhat");
const { exportAbis, saveAddresses } = require("./updateFrontend");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying BridgeToken with:", deployer.address);

  const BridgeToken = await hre.ethers.getContractFactory("BridgeToken");
  const token = await BridgeToken.deploy("Bridge Token", "BRT");
  await token.deployed();

  console.log("BridgeToken deployed to:", token.address);

  // Auto-update frontend
  exportAbis();
  saveAddresses(hre.network.name, { BridgeToken: token.address });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
