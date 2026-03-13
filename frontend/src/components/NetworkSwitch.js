import React from "react";
import { useBridge } from "../context/BridgeContext";
import config from "../config";

export default function NetworkSwitch() {
  const { switchNetwork, chainId } = useBridge();

  return (
    <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
      <button
        className={
          chainId === config.sepolia.chainId ? "btn-primary" : "btn-secondary"
        }
        onClick={() => switchNetwork(config.sepolia.chainIdHex)}
      >
        Sepolia
      </button>
      <button
        className={
          chainId === config.amoy.chainId ? "btn-primary" : "btn-secondary"
        }
        onClick={() => switchNetwork(config.amoy.chainIdHex)}
      >
        Amoy
      </button>
    </div>
  );
}
