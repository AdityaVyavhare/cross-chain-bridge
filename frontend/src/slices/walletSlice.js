import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  account: null,
  chainId: null,
  isConnected: false,
};

const walletSlice = createSlice({
  name: "wallet",
  initialState,
  reducers: {
    setWallet(state, action) {
      state.account = action.payload.account;
      state.chainId = action.payload.chainId;
      state.isConnected = true;
    },
    setChainId(state, action) {
      state.chainId = action.payload;
    },
    setAccount(state, action) {
      state.account = action.payload;
      state.isConnected = !!action.payload;
    },
    disconnectWallet(state) {
      state.account = null;
      state.chainId = null;
      state.isConnected = false;
    },
  },
});

export const { setWallet, setChainId, setAccount, disconnectWallet } =
  walletSlice.actions;
export default walletSlice.reducer;
