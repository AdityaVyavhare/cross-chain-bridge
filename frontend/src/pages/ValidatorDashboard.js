import React, { useState, useCallback } from "react";
import { ethers } from "ethers";
import { useSelector, useDispatch } from "react-redux";
import { useBridge } from "../context/BridgeContext";
import config from "../config";
import { HealthcareBridgeAbi } from "../contracts";
import { shortenAddress, getGasOverrides } from "../utils/contracts";
import {
  selectPendingTransactions,
  selectValidatedTransactions,
  selectCompletedTransactions,
  selectAllTransactions,
  updateTransactionStatus,
} from "../slices/bridgeSlice";

const SEPOLIA_CHAIN_ID = config.sepolia.chainId;
const AMOY_CHAIN_ID = config.amoy.chainId;

const BRIDGE_ABI_FALLBACK = [
  "function mintTokens(address,uint256,uint256,uint256,bytes)",
  "function unlockTokens(address,uint256,uint256,uint256,bytes)",
  "function mintMirrorNFT(address,uint256,uint256,uint256,string,string,address,uint256,bytes)",
  "function unlockNFT(address,uint256,uint256,uint256,bytes)",
  "function tokenProcessed(uint256) view returns (bool)",
  "function nftProcessed(uint256) view returns (bool)",
];

function getBridgeAbi() {
  return HealthcareBridgeAbi && HealthcareBridgeAbi.length > 0 ? HealthcareBridgeAbi : BRIDGE_ABI_FALLBACK;
}

export default function ValidatorDashboard({ subPage }) {
  const { account, signer, chainId, switchNetwork, networkConfig } = useBridge();
  const dispatch = useDispatch();

  const pending = useSelector(selectPendingTransactions);
  const validated = useSelector(selectValidatedTransactions);
  const completed = useSelector(selectCompletedTransactions);
  const allTx = useSelector(selectAllTransactions);

  const [busyId, setBusyId] = useState(null);
  const chainName = networkConfig ? networkConfig.name : chainId === SEPOLIA_CHAIN_ID ? "Sepolia" : chainId === AMOY_CHAIN_ID ? "Amoy" : `Chain ${chainId}`;

  const handleValidateAndRelay = useCallback(async (transfer) => {
    if (!signer || !account) { alert("Connect wallet first"); return; }
    setBusyId(transfer.id);
    try {
      const isFromSepolia = transfer.sourceChainId === SEPOLIA_CHAIN_ID;
      const destChainId = isFromSepolia ? AMOY_CHAIN_ID : SEPOLIA_CHAIN_ID;
      const destRpc = isFromSepolia ? config.amoy.rpc : config.sepolia.rpc;
      const destAddr = isFromSepolia ? config.amoy.bridge : config.sepolia.bridge;

      const checkProvider = new ethers.providers.JsonRpcProvider(destRpc);
      const checkContract = new ethers.Contract(destAddr,
        ["function tokenProcessed(uint256) view returns(bool)", "function nftProcessed(uint256) view returns(bool)"],
        checkProvider);

      const isNFT = transfer.type.includes("NFT");
      const processed = isNFT ? await checkContract.nftProcessed(transfer.nonce) : await checkContract.tokenProcessed(transfer.nonce);

      if (processed) {
        dispatch(updateTransactionStatus({ id: transfer.id, status: "completed" }));
        alert("Already processed on destination chain.");
        setBusyId(null);
        return;
      }

      let messageHash;
      if (isNFT) {
        messageHash = ethers.utils.solidityKeccak256(
          ["string", "address", "uint256", "uint256", "uint256"],
          ["NFT", transfer.sender, transfer.tokenId, transfer.nonce, transfer.sourceChainId]);
      } else {
        messageHash = ethers.utils.solidityKeccak256(
          ["string", "address", "uint256", "uint256", "uint256"],
          ["TOKEN", transfer.sender, transfer.amount, transfer.nonce, transfer.sourceChainId]);
      }

      const signature = await signer.signMessage(ethers.utils.arrayify(messageHash));
      dispatch(updateTransactionStatus({ id: transfer.id, status: "validated" }));

      if (chainId !== destChainId) {
        const targetHex = isFromSepolia ? config.amoy.chainIdHex : config.sepolia.chainIdHex;
        await switchNetwork(targetHex);
        await new Promise((r) => setTimeout(r, 1500));
      }

      const destProvider = new ethers.providers.Web3Provider(window.ethereum);
      const destSigner = destProvider.getSigner();
      const gasOverrides = await getGasOverrides(destChainId);
      const destBridge = new ethers.Contract(destAddr, getBridgeAbi(), destSigner);

      let tx;
      if (isNFT) {
        const isMintMirror = transfer.type.includes("Lock");
        if (isMintMirror) {
          // NFT Lock -> Mint: mint mirror on destination chain
          tx = await destBridge.mintMirrorNFT(transfer.sender, transfer.tokenId, transfer.nonce, transfer.sourceChainId,
            transfer.recordType || "", transfer.encryptedCID || "", transfer.hospital || ethers.constants.AddressZero,
            transfer.originalChainId || transfer.sourceChainId, signature, gasOverrides);
        } else {
          // NFT Burn -> Unlock: unlock original on destination chain
          tx = await destBridge.unlockNFT(transfer.sender, transfer.tokenId, transfer.nonce, transfer.sourceChainId, signature, gasOverrides);
        }
      } else {
        const isMintTokens = transfer.type.includes("Lock");
        if (isMintTokens) {
          // Token Lock -> Mint: mint tokens on destination chain
          tx = await destBridge.mintTokens(transfer.sender, transfer.amount, transfer.nonce, transfer.sourceChainId, signature, gasOverrides);
        } else {
          // Token Burn -> Unlock: unlock tokens on destination chain
          tx = await destBridge.unlockTokens(transfer.sender, transfer.amount, transfer.nonce, transfer.sourceChainId, signature, gasOverrides);
        }
      }

      await tx.wait();
      dispatch(updateTransactionStatus({ id: transfer.id, status: "completed", destTxHash: tx.hash }));
    } catch (err) {
      console.error("Validation error:", err);
      dispatch(updateTransactionStatus({ id: transfer.id, status: "pending" }));
      alert("Validation failed: " + (err.reason || err.message));
    } finally { setBusyId(null); }
  }, [signer, account, chainId, switchNetwork, dispatch]);

  const topBar = (title, subtitle) => (
    <div className="topbar">
      <div className="topbar-left"><h1>{title}</h1><p>{subtitle}</p></div>
      <div className="topbar-right">
        <span className="topbar-chip">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>
          Mainnet / Testnets
        </span>
      </div>
    </div>
  );

  // ═══════════ Pending Queue ═══════════════════
  if (subPage === "dashboard") {
    return (
      <div>
        {topBar("Validator Dashboard", "Monitor bridge events and validate cross-chain transactions.")}
        <div className="stats-row stats-row-3">
          <div className="stat-card">
            <div className="stat-card-header"><span>Pending Transactions</span><span className="stat-icon">&#9201;</span></div>
            <div className="stat-value">{pending.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-header"><span>Validated Today</span><span className="stat-icon">&#9989;</span></div>
            <div className="stat-value">{validated.length + completed.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-header"><span>Total Gas Spent</span><span className="stat-icon">&#9981;</span></div>
            <div className="stat-value">--</div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Action Required: Pending Validations</h2>
            <button className="btn btn-sm btn-outline">Refresh Events</button>
          </div>

          {pending.length === 0 ? (
            <div className="empty-state"><p>No pending transactions to validate.</p></div>
          ) : (
            <table className="validator-table">
              <thead>
                <tr><th>Tx ID</th><th>Type</th><th>Route</th><th>User Address</th><th>Payload (ID/Amt)</th><th>Status</th><th>Action</th></tr>
              </thead>
              <tbody>
                {pending.map((tx) => {
                  const isNFT = tx.type.includes("NFT");
                  return (
                    <tr key={tx.id}>
                      <td><span className="cell-hash">{tx.txHash ? shortenAddress(tx.txHash) : "--"}</span></td>
                      <td><span className={isNFT ? "badge badge-nft" : "badge badge-token"}>{isNFT ? "Medical NFT" : "Token"}</span></td>
                      <td>
                        <span className="route-text">
                          {tx.sourceChain} &rarr; {tx.destChain}
                        </span>
                      </td>
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>{shortenAddress(tx.sender)}</td>
                      <td>{isNFT ? `#${tx.tokenId || "?"}` : `${tx.amountFormatted || "?"} BRT`}</td>
                      <td><span className={`badge badge-${tx.status}`}>{tx.status}</span></td>
                      <td>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => handleValidateAndRelay(tx)}
                          disabled={busyId === tx.id}
                        >
                          {busyId === tx.id ? "Minting..." : "Validate Bridge"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  // ═══════════ Processed TXs ═══════════════════
  if (subPage === "processed") {
    const processedTxs = [...validated, ...completed];
    return (
      <div>
        {topBar("Processed Transactions", "Validated and completed bridge transactions.")}
        <div className="card">
          {processedTxs.length === 0 ? (
            <div className="empty-state"><p>No processed transactions yet.</p></div>
          ) : (
            <table className="validator-table">
              <thead><tr><th>Tx ID</th><th>Type</th><th>Route</th><th>User</th><th>Payload</th><th>Status</th></tr></thead>
              <tbody>
                {processedTxs.map((tx) => {
                  const isNFT = tx.type.includes("NFT");
                  return (
                    <tr key={tx.id}>
                      <td><span className="cell-hash">{tx.txHash ? shortenAddress(tx.txHash) : "--"}</span></td>
                      <td><span className={isNFT ? "badge badge-nft" : "badge badge-token"}>{isNFT ? "Medical NFT" : "Token"}</span></td>
                      <td><span className="route-text">{tx.sourceChain} &rarr; {tx.destChain}</span></td>
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>{shortenAddress(tx.sender)}</td>
                      <td>{isNFT ? `#${tx.tokenId || "?"}` : `${tx.amountFormatted || "?"} BRT`}</td>
                      <td><span className={`badge badge-${tx.status}`}>{tx.status}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  // ═══════════ Node Status ═════════════════════
  if (subPage === "status") {
    return (
      <div>
        {topBar("Node Status", "Validator node connection and performance details.")}
        <div className="stats-row stats-row-3">
          <div className="stat-card">
            <div className="stat-card-header"><span>Node Status</span></div>
            <div className="stat-value" style={{ color: "#059669" }}>Online</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-header"><span>Connected Chain</span></div>
            <div className="stat-value" style={{ fontSize: 20 }}>{chainName}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-header"><span>Validator Address</span></div>
            <div className="stat-value" style={{ fontSize: 16, fontFamily: "monospace" }}>{shortenAddress(account)}</div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════ Event Listener ══════════════════
  if (subPage === "events") {
    return (
      <div>
        {topBar("Live Event Listener", "Real-time blockchain events from BridgeContract.")}
        <div className="card">
          <div className="card-header">
            <h2>Bridge Events</h2>
            <span className="badge badge-active" style={{ padding: "6px 16px", fontSize: 13 }}>Listening to Events</span>
          </div>
          {allTx.length === 0 ? (
            <div className="empty-state"><p>No events captured yet. Events appear when bridge transactions occur.</p></div>
          ) : (
            <table className="data-table">
              <thead><tr><th>Event Type</th><th>Details</th><th>Network</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {allTx.map((tx) => {
                  const isNFT = tx.type.includes("NFT");
                  return (
                    <tr key={tx.id}>
                      <td>
                        <span className="cell-main">{tx.type.includes("Lock") ? (isNFT ? "NFTLocked" : "TokenLocked") : tx.type.includes("Mint") ? (isNFT ? "NFTMinted" : "TokenMinted") : tx.type.includes("Burn") ? (isNFT ? "NFTBurned" : "TokenBurned") : "Event"}</span>
                        <span className="cell-sub">{new Date(tx.timestamp).toLocaleTimeString()}</span>
                      </td>
                      <td>
                        <span className="cell-main">{isNFT ? `Medical NFT #${tx.tokenId || "?"}` : `${tx.amountFormatted || "?"} BRT Tokens`}</span>
                        <span className="cell-sub" style={{ fontFamily: "monospace" }}>{tx.txHash ? shortenAddress(tx.txHash) : ""}</span>
                      </td>
                      <td>
                        <span className="cell-main">{tx.sourceChain}</span>
                        <span className="cell-sub">Source</span>
                      </td>
                      <td><span className={`badge badge-${tx.status}`}>{tx.status}</span></td>
                      <td><a href="#" style={{ color: "#0d9488", fontSize: 16 }} title="View details">&#8599;</a></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  return null;
}
