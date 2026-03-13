import React from "react";
import { useSelector } from "react-redux";
import { selectAllTransactions } from "../slices/bridgeSlice";
import { shortenAddress } from "../utils/contracts";

export default function History() {
  const transactions = useSelector(selectAllTransactions);

  return (
    <div>
      <h2>Transaction History</h2>

      {transactions.length === 0 ? (
        <div className="card" style={{ color: "#888" }}>
          No transactions yet. Bridge some BRT tokens to see them here.
        </div>
      ) : (
        transactions.map((tx) => (
          <div key={tx.id} className="history-item">
            <div className="info-row">
              <span>Type:</span>
              <span>{tx.type}</span>
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
              <span>Status:</span>
              <span className={`badge badge-${tx.status}`}>{tx.status}</span>
            </div>
            <div className="info-row">
              <span>Time:</span>
              <span>{new Date(tx.timestamp).toLocaleString()}</span>
            </div>
            <div style={{ marginTop: 4 }}>
              <span style={{ color: "#888", fontSize: 12 }}>Tx: </span>
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
          </div>
        ))
      )}
    </div>
  );
}
