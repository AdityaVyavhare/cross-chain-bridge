import React, { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { useDispatch } from "react-redux";
import { useBridge } from "../context/BridgeContext";
import WalletConnect from "../components/WalletConnect";
import NetworkSwitch from "../components/NetworkSwitch";
import TokenBalance from "../components/TokenBalance";
import {
  getTokenContract,
  getBridgeContract,
  isSepolia,
  isAmoy,
  formatAmount,
} from "../utils/contracts";
import { addTransaction } from "../slices/bridgeSlice";
import config from "../config";

// Fetch gas price from direct RPC (not MetaMask) and force legacy tx.
// Amoy's EIP-1559 estimates are broken (1.5 gwei vs 66 gwei needed).
// Using type:0 prevents MetaMask from converting to type-2 with bad fees.
async function getGasOverrides(chainId) {
  try {
    const rpcUrl = chainId === config.amoy.chainId
      ? config.amoy.rpc
      : config.sepolia.rpc;
    const directProvider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const gasPrice = await directProvider.getGasPrice();
    const buffered = gasPrice.mul(120).div(100);
    return { gasPrice: buffered, type: 0 };
  } catch {
    return {};
  }
}

export default function Transfer() {
  const { account, signer, provider, chainId, networkConfig, isSupported } =
    useBridge();
  const dispatch = useDispatch();

  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState(null);
  const [statusType, setStatusType] = useState("info");
  const [loading, setLoading] = useState(false);
  const [allowance, setAllowance] = useState(null); // null = not fetched
  const [approving, setApproving] = useState(false);

  const setMsg = (msg, type = "info") => {
    setStatus(msg);
    setStatusType(type);
  };

  // Determine direction
  const onSepolia = isSepolia(chainId);
  const onAmoy = isAmoy(chainId);

  const sourceChain = onSepolia ? "Sepolia" : "Amoy";
  const destChain = onSepolia ? "Amoy" : "Sepolia";

  // ── Fetch current allowance ─────────────────────────────
  const fetchAllowance = useCallback(async () => {
    if (
      !account ||
      !provider ||
      !networkConfig?.token ||
      !networkConfig?.bridge
    )
      return;
    if (!ethers.utils.isAddress(networkConfig.token)) return;
    try {
      const token = getTokenContract(networkConfig, provider);
      if (!token) return;
      const result = await token.allowance(account, networkConfig.bridge);
      setAllowance(result);
    } catch (err) {
      console.warn("Allowance fetch error:", err.message);
    }
  }, [account, provider, networkConfig]);

  useEffect(() => {
    fetchAllowance();
  }, [fetchAllowance, chainId]);

  // Check if user has enough allowance for the entered amount
  // Only relevant on Sepolia — Amoy burn doesn't need approval
  const needsApproval = onSepolia;
  const hasEnoughAllowance = () => {
    if (!needsApproval) return true; // Amoy burn doesn't need approval
    if (!amount || !allowance) return false;
    try {
      const weiAmount = ethers.utils.parseEther(amount);
      return allowance.gte(weiAmount);
    } catch {
      return false;
    }
  };

  // Approve tokens for bridge (only needed on Sepolia — lock uses transferFrom)
  const handleApprove = async () => {
    if (!amount || !signer || !networkConfig) return;
    setApproving(true);
    setMsg("Approving BRT tokens for bridge...");
    try {
      const token = getTokenContract(networkConfig, signer);
      const weiAmount = ethers.utils.parseEther(amount);
      const gasOverrides = await getGasOverrides(chainId);
      const tx = await token.approve(networkConfig.bridge, weiAmount, gasOverrides);
      setMsg("Waiting for approval confirmation...");
      await tx.wait();
      await fetchAllowance();
      setMsg("Approved! Now click Transfer.", "success");
    } catch (err) {
      setMsg("Approve failed: " + (err.reason || err.message), "error");
    }
    setApproving(false);
  };

  // Main transfer handler
  const handleTransfer = async () => {
    if (!amount || !signer || !networkConfig) return;

    // Enforce approval before transfer (Sepolia only — Amoy burn doesn't need it)
    if (needsApproval && !hasEnoughAllowance()) {
      setMsg(
        "Insufficient allowance. Please approve BRT tokens first.",
        "error",
      );
      return;
    }

    setLoading(true);

    try {
      const bridge = getBridgeContract(networkConfig, signer);
      const weiAmount = ethers.utils.parseEther(amount);

      if (onSepolia) {
        // Lock on Sepolia → Mint on Amoy
        setMsg("Locking BRT on Sepolia...");
        const gasOverrides = await getGasOverrides(chainId);
        const tx = await bridge.lock(weiAmount, gasOverrides);
        setMsg("Waiting for confirmation...");
        const receipt = await tx.wait();

        // Parse nonce from TokensLocked event
        const lockedEvent = receipt.events?.find(
          (e) => e.event === "TokensLocked",
        );
        const nonce = lockedEvent ? lockedEvent.args.nonce.toString() : "?";

        // Dispatch to Redux store (event listener will also pick this up)
        dispatch(
          addTransaction({
            id: `Sepolia-${nonce}`,
            type: "Lock → Mint",
            sourceChain: "Sepolia",
            destChain: "Amoy",
            sourceChainId: config.sepolia.chainId,
            destChainId: config.amoy.chainId,
            sender: account,
            amount: weiAmount.toString(),
            amountFormatted: parseFloat(amount).toFixed(4),
            nonce,
            txHash: receipt.transactionHash,
            timestamp: Date.now(),
            status: "pending",
          }),
        );

        setMsg(`Locked ${amount} BRT! Validator will mint on Amoy.`, "success");
      } else {
        // Burn on Amoy → Unlock on Sepolia
        setMsg("Burning BRT on Amoy...");
        const gasOverrides = await getGasOverrides(chainId);
        const tx = await bridge.burn(weiAmount, gasOverrides);
        setMsg("Waiting for confirmation...");
        const receipt = await tx.wait();

        const burnedEvent = receipt.events?.find(
          (e) => e.event === "TokensBurned",
        );
        const nonce = burnedEvent ? burnedEvent.args.nonce.toString() : "?";

        dispatch(
          addTransaction({
            id: `Amoy-${nonce}`,
            type: "Burn → Unlock",
            sourceChain: "Amoy",
            destChain: "Sepolia",
            sourceChainId: config.amoy.chainId,
            destChainId: config.sepolia.chainId,
            sender: account,
            amount: weiAmount.toString(),
            amountFormatted: parseFloat(amount).toFixed(4),
            nonce,
            txHash: receipt.transactionHash,
            timestamp: Date.now(),
            status: "pending",
          }),
        );

        setMsg(
          `Burned ${amount} BRT! Validator will unlock on Sepolia.`,
          "success",
        );
      }

      setAmount("");
      await fetchAllowance(); // Refresh allowance after transfer
    } catch (err) {
      setMsg("Transfer failed: " + (err.reason || err.message), "error");
    }
    setLoading(false);
  };

  return (
    <div>
      <h2>Bridge Transfer</h2>
      <WalletConnect />

      {account && (
        <>
          <NetworkSwitch />

          {isSupported ? (
            <>
              {/* Balance & Network Info */}
              <div className="card">
                <TokenBalance />
                <div className="info-row">
                  <span>Source Chain:</span>
                  <span className="highlight">{sourceChain}</span>
                </div>
                <div className="info-row">
                  <span>Destination Chain:</span>
                  <span className="highlight">{destChain}</span>
                </div>
                <div className="info-row">
                  <span>Mechanism:</span>
                  <span>{onSepolia ? "Lock → Mint" : "Burn → Unlock"}</span>
                </div>
              </div>

              {/* Transfer Form */}
              <div className="card">
                <label className="input-label">BRT Amount</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="Enter amount (e.g. 100)"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />

                {/* Allowance Status (Sepolia only — Amoy burn doesn't need approval) */}
                {needsApproval && amount && allowance !== null && (
                  <div
                    className={`status ${
                      hasEnoughAllowance() ? "success" : "info"
                    }`}
                    style={{ marginTop: 8 }}
                  >
                    {hasEnoughAllowance()
                      ? `Allowance sufficient (${formatAmount(
                          allowance,
                        )} BRT approved)`
                      : `Allowance: ${formatAmount(
                          allowance,
                        )} BRT — approval needed`}
                  </div>
                )}

                <div className="btn-row">
                  {needsApproval && (
                    <button
                      className="btn-secondary"
                      onClick={handleApprove}
                      disabled={approving || loading || !amount}
                    >
                      {approving
                        ? "Approving..."
                        : hasEnoughAllowance()
                        ? "✓ Approved"
                        : "1. Approve"}
                    </button>
                  )}
                  <button
                    className="btn-primary"
                    onClick={handleTransfer}
                    disabled={
                      loading ||
                      !amount ||
                      (needsApproval && !hasEnoughAllowance())
                    }
                  >
                    {loading
                      ? "Processing..."
                      : onSepolia
                      ? "2. Lock & Bridge →"
                      : "Burn & Bridge →"}
                  </button>
                </div>

                {status && (
                  <div className={`status ${statusType}`}>{status}</div>
                )}
              </div>
            </>
          ) : (
            <div className="status error">
              Please switch to Sepolia or Polygon Amoy to use the bridge.
            </div>
          )}
        </>
      )}
    </div>
  );
}
