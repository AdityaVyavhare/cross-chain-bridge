/**
 * Real-time bridge event listener service for Healthcare Bridge.
 *
 * Listens for both token and NFT bridge events on both chains.
 * Dispatches Redux actions to keep the UI in sync.
 */
import { ethers } from "ethers";
import config from "../config";
import { HealthcareBridgeAbi } from "../contracts";
import { addTransaction, updateTransactionStatus } from "../slices/bridgeSlice";
import { formatAmount } from "../utils/contracts";

let sepoliaProvider = null;
let amoyProvider = null;
let sepoliaBridge = null;
let amoyBridge = null;
let running = false;

const POLL_INTERVAL = 4000;
const AMOY_PUBLIC_RPC = "https://polygon-amoy-bor-rpc.publicnode.com";

const BRIDGE_ABI_FALLBACK = [
  "event TokenLocked(address indexed user, uint256 amount, uint256 nonce)",
  "event TokenUnlocked(address indexed user, uint256 amount, uint256 nonce)",
  "event TokenMinted(address indexed user, uint256 amount, uint256 nonce)",
  "event TokenBurned(address indexed user, uint256 amount, uint256 nonce)",
  "event NFTLocked(address indexed patient, uint256 indexed tokenId, uint256 destinationChainId, uint256 nonce, string recordType, string encryptedCID, address hospital, uint256 originalChainId)",
  "event NFTUnlocked(address indexed patient, uint256 indexed tokenId, uint256 nonce)",
  "event NFTMinted(address indexed patient, uint256 indexed tokenId, uint256 nonce, string recordType, string encryptedCID, address hospital, uint256 originalChainId)",
  "event NFTBurned(address indexed patient, uint256 indexed tokenId, uint256 nonce)",
];

function getBridgeAbi() {
  return HealthcareBridgeAbi && HealthcareBridgeAbi.length > 0
    ? HealthcareBridgeAbi
    : BRIDGE_ABI_FALLBACK;
}

function txId(type, sourceChain, nonce) {
  return `${type}-${sourceChain}-${nonce}`;
}

export function startListeners(dispatch) {
  if (running) return;
  running = true;

  try {
    sepoliaProvider = new ethers.providers.StaticJsonRpcProvider(
      config.sepolia.rpc,
      { chainId: config.sepolia.chainId, name: "sepolia" },
    );
    sepoliaProvider.pollingInterval = POLL_INTERVAL;

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

  const abi = getBridgeAbi();

  // Sepolia bridge
  if (config.sepolia.bridge && ethers.utils.isAddress(config.sepolia.bridge)) {
    sepoliaBridge = new ethers.Contract(config.sepolia.bridge, abi, sepoliaProvider);
  }

  // Amoy bridge
  if (config.amoy.bridge && ethers.utils.isAddress(config.amoy.bridge)) {
    amoyBridge = new ethers.Contract(config.amoy.bridge, abi, amoyProvider);
  }

  // ── Sepolia events ────────────────────────────────────────
  if (sepoliaBridge) {
    sepoliaBridge.on("TokenLocked", (user, amount, nonce, event) => {
      dispatch(
        addTransaction({
          id: txId("token", "Sepolia", nonce.toString()),
          type: "BRT Lock -> Mint",
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

    sepoliaBridge.on("TokenUnlocked", (user, amount, nonce, event) => {
      dispatch(
        updateTransactionStatus({
          id: txId("token", "Amoy", nonce.toString()),
          status: "completed",
          destTxHash: event.transactionHash,
        }),
      );
    });

    sepoliaBridge.on("NFTLocked", (patient, tokenId, destChainId, nonce, recordType, encryptedCID, hospital, originalChainId, event) => {
      dispatch(
        addTransaction({
          id: txId("nft", "Sepolia", nonce.toString()),
          type: "NFT Lock -> Mirror",
          sourceChain: "Sepolia",
          destChain: "Amoy",
          sourceChainId: config.sepolia.chainId,
          destChainId: config.amoy.chainId,
          sender: patient,
          tokenId: tokenId.toString(),
          recordType,
          encryptedCID,
          hospital,
          originalChainId: originalChainId.toString(),
          nonce: nonce.toString(),
          txHash: event.transactionHash,
          timestamp: Date.now(),
          status: "pending",
        }),
      );
    });

    sepoliaBridge.on("NFTUnlocked", (patient, tokenId, nonce, event) => {
      dispatch(
        updateTransactionStatus({
          id: txId("nft", "Amoy", nonce.toString()),
          status: "completed",
          destTxHash: event.transactionHash,
        }),
      );
    });
  }

  // ── Amoy events ───────────────────────────────────────────
  if (amoyBridge) {
    amoyBridge.on("TokenBurned", (user, amount, nonce, event) => {
      dispatch(
        addTransaction({
          id: txId("token", "Amoy", nonce.toString()),
          type: "BRT Burn -> Unlock",
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

    amoyBridge.on("TokenMinted", (user, amount, nonce, event) => {
      dispatch(
        updateTransactionStatus({
          id: txId("token", "Sepolia", nonce.toString()),
          status: "completed",
          destTxHash: event.transactionHash,
        }),
      );
    });

    amoyBridge.on("NFTBurned", (patient, tokenId, nonce, event) => {
      dispatch(
        addTransaction({
          id: txId("nft", "Amoy", nonce.toString()),
          type: "NFT Burn -> Unlock",
          sourceChain: "Amoy",
          destChain: "Sepolia",
          sourceChainId: config.amoy.chainId,
          destChainId: config.sepolia.chainId,
          sender: patient,
          tokenId: tokenId.toString(),
          nonce: nonce.toString(),
          txHash: event.transactionHash,
          timestamp: Date.now(),
          status: "pending",
        }),
      );
    });

    amoyBridge.on("NFTMinted", (patient, tokenId, nonce, recordType, encryptedCID, hospital, originalChainId, event) => {
      dispatch(
        updateTransactionStatus({
          id: txId("nft", "Sepolia", nonce.toString()),
          status: "completed",
          destTxHash: event.transactionHash,
        }),
      );
    });
  }

  console.log("[EventService] Healthcare Bridge listeners started (polling every", POLL_INTERVAL, "ms)");
}

// Alchemy free tier limits eth_getLogs to 10 blocks per request.
// Query in small chunks to stay within the limit.
const CHUNK_SIZE = 9; // 10-block max range, use 9 to be safe

async function queryFilterChunked(contract, filter, fromBlock, toBlock) {
  const events = [];
  for (let start = fromBlock; start <= toBlock; start += CHUNK_SIZE + 1) {
    const end = Math.min(start + CHUNK_SIZE, toBlock);
    try {
      const batch = await contract.queryFilter(filter, start, end);
      events.push(...batch);
    } catch (err) {
      // If a chunk fails, skip it and continue
      console.warn(`[EventService] Chunk ${start}-${end} failed:`, err.message);
    }
  }
  return events;
}

export async function loadHistoricalEvents(dispatch, lookbackBlocks = 100) {
  const txMap = new Map();

  try {
    const persisted = localStorage.getItem("bridge_transactions");
    if (persisted) {
      const parsed = JSON.parse(persisted);
      if (Array.isArray(parsed)) {
        parsed.forEach((tx) => txMap.set(tx.id, tx));
      }
    }
  } catch (e) {
    console.warn("[EventService] localStorage parse error:", e);
  }

  const addTx = (tx) => txMap.set(tx.id, tx);

  try {
    // Sepolia historical
    if (sepoliaBridge) {
      const block = await sepoliaProvider.getBlockNumber();
      const from = Math.max(0, block - lookbackBlocks);

      const [tokenLocked, tokenUnlocked, nftLocked, nftUnlocked] = await Promise.all([
        queryFilterChunked(sepoliaBridge, sepoliaBridge.filters.TokenLocked(), from, block),
        queryFilterChunked(sepoliaBridge, sepoliaBridge.filters.TokenUnlocked(), from, block),
        queryFilterChunked(sepoliaBridge, sepoliaBridge.filters.NFTLocked(), from, block),
        queryFilterChunked(sepoliaBridge, sepoliaBridge.filters.NFTUnlocked(), from, block),
      ]);

      for (const e of tokenLocked) {
        const n = e.args.nonce.toString();
        addTx({
          id: txId("token", "Sepolia", n),
          type: "BRT Lock -> Mint",
          sourceChain: "Sepolia",
          destChain: "Amoy",
          sourceChainId: config.sepolia.chainId,
          destChainId: config.amoy.chainId,
          sender: e.args.user,
          amount: e.args.amount.toString(),
          amountFormatted: formatAmount(e.args.amount),
          nonce: n,
          txHash: e.transactionHash,
          timestamp: Date.now(),
          status: "pending",
        });
      }

      for (const e of tokenUnlocked) {
        const id = txId("token", "Amoy", e.args.nonce.toString());
        if (txMap.has(id)) {
          txMap.get(id).status = "completed";
          txMap.get(id).destTxHash = e.transactionHash;
        }
      }

      for (const e of nftLocked) {
        const n = e.args.nonce.toString();
        addTx({
          id: txId("nft", "Sepolia", n),
          type: "NFT Lock -> Mirror",
          sourceChain: "Sepolia",
          destChain: "Amoy",
          sourceChainId: config.sepolia.chainId,
          destChainId: config.amoy.chainId,
          sender: e.args.patient,
          tokenId: e.args.tokenId.toString(),
          recordType: e.args.recordType,
          encryptedCID: e.args.encryptedCID,
          hospital: e.args.hospital,
          originalChainId: e.args.originalChainId.toString(),
          nonce: n,
          txHash: e.transactionHash,
          timestamp: Date.now(),
          status: "pending",
        });
      }

      for (const e of nftUnlocked) {
        const id = txId("nft", "Amoy", e.args.nonce.toString());
        if (txMap.has(id)) {
          txMap.get(id).status = "completed";
          txMap.get(id).destTxHash = e.transactionHash;
        }
      }
    }

    // Amoy historical
    if (amoyBridge) {
      const block = await amoyProvider.getBlockNumber();
      const from = Math.max(0, block - lookbackBlocks);

      const [tokenBurned, tokenMinted, nftBurned, nftMinted] = await Promise.all([
        queryFilterChunked(amoyBridge, amoyBridge.filters.TokenBurned(), from, block),
        queryFilterChunked(amoyBridge, amoyBridge.filters.TokenMinted(), from, block),
        queryFilterChunked(amoyBridge, amoyBridge.filters.NFTBurned(), from, block),
        queryFilterChunked(amoyBridge, amoyBridge.filters.NFTMinted(), from, block),
      ]);

      for (const e of tokenBurned) {
        const n = e.args.nonce.toString();
        addTx({
          id: txId("token", "Amoy", n),
          type: "BRT Burn -> Unlock",
          sourceChain: "Amoy",
          destChain: "Sepolia",
          sourceChainId: config.amoy.chainId,
          destChainId: config.sepolia.chainId,
          sender: e.args.user,
          amount: e.args.amount.toString(),
          amountFormatted: formatAmount(e.args.amount),
          nonce: n,
          txHash: e.transactionHash,
          timestamp: Date.now(),
          status: "pending",
        });
      }

      for (const e of tokenMinted) {
        const id = txId("token", "Sepolia", e.args.nonce.toString());
        if (txMap.has(id)) {
          txMap.get(id).status = "completed";
          txMap.get(id).destTxHash = e.transactionHash;
        }
      }

      for (const e of nftBurned) {
        const n = e.args.nonce.toString();
        addTx({
          id: txId("nft", "Amoy", n),
          type: "NFT Burn -> Unlock",
          sourceChain: "Amoy",
          destChain: "Sepolia",
          sourceChainId: config.amoy.chainId,
          destChainId: config.sepolia.chainId,
          sender: e.args.patient,
          tokenId: e.args.tokenId.toString(),
          nonce: n,
          txHash: e.transactionHash,
          timestamp: Date.now(),
          status: "pending",
        });
      }

      for (const e of nftMinted) {
        const id = txId("nft", "Sepolia", e.args.nonce.toString());
        if (txMap.has(id)) {
          txMap.get(id).status = "completed";
          txMap.get(id).destTxHash = e.transactionHash;
        }
      }
    }
  } catch (err) {
    console.error("[EventService] Historical load error:", err);
  }

  const sorted = Array.from(txMap.values()).sort(
    (a, b) => b.timestamp - a.timestamp,
  );

  console.log("[EventService] Total transactions loaded:", sorted.length);

  const { setTransactions } = require("../slices/bridgeSlice");
  dispatch(setTransactions(sorted));
}

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
