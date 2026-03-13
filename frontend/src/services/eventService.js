/**
 * Real-time bridge event listener service.
 *
 * Creates read-only providers for BOTH chains (Sepolia + Amoy) and listens
 * for Locked / Burned / Minted / Unlocked events. Dispatches Redux actions
 * so the entire app stays in sync without manual refresh.
 *
 * Uses StaticJsonRpcProvider with explicit pollingInterval for reliable
 * event detection via Alchemy RPCs.
 */
import { ethers } from "ethers";
import config from "../config";
import { BridgeSepoliaAbi, BridgeAmoyAbi } from "../contracts";
import { addTransaction, updateTransactionStatus } from "../slices/bridgeSlice";
import { formatAmount } from "../utils/contracts";

// Keep references so we can tear down
let sepoliaProvider = null;
let amoyProvider = null;
let sepoliaBridge = null;
let amoyBridge = null;
let running = false;

// Polling interval for event detection (ms)
const POLL_INTERVAL = 4000;

// Public RPC for Amoy — Alchemy free tier limits eth_getLogs to 10 blocks
const AMOY_PUBLIC_RPC = "https://polygon-amoy-bor-rpc.publicnode.com";

/** Unique id for a bridge tx */
function txId(sourceChain, nonce) {
  return `${sourceChain}-${nonce}`;
}

/**
 * Boot the listeners. Call once (usually from a React hook).
 * @param {Function} dispatch - Redux dispatch
 */
export function startListeners(dispatch) {
  if (running) return;
  running = true;

  // ── Read-only providers with explicit polling ───────────
  try {
    sepoliaProvider = new ethers.providers.StaticJsonRpcProvider(
      config.sepolia.rpc,
      { chainId: config.sepolia.chainId, name: "sepolia" },
    );
    sepoliaProvider.pollingInterval = POLL_INTERVAL;

    // Use public RPC for Amoy — Alchemy free tier limits eth_getLogs to 10 blocks
    // which breaks ethers' polling-based event detection
    amoyProvider = new ethers.providers.StaticJsonRpcProvider(AMOY_PUBLIC_RPC, {
      chainId: config.amoy.chainId,
      name: "polygon-amoy",
    });
    amoyProvider.pollingInterval = POLL_INTERVAL;
  } catch (err) {
    console.error("[EventService] Cannot create providers:", err);
    running = false;
    return;
  }

  // ── Contract instances (read-only) ──────────────────────
  if (config.sepolia.bridge && ethers.utils.isAddress(config.sepolia.bridge)) {
    sepoliaBridge = new ethers.Contract(
      config.sepolia.bridge,
      BridgeSepoliaAbi,
      sepoliaProvider,
    );
  }

  if (config.amoy.bridge && ethers.utils.isAddress(config.amoy.bridge)) {
    amoyBridge = new ethers.Contract(
      config.amoy.bridge,
      BridgeAmoyAbi,
      amoyProvider,
    );
  }

  // ── Listen: TokensLocked on Sepolia ───────────────────────────
  if (sepoliaBridge) {
    sepoliaBridge.on("TokensLocked", (user, amount, nonce, event) => {
      console.log(
        "[EventService] TokensLocked detected:",
        user,
        nonce.toString(),
      );
      dispatch(
        addTransaction({
          id: txId("Sepolia", nonce.toString()),
          type: "Lock → Mint",
          sourceChain: "Sepolia",
          destChain: "Amoy",
          sourceChainId: config.sepolia.chainId,
          destChainId: config.amoy.chainId,
          sender: user,
          amount: amount.toString(),
          amountFormatted: formatAmount(amount),
          nonce: nonce.toString(),
          txHash: event.transactionHash,
          timestamp: Date.now(),
          status: "pending",
        }),
      );
    });

    // ── Listen: TokensUnlocked on Sepolia ─────────────────────────
    sepoliaBridge.on("TokensUnlocked", (user, amount, nonce, event) => {
      console.log(
        "[EventService] TokensUnlocked detected:",
        user,
        nonce.toString(),
      );
      dispatch(
        updateTransactionStatus({
          id: txId("Amoy", nonce.toString()),
          status: "completed",
          destTxHash: event.transactionHash,
        }),
      );
    });
  }

  // ── Listen: TokensBurned on Amoy ──────────────────────────────
  if (amoyBridge) {
    amoyBridge.on("TokensBurned", (user, amount, nonce, event) => {
      console.log(
        "[EventService] TokensBurned detected:",
        user,
        nonce.toString(),
      );
      dispatch(
        addTransaction({
          id: txId("Amoy", nonce.toString()),
          type: "Burn → Unlock",
          sourceChain: "Amoy",
          destChain: "Sepolia",
          sourceChainId: config.amoy.chainId,
          destChainId: config.sepolia.chainId,
          sender: user,
          amount: amount.toString(),
          amountFormatted: formatAmount(amount),
          nonce: nonce.toString(),
          txHash: event.transactionHash,
          timestamp: Date.now(),
          status: "pending",
        }),
      );
    });

    // ── Listen: TokensMinted on Amoy ──────────────────────────────
    amoyBridge.on("TokensMinted", (user, amount, nonce, event) => {
      console.log(
        "[EventService] TokensMinted detected:",
        user,
        nonce.toString(),
      );
      dispatch(
        updateTransactionStatus({
          id: txId("Sepolia", nonce.toString()),
          status: "completed",
          destTxHash: event.transactionHash,
        }),
      );
    });
  }

  console.log(
    "[EventService] Real-time listeners started (polling every",
    POLL_INTERVAL,
    "ms)",
  );
}

/**
 * Fetch historical events to populate the store with past transactions.
 * Merges with any localStorage-persisted data so old transactions survive reloads.
 * @param {Function} dispatch - Redux dispatch
 * @param {number} lookbackBlocks - How many blocks to look back (default 50000)
 */
export async function loadHistoricalEvents(dispatch, lookbackBlocks = 50000) {
  const txMap = new Map();

  // 1) Load persisted transactions from localStorage first
  try {
    const persisted = localStorage.getItem("bridge_transactions");
    if (persisted) {
      const parsed = JSON.parse(persisted);
      if (Array.isArray(parsed)) {
        parsed.forEach((tx) => txMap.set(tx.id, tx));
        console.log(
          "[EventService] Loaded",
          parsed.length,
          "persisted transactions from localStorage",
        );
      }
    }
  } catch (e) {
    console.warn("[EventService] localStorage parse error:", e);
  }

  // Helper to add/update in map (on-chain data wins over localStorage)
  const addTx = (tx) => {
    txMap.set(tx.id, tx);
  };

  // 2) Fetch on-chain events and merge
  try {
    if (sepoliaBridge) {
      const block = await sepoliaProvider.getBlockNumber();
      const from = Math.max(0, block - lookbackBlocks);

      const [locked, unlocked] = await Promise.all([
        sepoliaBridge.queryFilter(
          sepoliaBridge.filters.TokensLocked(),
          from,
          block,
        ),
        sepoliaBridge.queryFilter(
          sepoliaBridge.filters.TokensUnlocked(),
          from,
          block,
        ),
      ]);

      for (const e of locked) {
        const n = e.args.nonce.toString();
        let ts = Date.now();
        try {
          const blk = await e.getBlock();
          if (blk) ts = blk.timestamp * 1000;
        } catch (_) {}
        addTx({
          id: txId("Sepolia", n),
          type: "Lock → Mint",
          sourceChain: "Sepolia",
          destChain: "Amoy",
          sourceChainId: config.sepolia.chainId,
          destChainId: config.amoy.chainId,
          sender: e.args.user,
          amount: e.args.amount.toString(),
          amountFormatted: formatAmount(e.args.amount),
          nonce: n,
          txHash: e.transactionHash,
          timestamp: ts,
          status: "pending",
        });
      }

      // Mark unlocked (Burn→Unlock completed)
      for (const e of unlocked) {
        const n = e.args.nonce.toString();
        const id = txId("Amoy", n);
        if (txMap.has(id)) {
          txMap.get(id).status = "completed";
          txMap.get(id).destTxHash = e.transactionHash;
        }
      }
    }

    if (amoyBridge) {
      // Amoy already uses public RPC (amoyProvider), reuse it
      const block = await amoyProvider.getBlockNumber();
      const from = Math.max(0, block - lookbackBlocks);

      const [burned, minted] = await Promise.all([
        amoyBridge.queryFilter(amoyBridge.filters.TokensBurned(), from, block),
        amoyBridge.queryFilter(amoyBridge.filters.TokensMinted(), from, block),
      ]);

      for (const e of burned) {
        const n = e.args.nonce.toString();
        let ts = Date.now();
        try {
          const blk = await e.getBlock();
          if (blk) ts = blk.timestamp * 1000;
        } catch (_) {}
        addTx({
          id: txId("Amoy", n),
          type: "Burn → Unlock",
          sourceChain: "Amoy",
          destChain: "Sepolia",
          sourceChainId: config.amoy.chainId,
          destChainId: config.sepolia.chainId,
          sender: e.args.user,
          amount: e.args.amount.toString(),
          amountFormatted: formatAmount(e.args.amount),
          nonce: n,
          txHash: e.transactionHash,
          timestamp: ts,
          status: "pending",
        });
      }

      // Mark minted nonces as completed on the Sepolia → Amoy side
      for (const e of minted) {
        const n = e.args.nonce.toString();
        const id = txId("Sepolia", n);
        if (txMap.has(id)) {
          txMap.get(id).status = "completed";
          txMap.get(id).destTxHash = e.transactionHash;
        }
      }
    }
  } catch (err) {
    console.error("[EventService] Historical load error:", err);
  }

  // Sort newest first and dispatch
  const sorted = Array.from(txMap.values()).sort(
    (a, b) => b.timestamp - a.timestamp,
  );

  console.log("[EventService] Total transactions loaded:", sorted.length);

  const { setTransactions } = require("../slices/bridgeSlice");
  dispatch(setTransactions(sorted));
}

/**
 * Stop all listeners and clean up providers.
 */
export function stopListeners() {
  if (sepoliaBridge) sepoliaBridge.removeAllListeners();
  if (amoyBridge) amoyBridge.removeAllListeners();
  sepoliaProvider = null;
  amoyProvider = null;
  sepoliaBridge = null;
  amoyBridge = null;
  running = false;
  console.log("[EventService] Listeners stopped");
}
