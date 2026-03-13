import { createSlice } from "@reduxjs/toolkit";

/**
 * Transaction statuses:
 *  - pending:    User initiated the bridge tx on source chain
 *  - validated:  Validator signed / approved
 *  - completed:  Destination chain tx confirmed
 *  - failed:     Error during relay
 */

const STORAGE_KEY = "bridge_transactions";

// Load persisted transactions from localStorage
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

// Save transactions to localStorage
function persistTransactions(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (e) {
    console.warn("[bridgeSlice] localStorage save error:", e);
  }
}

const initialState = {
  // All bridge transactions keyed by a unique id
  items: loadPersistedTransactions(),
};

const bridgeSlice = createSlice({
  name: "bridge",
  initialState,
  reducers: {
    // Add a new bridge transaction (from user action or event listener)
    addTransaction(state, action) {
      const tx = action.payload;
      // Avoid duplicates (by nonce + sourceChain combo)
      const exists = state.items.find(
        (t) => t.nonce === tx.nonce && t.sourceChain === tx.sourceChain,
      );
      if (!exists) {
        state.items.unshift(tx);
        persistTransactions(state.items);
      }
    },

    // Update status of an existing transaction
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

    // Bulk load transactions (e.g. from initial event scan)
    setTransactions(state, action) {
      state.items = action.payload;
      persistTransactions(state.items);
    },

    // Clear all
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

export default bridgeSlice.reducer;
