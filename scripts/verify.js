const hre = require("hardhat");
require("dotenv").config();

async function main() {
  const network = hre.network.name;

  let tokenAddress, bridgeAddress, bridgeContractName;

  if (network === "sepolia") {
    tokenAddress = process.env.SEPOLIA_TOKEN;
    bridgeAddress = process.env.SEPOLIA_BRIDGE;
    bridgeContractName = "BridgeSepolia";
  } else if (network === "amoy") {
    tokenAddress = process.env.AMOY_TOKEN;
    bridgeAddress = process.env.AMOY_BRIDGE;
    bridgeContractName = "BridgeAmoy";
  } else {
    throw new Error("Run on sepolia or amoy network");
  }

  // Verify token
  if (tokenAddress) {
    console.log(`Verifying BridgeToken at ${tokenAddress}...`);
    try {
      await hre.run("verify:verify", {
        address: tokenAddress,
        constructorArguments: ["Bridge Token", "BRT"],
      });
      console.log("BridgeToken verified!");
    } catch (e) {
      console.log("Token verification error:", e.message);
    }
  }

  // Verify bridge
  if (bridgeAddress) {
    const [deployer] = await hre.ethers.getSigners();
    console.log(`Verifying ${bridgeContractName} at ${bridgeAddress}...`);
    try {
      await hre.run("verify:verify", {
        address: bridgeAddress,
        constructorArguments: [tokenAddress, deployer.address],
      });
      console.log(`${bridgeContractName} verified!`);
    } catch (e) {
      console.log("Bridge verification error:", e.message);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
