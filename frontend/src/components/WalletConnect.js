import React from "react";
import { useBridge } from "../context/BridgeContext";
import { shortenAddress } from "../utils/contracts";

export default function WalletConnect() {
  const { account, connectWallet, chainId, networkConfig, isSupported } =
    useBridge();

  return (
    <div className="card">
      {!account ? (
        <button className="btn-primary" onClick={connectWallet}>
          Connect MetaMask
        </button>
      ) : (
        <>
          <div className="info-row">
            <span>Wallet:</span>
            <span>{shortenAddress(account)}</span>
          </div>
          <div className="info-row">
            <span>Chain:</span>
            <span>
              {networkConfig ? networkConfig.name : `Unsupported (${chainId})`}
            </span>
          </div>
          {!isSupported && (
            <div className="status error">
              Please switch to Sepolia or Polygon Amoy.
            </div>
          )}
        </>
      )}
    </div>
  );
}
