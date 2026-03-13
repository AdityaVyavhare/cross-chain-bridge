import { configureStore } from "@reduxjs/toolkit";
import walletReducer from "../slices/walletSlice";
import bridgeReducer from "../slices/bridgeSlice";

const store = configureStore({
  reducer: {
    wallet: walletReducer,
    bridge: bridgeReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      // ethers BigNumber is not serializable — ignore those paths
      serializableCheck: false,
    }),
});

export default store;
