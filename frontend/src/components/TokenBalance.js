import React, { useEffect, useState, useCallback, useRef } from "react";
import { ethers } from "ethers";
import { useSelector } from "react-redux";
import { useBridge } from "../context/BridgeContext";
import { getTokenContract, formatAmount } from "../utils/contracts";
import { selectCompletedTransactions } from "../slices/bridgeSlice";

export default function TokenBalance() {
  const { account, provider, networkConfig, chainId } = useBridge();
  const [balance, setBalance] = useState("0.0000");
  const [loading, setLoading] = useState(false);

  // Track completed transaction count to trigger immediate refresh
  const completed = useSelector(selectCompletedTransactions);
  const completedCount = completed.length;
  const prevCountRef = useRef(completedCount);

  const fetchBalance = useCallback(async () => {
    // Guard: all three must be truthy before we attempt a read
    if (!account || !provider || !networkConfig || !networkConfig.token) {
      setBalance("0.0000");
      return;
    }

    // Validate that the token address is a real address
    if (!ethers.utils.isAddress(networkConfig.token)) {
      console.warn("Token address not configured for", networkConfig.name);
      setBalance("0.0000");
      return;
    }

    try {
      setLoading(true);
      // Use provider (read-only) — no signer needed for balanceOf
      const token = getTokenContract(networkConfig, provider);
      if (!token) {
        setBalance("0.0000");
        return;
      }
      const bal = await token.balanceOf(account);
      setBalance(formatAmount(bal));
    } catch (err) {
      console.error("Balance fetch error:", err.message);
      setBalance("0.0000");
    } finally {
      setLoading(false);
    }
  }, [account, provider, networkConfig]);

  // Fetch on mount + whenever account, provider, networkConfig, or chainId changes
  useEffect(() => {
    fetchBalance();
    const interval = setInterval(fetchBalance, 10000);
    return () => clearInterval(interval);
  }, [fetchBalance, chainId]);

  // Trigger immediate refresh when a new transaction completes
  useEffect(() => {
    if (completedCount > prevCountRef.current) {
      // Small delay to let the chain state settle
      const timer = setTimeout(fetchBalance, 2000);
      prevCountRef.current = completedCount;
      return () => clearTimeout(timer);
    }
    prevCountRef.current = completedCount;
  }, [completedCount, fetchBalance]);

  return (
    <div className="info-row">
      <span>BRT Balance:</span>
      <span>{loading ? "..." : balance}</span>
    </div>
  );
}
