/**
 * Post-deployment script: updates frontend with deployed addresses + ABIs.
 *
 * Usage (called automatically by deployAllChains.js, or manually):
 *   npx hardhat run scripts/updateFrontend.js
 *
 * What it does:
 *   1. Reads compiled artifacts for all healthcare bridge contracts
 *   2. Extracts the ABI from each and writes to frontend/src/contracts/abis/
 *   3. Merges new addresses into frontend/src/contracts/addresses.json (per network)
 */

const fs = require("fs");
const path = require("path");

// ── Paths ──────────────────────────────────────────────────
const FRONTEND_CONTRACTS = path.resolve(__dirname, "../frontend/src/contracts");
const ABIS_DIR = path.resolve(FRONTEND_CONTRACTS, "abis");
const ADDRESSES_FILE = path.resolve(FRONTEND_CONTRACTS, "addresses.json");
const ARTIFACTS_DIR = path.resolve(__dirname, "../artifacts/contracts");

// Contracts we care about
const CONTRACTS = [
  "BRTToken",
  "MedicalRecordNFT",
  "ConsentManager",
  "ValidatorManager",
  "HealthcareBridge",
];

// ── Helpers ────────────────────────────────────────────────
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readJSON(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

// ── Export ABIs ────────────────────────────────────────────
function exportAbis() {
  ensureDir(ABIS_DIR);

  for (const name of CONTRACTS) {
    const artifactPath = path.join(
      ARTIFACTS_DIR,
      `${name}.sol`,
      `${name}.json`,
    );
    if (!fs.existsSync(artifactPath)) {
      console.warn(`  ⚠  Artifact not found: ${artifactPath} (compile first)`);
      continue;
    }
    const artifact = readJSON(artifactPath);
    const abiFile = path.join(ABIS_DIR, `${name}.json`);
    writeJSON(abiFile, artifact.abi);
    console.log(`  ✔ ABI  ${name} → frontend/src/contracts/abis/${name}.json`);
  }
}

// ── Save addresses ─────────────────────────────────────────
// addressMap example: { BridgeToken: "0x...", BridgeSepolia: "0x..." }
function saveAddresses(networkName, addressMap) {
  ensureDir(FRONTEND_CONTRACTS);

  const existing = readJSON(ADDRESSES_FILE);
  existing[networkName] = {
    ...(existing[networkName] || {}),
    ...addressMap,
  };
  writeJSON(ADDRESSES_FILE, existing);
  console.log(`  ✔ Addresses saved for "${networkName}" → addresses.json`);
}

// ── CLI entry (npx hardhat run scripts/updateFrontend.js) ──
async function main() {
  console.log("\n📦 Updating frontend contracts...\n");
  exportAbis();
  console.log("\nABIs exported. Addresses are written by deploy scripts.\n");
}

// Allow both `require()` and direct execution
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { exportAbis, saveAddresses };
