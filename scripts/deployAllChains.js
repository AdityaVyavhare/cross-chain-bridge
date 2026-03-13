/**
 * Deploy ALL contracts to the current network and auto-update frontend.
 *
 * Usage:
 *   npx hardhat run scripts/deployAllChains.js --network sepolia
 *   npx hardhat run scripts/deployAllChains.js --network amoy
 *   npx hardhat run scripts/deployAllChains.js --network localhost
 *
 * Deploys: BridgeToken + the correct Bridge for the network.
 * Then writes addresses + ABIs into frontend/src/contracts/.
 */

const hre = require("hardhat");
const { exportAbis, saveAddresses } = require("./updateFrontend");

// Map hardhat network name → which bridge contract to deploy
const BRIDGE_FOR_NETWORK = {
  sepolia: "BridgeSepolia",
  hardhat: "BridgeSepolia", // local defaults to Sepolia-side
  localhost: "BridgeSepolia",
  amoy: "BridgeAmoy",
};

async function main() {
  const network = hre.network.name;
  const [deployer] = await hre.ethers.getSigners();

  console.log(`\n🚀 Deploying to "${network}" with ${deployer.address}\n`);

  // ── 1. Deploy BridgeToken ────────────────────────────────
  const BridgeToken = await hre.ethers.getContractFactory("BridgeToken");
  const token = await BridgeToken.deploy("Bridge Token", "BRT");
  await token.deployed();
  console.log(`  BridgeToken  → ${token.address}`);

  // ── 2. Deploy Bridge ─────────────────────────────────────
  const bridgeName = BRIDGE_FOR_NETWORK[network];
  if (!bridgeName) {
    throw new Error(
      `No bridge mapping for network "${network}". Add it to BRIDGE_FOR_NETWORK.`,
    );
  }

  const Bridge = await hre.ethers.getContractFactory(bridgeName);
  const bridge = await Bridge.deploy(token.address, deployer.address);
  await bridge.deployed();
  console.log(`  ${bridgeName} → ${bridge.address}`);

  // ── 3. Transfer token ownership to bridge ────────────────
  const tx = await token.transferOwnership(bridge.address);
  await tx.wait();
  console.log(`  Token ownership → ${bridge.address}`);

  // ── 4. Export ABIs ───────────────────────────────────────
  console.log("");
  exportAbis();

  // ── 5. Save addresses ────────────────────────────────────
  saveAddresses(network, {
    BridgeToken: token.address,
    [bridgeName]: bridge.address,
  });

  console.log(`\n✅ Done! Frontend updated for "${network}".\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
