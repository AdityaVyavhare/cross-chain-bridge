import React from "react";
import { useSelector } from "react-redux";
import { selectAllTransactions } from "../slices/bridgeSlice";
import { shortenAddress } from "../utils/contracts";

export default function Activity() {
  const transactions = useSelector(selectAllTransactions);

  return (
    <div>
      <div className="topbar">
        <div className="topbar-left">
          <h1>Activity History</h1>
          <p>Complete log of all bridge transactions and events.</p>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>All Transactions</h2>
        </div>

        {transactions.length === 0 ? (
          <div className="empty-state">
            <p>No activity yet. Create records, bridge NFTs, or transfer BRT tokens to see events here.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Event Type</th>
                <th>Details</th>
                <th>Route</th>
                <th>Sender</th>
                <th>Status</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => {
                const isNFT = tx.type.includes("NFT");
                return (
                  <tr key={tx.id}>
                    <td>
                      <span className={isNFT ? "badge badge-nft" : "badge badge-token"}>
                        {isNFT ? "Medical NFT" : "Token"}
                      </span>
                    </td>
                    <td>
                      <span className="cell-main">{tx.type}</span>
                      <span className="cell-sub">
                        {isNFT ? `Token #${tx.tokenId || "?"}` : `${tx.amountFormatted || "?"} BRT`}
                      </span>
                    </td>
                    <td>
                      <span className="route-text">
                        {tx.sourceChain} &rarr; {tx.destChain}
                      </span>
                    </td>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                      {shortenAddress(tx.sender)}
                    </td>
                    <td>
                      <span className={`badge badge-${tx.status}`}>{tx.status}</span>
                    </td>
                    <td>
                      <span className="cell-main">{new Date(tx.timestamp).toLocaleTimeString()}</span>
                      <span className="cell-sub">{new Date(tx.timestamp).toLocaleDateString()}</span>
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
