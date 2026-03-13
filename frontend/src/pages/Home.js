import React from "react";
import { useSelector } from "react-redux";
import WalletConnect from "../components/WalletConnect";
import NetworkSwitch from "../components/NetworkSwitch";
import TokenBalance from "../components/TokenBalance";
import { useBridge } from "../context/BridgeContext";
import {
  selectAllTransactions,
  selectPendingTransactions,
  selectCompletedTransactions,
} from "../slices/bridgeSlice";

export default function Home() {
  const { account, isSupported } = useBridge();
  const allTx = useSelector(selectAllTransactions);
  const pending = useSelector(selectPendingTransactions);
  const completed = useSelector(selectCompletedTransactions);

  return (
    <div>
      <h2>Dashboard</h2>
      <WalletConnect />

      {account && (
        <>
          <NetworkSwitch />

          {isSupported && (
            <div className="card">
              <TokenBalance />
            </div>
          )}

          {/* Stats Overview */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{allTx.length}</div>
              <div className="stat-label">Total Transfers</div>
            </div>
            <div className="stat-card">
              <div className="stat-value pending-text">{pending.length}</div>
              <div className="stat-label">Pending</div>
            </div>
            <div className="stat-card">
              <div className="stat-value completed-text">
                {completed.length}
              </div>
              <div className="stat-label">Completed</div>
            </div>
          </div>

          {/* How it works */}
          <div className="card">
            <h3 style={{ marginBottom: 12, color: "#9fa8da" }}>
              How the Bridge Works
            </h3>
            <div className="info-row">
              <span>Sepolia → Amoy</span>
              <span>Lock BRT → Validator mints on Amoy</span>
            </div>
            <div className="info-row">
              <span>Amoy → Sepolia</span>
              <span>Burn BRT → Validator unlocks on Sepolia</span>
            </div>
            <div className="info-row">
              <span>Token</span>
              <span>BRT (Bridge Token)</span>
            </div>
          </div>

          {/* Recent activity */}
          {allTx.length > 0 && (
            <>
              <h3 className="section-title">Recent Activity</h3>
              {allTx.slice(0, 5).map((tx) => (
                <div key={tx.id} className="history-item">
                  <div className="info-row">
                    <span>{tx.type}</span>
                    <span className={`badge badge-${tx.status}`}>
                      {tx.status}
                    </span>
                  </div>
                  <div className="info-row">
                    <span>Amount:</span>
                    <span>{tx.amountFormatted} BRT</span>
                  </div>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
