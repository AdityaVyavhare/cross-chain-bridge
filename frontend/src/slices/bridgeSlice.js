import { createSlice } from "@reduxjs/toolkit";

/**
 * Transaction statuses:
 *  - pending:    User initiated bridge tx on source chain
 *  - validated:  Validator signed / approved
 *  - completed:  Destination chain tx confirmed
 *  - failed:     Error during relay
 *
 * Transaction types:
 *  - "BRT Lock -> Mint"     (Sepolia -> Amoy token)
 *  - "BRT Burn -> Unlock"   (Amoy -> Sepolia token)
 *  - "NFT Lock -> Mirror"   (Sepolia -> Amoy NFT)
 *  - "NFT Burn -> Unlock"   (Amoy -> Sepolia NFT)
 */

const STORAGE_KEY = "bridge_transactions";

function loadPersistedTransactions() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn("[bridgeSlice] localStorage load error:", e);
  }
  return [];
}

function persistTransactions(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (e) {
    console.warn("[bridgeSlice] localStorage save error:", e);
  }
}

const initialState = {
  items: loadPersistedTransactions(),
};

const bridgeSlice = createSlice({
  name: "bridge",
  initialState,
  reducers: {
    addTransaction(state, action) {
      const tx = action.payload;
      const exists = state.items.find((t) => t.id === tx.id);
      if (!exists) {
        state.items.unshift(tx);
        persistTransactions(state.items);
      }
    },

    updateTransactionStatus(state, action) {
      const { id, status, destTxHash } = action.payload;
      const tx = state.items.find((t) => t.id === id);
      if (tx) {
        tx.status = status;
        if (destTxHash) tx.destTxHash = destTxHash;
        if (status === "completed") tx.completedAt = Date.now();
        if (status === "validated") tx.validatedAt = Date.now();
        persistTransactions(state.items);
      }
    },

    setTransactions(state, action) {
      state.items = action.payload;
      persistTransactions(state.items);
    },

    clearTransactions(state) {
      state.items = [];
      persistTransactions(state.items);
    },
  },
});

export const {
  addTransaction,
  updateTransactionStatus,
  setTransactions,
  clearTransactions,
} = bridgeSlice.actions;

// Selectors
export const selectAllTransactions = (state) => state.bridge.items;
export const selectPendingTransactions = (state) =>
  state.bridge.items.filter((t) => t.status === "pending");
export const selectValidatedTransactions = (state) =>
  state.bridge.items.filter((t) => t.status === "validated");
export const selectCompletedTransactions = (state) =>
  state.bridge.items.filter((t) => t.status === "completed");

// Filter by type
export const selectTokenTransactions = (state) =>
  state.bridge.items.filter((t) => t.type.includes("BRT"));
export const selectNFTTransactions = (state) =>
  state.bridge.items.filter((t) => t.type.includes("NFT"));

export default bridgeSlice.reducer;
