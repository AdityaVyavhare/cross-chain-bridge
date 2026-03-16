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
  getGasOverrides,
  isSepolia,
  isAmoy,
  formatAmount,
} from "../utils/contracts";
import { addTransaction } from "../slices/bridgeSlice";
import config from "../config";

export default function Transfer() {
  const { account, signer, provider, chainId, networkConfig, isSupported } =
    useBridge();
  const dispatch = useDispatch();

  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState(null);
  const [statusType, setStatusType] = useState("info");
  const [loading, setLoading] = useState(false);
  const [allowance, setAllowance] = useState(null);
  const [approving, setApproving] = useState(false);
  const [bridgeFee, setBridgeFee] = useState(null);

  const setMsg = (msg, type = "info") => {
    setStatus(msg);
    setStatusType(type);
  };

  const onSepolia = isSepolia(chainId);
  const sourceChain = onSepolia ? "Sepolia" : "Amoy";
  const destChain = onSepolia ? "Amoy" : "Sepolia";

  // Fetch allowance + bridge fee
  const fetchAllowance = useCallback(async () => {
    if (!account || !provider || !networkConfig?.bridge) return;
    try {
      const token = getTokenContract(networkConfig, provider);
      if (!token) return;
      const result = await token.allowance(account, networkConfig.bridge);
      setAllowance(result);

      const bridge = getBridgeContract(networkConfig, provider);
      if (bridge) {
        const fee = await bridge.bridgeFee();
        setBridgeFee(fee);
      }
    } catch (err) {
      console.warn("Allowance fetch error:", err.message);
    }
  }, [account, provider, networkConfig]);

  useEffect(() => {
    fetchAllowance();
  }, [fetchAllowance, chainId]);

  // Total needed = amount + bridgeFee
  const getTotalNeeded = () => {
    if (!amount || !bridgeFee) return null;
    try {
      return ethers.utils.parseEther(amount).add(bridgeFee);
    } catch {
      return null;
    }
  };

  const hasEnoughAllowance = () => {
    const total = getTotalNeeded();
    if (!total || !allowance) return false;
    return allowance.gte(total);
  };

  // Approve
  const handleApprove = async () => {
    if (!amount || !signer || !networkConfig) return;
    setApproving(true);
    setMsg("Approving BRT tokens for bridge...");
    try {
      const token = getTokenContract(networkConfig, signer);
      const total = getTotalNeeded();
      const gasOverrides = await getGasOverrides(chainId);
      const tx = await token.approve(networkConfig.bridge, total, gasOverrides);
      setMsg("Waiting for approval confirmation...");
      await tx.wait();
      await fetchAllowance();
      setMsg("Approved! Now click Transfer.", "success");
    } catch (err) {
      setMsg("Approve failed: " + (err.reason || err.message), "error");
    }
    setApproving(false);
  };

  // Transfer
  const handleTransfer = async () => {
    if (!amount || !signer || !networkConfig) return;
    if (!hasEnoughAllowance()) {
      setMsg("Insufficient allowance. Approve first.", "error");
      return;
    }

    setLoading(true);
    try {
      const bridge = getBridgeContract(networkConfig, signer);
      const weiAmount = ethers.utils.parseEther(amount);
      const gasOverrides = await getGasOverrides(chainId);

      if (onSepolia) {
        setMsg("Locking BRT on Sepolia...");
        const tx = await bridge.lockTokens(weiAmount, gasOverrides);
        setMsg("Waiting for confirmation...");
        const receipt = await tx.wait();

        const event = receipt.events?.find((e) => e.event === "TokenLocked");
        const nonce = event ? event.args.nonce.toString() : "?";

        dispatch(
          addTransaction({
            id: `token-Sepolia-${nonce}`,
            type: "BRT Lock -> Mint",
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
        setMsg("Burning BRT on Amoy...");
        const tx = await bridge.burnTokens(weiAmount, gasOverrides);
        setMsg("Waiting for confirmation...");
        const receipt = await tx.wait();

        const event = receipt.events?.find((e) => e.event === "TokenBurned");
        const nonce = event ? event.args.nonce.toString() : "?";

        dispatch(
          addTransaction({
            id: `token-Amoy-${nonce}`,
            type: "BRT Burn -> Unlock",
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
      await fetchAllowance();
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
              <div className="card">
                <TokenBalance />
                <div className="info-row">
                  <span>Source Chain:</span>
                  <span className="highlight">{sourceChain}</span>
                </div>
                <div className="info-row">
                  <span>Destination:</span>
                  <span className="highlight">{destChain}</span>
                </div>
                <div className="info-row">
                  <span>Bridge Fee:</span>
                  <span>
                    {bridgeFee ? formatAmount(bridgeFee) + " BRT" : "..."}
                  </span>
                </div>
                <div className="info-row">
                  <span>Mechanism:</span>
                  <span>{onSepolia ? "Lock -> Mint" : "Burn -> Unlock"}</span>
                </div>
              </div>

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

                {amount && allowance !== null && (
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
                        )} BRT — approval needed for ${amount} BRT + fee`}
                  </div>
                )}

                <div className="btn-row">
                  <button
                    className="btn-secondary"
                    onClick={handleApprove}
                    disabled={approving || loading || !amount}
                  >
                    {approving
                      ? "Approving..."
                      : hasEnoughAllowance()
                      ? "Approved"
                      : "1. Approve"}
                  </button>
                  <button
                    className="btn-primary"
                    onClick={handleTransfer}
                    disabled={loading || !amount || !hasEnoughAllowance()}
                  >
                    {loading
                      ? "Processing..."
                      : onSepolia
                      ? "2. Lock & Bridge"
                      : "2. Burn & Bridge"}
                  </button>
                </div>

                {status && (
                  <div className={`status ${statusType}`}>{status}</div>
                )}
              </div>
            </>
          ) : (
            <div className="status error">
              Switch to Sepolia or Polygon Amoy to use the bridge.
            </div>
          )}
        </>
      )}
    </div>
  );
}
