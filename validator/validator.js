/**
 * Healthcare Bridge Validator Service
 *
 * Listens for bridge events on both chains (Sepolia & Amoy) and logs them.
 * Supports both NFT and Token bridge events.
 *
 * All validation and relay is done manually via the ValidatorDashboard UI.
 * This service acts as a real-time monitor.
 *
 * Uses ethers v5
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const { ethers } = require("ethers");

// ── ABI fragments (events only) ──────────────────────────────
const BRIDGE_ABI = [
  // Token events
  "event TokenLocked(address indexed user, uint256 amount, uint256 nonce)",
  "event TokenUnlocked(address indexed user, uint256 amount, uint256 nonce)",
  "event TokenMinted(address indexed user, uint256 amount, uint256 nonce)",
  "event TokenBurned(address indexed user, uint256 amount, uint256 nonce)",
  // NFT events
  "event NFTLocked(address indexed patient, uint256 indexed tokenId, uint256 destinationChainId, uint256 nonce, string recordType, string encryptedCID, address hospital, uint256 originalChainId)",
  "event NFTUnlocked(address indexed patient, uint256 indexed tokenId, uint256 nonce)",
  "event NFTMinted(address indexed patient, uint256 indexed tokenId, uint256 nonce, string recordType, string encryptedCID, address hospital, uint256 originalChainId)",
  "event NFTBurned(address indexed patient, uint256 indexed tokenId, uint256 nonce)",
  // Reward
  "event ValidatorRewarded(address indexed validator, uint256 amount)",
];

// ── Config ────────────────────────────────────────────────────
const {
  PRIVATE_KEY,
  SEPOLIA_WS,
  AMOY_WS,
  SEPOLIA_RPC,
  AMOY_RPC,
  SEPOLIA_BRIDGE,
  AMOY_BRIDGE,
} = process.env;

if (!PRIVATE_KEY) {
  console.error("Missing PRIVATE_KEY in .env");
  process.exit(1);
}

const validatorAddress = new ethers.Wallet(PRIVATE_KEY).address;

// ── Providers ─────────────────────────────────────────────────
const sepoliaProvider = SEPOLIA_WS
  ? new ethers.providers.WebSocketProvider(SEPOLIA_WS)
  : new ethers.providers.JsonRpcProvider(SEPOLIA_RPC);

const amoyProvider = AMOY_WS
  ? new ethers.providers.WebSocketProvider(AMOY_WS)
  : new ethers.providers.JsonRpcProvider(AMOY_RPC);

// ── Helper ────────────────────────────────────────────────────
function attachListeners(label, contractAddr, provider) {
  if (!contractAddr) {
    console.warn(`  [${label}] No bridge address configured, skipping`);
    return;
  }

  const bridge = new ethers.Contract(contractAddr, BRIDGE_ABI, provider);

  // Token events
  bridge.on("TokenLocked", (user, amount, nonce) => {
    console.log(
      `\n[${label}] TokenLocked: user=${user} amount=${ethers.utils.formatEther(amount)} nonce=${nonce}`,
    );
    console.log("  -> Awaiting validation via ValidatorDashboard");
  });

  bridge.on("TokenUnlocked", (user, amount, nonce) => {
    console.log(
      `\n[${label}] TokenUnlocked: user=${user} amount=${ethers.utils.formatEther(amount)} nonce=${nonce}`,
    );
    console.log("  -> Burn->Unlock relay completed");
  });

  bridge.on("TokenMinted", (user, amount, nonce) => {
    console.log(
      `\n[${label}] TokenMinted: user=${user} amount=${ethers.utils.formatEther(amount)} nonce=${nonce}`,
    );
    console.log("  -> Lock->Mint relay completed");
  });

  bridge.on("TokenBurned", (user, amount, nonce) => {
    console.log(
      `\n[${label}] TokenBurned: user=${user} amount=${ethers.utils.formatEther(amount)} nonce=${nonce}`,
    );
    console.log("  -> Awaiting validation via ValidatorDashboard");
  });

  // NFT events
  bridge.on(
    "NFTLocked",
    (patient, tokenId, destChainId, nonce, recordType, encryptedCID, hospital, originalChainId) => {
      console.log(
        `\n[${label}] NFTLocked: patient=${patient} tokenId=${tokenId} nonce=${nonce}`,
      );
      console.log(`    recordType=${recordType} destChain=${destChainId}`);
      console.log("  -> Awaiting validation via ValidatorDashboard");
    },
  );

  bridge.on("NFTUnlocked", (patient, tokenId, nonce) => {
    console.log(
      `\n[${label}] NFTUnlocked: patient=${patient} tokenId=${tokenId} nonce=${nonce}`,
    );
    console.log("  -> BurnMirror->Unlock relay completed");
  });

  bridge.on(
    "NFTMinted",
    (patient, tokenId, nonce, recordType, encryptedCID, hospital, originalChainId) => {
      console.log(
        `\n[${label}] NFTMinted: patient=${patient} tokenId=${tokenId} nonce=${nonce}`,
      );
      console.log("  -> Lock->MintMirror relay completed");
    },
  );

  bridge.on("NFTBurned", (patient, tokenId, nonce) => {
    console.log(
      `\n[${label}] NFTBurned: patient=${patient} tokenId=${tokenId} nonce=${nonce}`,
    );
    console.log("  -> Awaiting validation via ValidatorDashboard");
  });

  bridge.on("ValidatorRewarded", (validator, amount) => {
    console.log(
      `\n[${label}] ValidatorRewarded: ${validator} +${ethers.utils.formatEther(amount)} BRT`,
    );
  });

  console.log(`  [${label}] Listening on ${contractAddr}`);
}

// ── Start ─────────────────────────────────────────────────────
console.log("=== Healthcare Bridge Validator Monitor ===");
console.log("Validator address:", validatorAddress);
console.log("Mode: MONITOR ONLY (relay via ValidatorDashboard UI)");
console.log("");

attachListeners("Sepolia", SEPOLIA_BRIDGE, sepoliaProvider);
attachListeners("Amoy", AMOY_BRIDGE, amoyProvider);

console.log("\nListening for events on Sepolia & Amoy...");
console.log("Press Ctrl+C to stop.\n");
