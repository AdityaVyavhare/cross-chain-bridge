import React, { useState } from "react";
import { BridgeProvider } from "./context/BridgeContext";
import useBridgeEvents from "./hooks/useBridgeEvents";
import Home from "./pages/Home";
import Transfer from "./pages/Transfer";
import History from "./pages/History";
import ValidatorDashboard from "./pages/ValidatorDashboard";

const PAGES = {
  home: "Home",
  transfer: "Transfer",
  history: "History",
  validator: "Validator",
};

function AppContent() {
  const [page, setPage] = useState("home");

  // Boot real-time event listeners (Redux)
  useBridgeEvents();

  return (
    <div className="app">
      <header className="app-header">
        <h1>&#x26D3; Cross-Chain Bridge</h1>
        <p className="subtitle">
          Sepolia &#x2194; Polygon Amoy &middot; BRT Token
        </p>
      </header>

      <nav>
        {Object.entries(PAGES).map(([key, label]) => (
          <button
            key={key}
            className={page === key ? "active" : ""}
            onClick={() => setPage(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      <main>
        {page === "home" && <Home />}
        {page === "transfer" && <Transfer />}
        {page === "history" && <History />}
        {page === "validator" && <ValidatorDashboard />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BridgeProvider>
      <AppContent />
    </BridgeProvider>
  );
}
