import React, { useState, useCallback } from "react";
import { ethers } from "ethers";
import { useSelector, useDispatch } from "react-redux";
import { useBridge } from "../context/BridgeContext";
import WalletConnect from "../components/WalletConnect";
import NetworkSwitch from "../components/NetworkSwitch";
import config from "../config";
import { BridgeSepoliaAbi, BridgeAmoyAbi } from "../contracts";
import { shortenAddress } from "../utils/contracts";
import {
  selectPendingTransactions,
  selectValidatedTransactions,
  selectCompletedTransactions,
  updateTransactionStatus,
} from "../slices/bridgeSlice";

const SEPOLIA_CHAIN_ID = config.sepolia.chainId;
const AMOY_CHAIN_ID = config.amoy.chainId;

// Fetch gas price from direct RPC (not MetaMask) and force legacy tx.
// Amoy's EIP-1559 estimates are broken (1.5 gwei vs 66 gwei needed).
async function getGasOverrides(destChainId) {
  try {
    const rpcUrl = destChainId === AMOY_CHAIN_ID
      ? config.amoy.rpc
      : config.sepolia.rpc;
    const directProvider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const gasPrice = await directProvider.getGasPrice();
    return { gasPrice: gasPrice.mul(120).div(100), type: 0 };
  } catch {
    return {};
  }
}

export default function ValidatorDashboard() {
  const { account, signer, chainId, switchNetwork } = useBridge();
  const dispatch = useDispatch();

  const pending = useSelector(selectPendingTransactions);
  const validated = useSelector(selectValidatedTransactions);
  const completed = useSelector(selectCompletedTransactions);

  const [busyId, setBusyId] = useState(null);

  // ── Validate & Relay a single transfer ─────────────────
  const handleValidateAndRelay = useCallback(
    async (transfer) => {
      if (!signer || !account) {
        alert("Connect wallet first");
        return;
      }

      setBusyId(transfer.id);

      try {
        // 0) Pre-flight: check if this nonce was already processed
        const isFromSepolia = transfer.sourceChainId === SEPOLIA_CHAIN_ID;
        const destChainId = isFromSepolia ? AMOY_CHAIN_ID : SEPOLIA_CHAIN_ID;
        const destRpc = isFromSepolia ? config.amoy.rpc : config.sepolia.rpc;
        const checkProvider = new ethers.providers.JsonRpcProvider(destRpc);
        const checkAbi = ["function processed(uint256) view returns(bool)", "function validator() view returns(address)"];
        const destAddr = isFromSepolia ? config.amoy.bridge : config.sepolia.bridge;
        const checkContract = new ethers.Contract(destAddr, checkAbi, checkProvider);

        const alreadyProcessed = await checkContract.processed(transfer.nonce);
        if (alreadyProcessed) {
          dispatch(updateTransactionStatus({ id: transfer.id, status: "completed" }));
          alert("This nonce is already processed on the destination chain.");
          setBusyId(null);
          return;
        }

        const contractValidator = await checkContract.validator();
        if (account.toLowerCase() !== contractValidator.toLowerCase()) {
          alert(`Wrong wallet! Contract validator is ${contractValidator}. Switch MetaMask to that account.`);
          setBusyId(null);
          return;
        }

        // 1) Build message hash
        const messageHash = ethers.utils.solidityKeccak256(
          ["address", "uint256", "uint256", "uint256"],
          [
            transfer.sender,
            transfer.amount,
            transfer.nonce,
            transfer.sourceChainId,
          ],
        );

        // 2) Sign with MetaMask
        const messageBytes = ethers.utils.arrayify(messageHash);
        const signature = await signer.signMessage(messageBytes);

        // Mark as validated
        dispatch(
          updateTransactionStatus({
            id: transfer.id,
            status: "validated",
          }),
        );

        // 3) Switch to destination chain if needed

        if (chainId !== destChainId) {
          const targetHex = isFromSepolia
            ? config.amoy.chainIdHex
            : config.sepolia.chainIdHex;
          await switchNetwork(targetHex);
          await new Promise((r) => setTimeout(r, 1500));
        }

        // 4) Get fresh signer for destination chain
        const destProvider = new ethers.providers.Web3Provider(window.ethereum);
        const destSigner = destProvider.getSigner();

        // 5) Execute destination chain operation
        const gasOverrides = await getGasOverrides(destChainId);
        let tx;
        if (isFromSepolia) {
          // Lock on Sepolia → Mint on Amoy
          const amoyBridge = new ethers.Contract(
            config.amoy.bridge,
            BridgeAmoyAbi,
            destSigner,
          );
          tx = await amoyBridge.mint(
            transfer.sender,
            transfer.amount,
            transfer.nonce,
            transfer.sourceChainId,
            signature,
            gasOverrides,
          );
        } else {
          // Burn on Amoy → Unlock on Sepolia
          const sepoliaBridge = new ethers.Contract(
            config.sepolia.bridge,
            BridgeSepoliaAbi,
            destSigner,
          );
          tx = await sepoliaBridge.unlock(
            transfer.sender,
            transfer.amount,
            transfer.nonce,
            transfer.sourceChainId,
            signature,
            gasOverrides,
          );
        }

        await tx.wait();

        // Mark completed
        dispatch(
          updateTransactionStatus({
            id: transfer.id,
            status: "completed",
            destTxHash: tx.hash,
          }),
        );
      } catch (err) {
        console.error("Validation error:", err);
        // Revert to pending on failure
        dispatch(
          updateTransactionStatus({
            id: transfer.id,
            status: "pending",
          }),
        );
        alert("Validation failed: " + (err.reason || err.message));
      } finally {
        setBusyId(null);
      }
    },
    [signer, account, chainId, switchNetwork, dispatch],
  );

  return (
    <div>
      <h2>Validator Dashboard</h2>
      <WalletConnect />

      {account && (
        <>
          <NetworkSwitch />

          {/* Validator Info */}
          <div className="card">
            <div className="info-row">
              <span>Validator Address:</span>
              <span>{shortenAddress(account)}</span>
            </div>
            <div className="info-row">
              <span>Connected Chain:</span>
              <span className="highlight">
                {chainId === SEPOLIA_CHAIN_ID
                  ? "Sepolia"
                  : chainId === AMOY_CHAIN_ID
                  ? "Amoy"
                  : `Chain ${chainId}`}
              </span>
            </div>
          </div>

          {/* Stats */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value pending-text">{pending.length}</div>
              <div className="stat-label">Pending</div>
            </div>
            <div className="stat-card">
              <div className="stat-value validated-text">
                {validated.length}
              </div>
              <div className="stat-label">Validated</div>
            </div>
            <div className="stat-card">
              <div className="stat-value completed-text">
                {completed.length}
              </div>
              <div className="stat-label">Completed</div>
            </div>
          </div>

          {/* ── Pending Transactions ──────────────────────── */}
          <h3 className="section-title">
            Pending Transactions ({pending.length})
          </h3>
          {pending.length === 0 ? (
            <div className="card muted">No pending transactions.</div>
          ) : (
            pending.map((tx) => (
              <TransactionCard
                key={tx.id}
                tx={tx}
                onValidate={handleValidateAndRelay}
                busy={busyId === tx.id}
                showAction
              />
            ))
          )}

          {/* ── Validated Transactions ────────────────────── */}
          <h3 className="section-title">
            Validated Transactions ({validated.length})
          </h3>
          {validated.length === 0 ? (
            <div className="card muted">No validated transactions.</div>
          ) : (
            validated.map((tx) => (
              <TransactionCard key={tx.id} tx={tx} busy={busyId === tx.id} />
            ))
          )}

          {/* ── Completed Transactions ────────────────────── */}
          <h3 className="section-title">
            Completed Transactions ({completed.length})
          </h3>
          {completed.length === 0 ? (
            <div className="card muted">No completed transactions.</div>
          ) : (
            completed.map((tx) => <TransactionCard key={tx.id} tx={tx} />)
          )}
        </>
      )}
    </div>
  );
}

// ── Transaction Card ───────────────────────────────────────
function TransactionCard({ tx, onValidate, busy, showAction }) {
  return (
    <div className="validator-card">
      <div className="validator-card-header">
        <span className="validator-type">{tx.type}</span>
        <span className={`badge badge-${tx.status}`}>{tx.status}</span>
      </div>

      <div className="info-row">
        <span>Sender:</span>
        <span>{shortenAddress(tx.sender)}</span>
      </div>
      <div className="info-row">
        <span>Amount:</span>
        <span>{tx.amountFormatted} BRT</span>
      </div>
      <div className="info-row">
        <span>Route:</span>
        <span>
          {tx.sourceChain} → {tx.destChain}
        </span>
      </div>
      <div className="info-row">
        <span>Nonce:</span>
        <span>{tx.nonce}</span>
      </div>
      <div className="info-row">
        <span>Time:</span>
        <span>{new Date(tx.timestamp).toLocaleString()}</span>
      </div>

      <div style={{ marginTop: 4 }}>
        <span style={{ color: "#888", fontSize: 12 }}>Source Tx: </span>
        <span className="hash" style={{ fontSize: 12 }}>
          {tx.txHash}
        </span>
      </div>
      {tx.destTxHash && (
        <div style={{ marginTop: 2 }}>
          <span style={{ color: "#888", fontSize: 12 }}>Dest Tx: </span>
          <span className="hash" style={{ fontSize: 12 }}>
            {tx.destTxHash}
          </span>
        </div>
      )}

      {showAction && onValidate && (
        <button
          className="btn-success"
          style={{ marginTop: 10, width: "100%" }}
          onClick={() => onValidate(tx)}
          disabled={busy}
        >
          {busy ? "Processing..." : "Validate & Relay"}
        </button>
      )}
    </div>
  );
}
