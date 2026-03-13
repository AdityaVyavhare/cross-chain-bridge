/**
 * Bridge Event Monitor
 *
 * Listens for bridge events on both chains and logs them.
 * All validation and relay is done manually via the ValidatorDashboard UI.
 *
 * Uses ethers v5
 */

require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const { ethers } = require("ethers");

// ---------- ABI fragments (events only — relay is done via UI) ----------
const BRIDGE_SEPOLIA_ABI = [
  "event TokensLocked(address user, uint256 amount, uint256 nonce)",
  "event TokensUnlocked(address user, uint256 amount, uint256 nonce)",
];

const BRIDGE_AMOY_ABI = [
  "event TokensBurned(address user, uint256 amount, uint256 nonce)",
  "event TokensMinted(address user, uint256 amount, uint256 nonce)",
];

// ---------- Config ----------
const {
  PRIVATE_KEY,
  SEPOLIA_WS,
  AMOY_WS,
  SEPOLIA_RPC,
  AMOY_RPC,
  SEPOLIA_BRIDGE,
  AMOY_BRIDGE,
} = process.env;

if (!PRIVATE_KEY || !SEPOLIA_BRIDGE || !AMOY_BRIDGE) {
  console.error("Missing env vars. Check .env file.");
  process.exit(1);
}

// ---------- Providers ----------
// Prefer WebSocket for event listening, fallback to HTTP
const sepoliaProvider = SEPOLIA_WS
  ? new ethers.providers.WebSocketProvider(SEPOLIA_WS)
  : new ethers.providers.JsonRpcProvider(SEPOLIA_RPC);

const amoyProvider = AMOY_WS
  ? new ethers.providers.WebSocketProvider(AMOY_WS)
  : new ethers.providers.JsonRpcProvider(AMOY_RPC);

const validatorAddress = new ethers.Wallet(PRIVATE_KEY).address;

// ---------- Contracts (read-only) ----------
const bridgeSepolia = new ethers.Contract(
  SEPOLIA_BRIDGE,
  BRIDGE_SEPOLIA_ABI,
  sepoliaProvider,
);
const bridgeAmoy = new ethers.Contract(
  AMOY_BRIDGE,
  BRIDGE_AMOY_ABI,
  amoyProvider,
);

// ---------- Event Handlers (monitor only — relay via ValidatorDashboard UI) ----------

bridgeSepolia.on("TokensLocked", (user, amount, nonce, event) => {
  console.log(
    `\n[Sepolia] TokensLocked: user=${user} amount=${ethers.utils.formatEther(
      amount,
    )} nonce=${nonce}`,
  );
  console.log("  → Awaiting manual validation via ValidatorDashboard");
});

bridgeSepolia.on("TokensUnlocked", (user, amount, nonce, event) => {
  console.log(
    `\n[Sepolia] TokensUnlocked: user=${user} amount=${ethers.utils.formatEther(
      amount,
    )} nonce=${nonce}`,
  );
  console.log("  ✓ Burn→Unlock relay completed");
});

bridgeAmoy.on("TokensBurned", (user, amount, nonce, event) => {
  console.log(
    `\n[Amoy] TokensBurned: user=${user} amount=${ethers.utils.formatEther(
      amount,
    )} nonce=${nonce}`,
  );
  console.log("  → Awaiting manual validation via ValidatorDashboard");
});

bridgeAmoy.on("TokensMinted", (user, amount, nonce, event) => {
  console.log(
    `\n[Amoy] TokensMinted: user=${user} amount=${ethers.utils.formatEther(
      amount,
    )} nonce=${nonce}`,
  );
  console.log("  ✓ Lock→Mint relay completed");
});

// ---------- Start ----------
console.log("=== Cross-Chain Bridge Monitor ===");
console.log("Validator address:", validatorAddress);
console.log("Mode: MONITOR ONLY (relay via ValidatorDashboard UI)");
console.log("Listening for events on Sepolia & Amoy...");
console.log("Press Ctrl+C to stop.\n");
