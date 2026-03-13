const hre = require("hardhat");
require("dotenv").config();

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;

  console.log(`Running setup on ${network} with:`, deployer.address);

  let tokenAddress, bridgeAddress;

  if (
    network === "sepolia" ||
    network === "hardhat" ||
    network === "localhost"
  ) {
    tokenAddress = process.env.SEPOLIA_TOKEN;
    bridgeAddress = process.env.SEPOLIA_BRIDGE;
  } else if (network === "amoy") {
    tokenAddress = process.env.AMOY_TOKEN;
    bridgeAddress = process.env.AMOY_BRIDGE;
  } else {
    throw new Error("Unknown network: " + network);
  }

  if (!tokenAddress || !bridgeAddress) {
    throw new Error("Set token and bridge addresses in .env first");
  }

  const BridgeToken = await hre.ethers.getContractFactory("BridgeToken");
  const token = BridgeToken.attach(tokenAddress);

  // Transfer token ownership to bridge so it can mint/burn
  const tx = await token.transferOwnership(bridgeAddress);
  await tx.wait();

  console.log(`Token ownership transferred to bridge: ${bridgeAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
