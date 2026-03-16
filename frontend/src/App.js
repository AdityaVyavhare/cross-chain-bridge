import React, { useState } from "react";
import { BridgeProvider, useBridge } from "./context/BridgeContext";
import useBridgeEvents from "./hooks/useBridgeEvents";
import { shortenAddress } from "./utils/contracts";
import config from "./config";
import Home from "./pages/Home";
import PatientDashboard from "./pages/PatientDashboard";
import HospitalDashboard from "./pages/HospitalDashboard";
import ValidatorDashboard from "./pages/ValidatorDashboard";

/* ── SVG Icons ─────────────────────────────────────────── */
const IconHeart = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
  </svg>
);
const IconUser = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
);
const IconBuilding = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22V12h6v10M9 6h.01M15 6h.01M9 10h.01M15 10h.01"/></svg>
);
const IconShield = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
);
const IconFile = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
);
const IconKey = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.78 7.78 5.5 5.5 0 017.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
);
const IconLink = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
);
const IconDollar = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
);
const IconActivity = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
);
const IconRadio = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16.72 11.06A10.94 10.94 0 0119 12.55"/><path d="M5 12.55a10.94 10.94 0 012.28-1.49"/><path d="M10.71 5.05A16 16 0 0122 12"/><path d="M2 12a16 16 0 0111.29-6.95"/><circle cx="12" cy="12" r="2"/></svg>
);

function AppContent() {
  const [page, setPage] = useState("home");
  const [role, setRole] = useState(null); // 'patient' | 'hospital' | 'validator'
  const [subPage, setSubPage] = useState("dashboard");
  const { account, connectWallet, chainId, networkConfig, switchNetwork } = useBridge();

  useBridgeEvents();

  const chainName = networkConfig ? networkConfig.name : chainId ? `Chain ${chainId}` : "";

  const goHome = () => { setPage("home"); setRole(null); setSubPage("dashboard"); };
  const enterRole = (r) => { setRole(r); setPage("dashboard"); setSubPage("dashboard"); };

  // If on landing/home page, show full-width landing
  if (page === "home") {
    return <Home onGetStarted={() => setPage("select-role")} onConnect={connectWallet} account={account} />;
  }

  // Role selection
  if (page === "select-role") {
    return (
      <div className="landing-page">
        <nav className="landing-nav">
          <div className="logo" style={{ cursor: "pointer" }} onClick={goHome}>
            <span style={{ color: "#0d9488" }}><IconHeart /></span>
            HealthBridge
          </div>
          {account && (
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <span className="topbar-chip"><span style={{ color: "#0d9488" }}>{chainName}</span></span>
              <span className="topbar-chip"><span className="dot"></span>{shortenAddress(account)}</span>
            </div>
          )}
        </nav>
        <div className="role-page">
          <h1>Select Your Role</h1>
          <p>Choose how you want to interact with the HealthBridge platform.</p>
          <div className="role-cards">
            <div className="role-card" onClick={() => enterRole("patient")}>
              <div className="role-card-icon"><IconUser /></div>
              <h3>Patient</h3>
              <p>View medical records, manage consent, and bridge NFTs across chains.</p>
              <button className="btn btn-primary btn-full">Enter as Patient</button>
            </div>
            <div className="role-card" onClick={() => enterRole("hospital")}>
              <div className="role-card-icon"><IconBuilding /></div>
              <h3>Hospital</h3>
              <p>Upload medical records, encrypt data, and mint Medical Record NFTs.</p>
              <button className="btn btn-primary btn-full">Enter as Hospital</button>
            </div>
            <div className="role-card" onClick={() => enterRole("validator")}>
              <div className="role-card-icon"><IconShield /></div>
              <h3>Validator</h3>
              <p>Monitor bridge events, validate transactions, and relay cross-chain data.</p>
              <button className="btn btn-primary btn-full">Enter as Validator</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Dashboard with sidebar
  const navItems = getNavItems(role, subPage);

  return (
    <div className="dashboard-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo" onClick={goHome}>
          <span style={{ color: "#0d9488" }}><IconHeart /></span>
          HealthBridge
        </div>

        {account && (
          <div className="sidebar-profile">
            <div className="sidebar-profile-icon">
              {role === "hospital" ? <IconBuilding /> : role === "validator" ? <IconShield /> : <IconUser />}
            </div>
            <div className="sidebar-profile-name">
              {role === "hospital" ? "Hospital" : role === "validator" ? "Validator Node" : "Patient"}
            </div>
            <div className="sidebar-profile-addr">{shortenAddress(account)}</div>
            <div className="sidebar-profile-badge">
              {role === "hospital" ? "Validator Node Active" : role === "validator" ? "Node Online" : "Patient Active"}
            </div>
          </div>
        )}

        {/* Network Switcher */}
        {account && (
          <div style={{ padding: "0 12px 12px", display: "flex", gap: 6 }}>
            <button
              className="btn btn-sm"
              style={{
                flex: 1,
                background: chainId === config.sepolia.chainId ? "#0d9488" : "#f1f5f9",
                color: chainId === config.sepolia.chainId ? "#fff" : "#64748b",
                border: "1px solid #e2e8f0",
                fontSize: 12,
                padding: "7px 0",
                justifyContent: "center",
              }}
              onClick={() => switchNetwork(config.sepolia.chainIdHex)}
            >
              Sepolia
            </button>
            <button
              className="btn btn-sm"
              style={{
                flex: 1,
                background: chainId === config.amoy.chainId ? "#0d9488" : "#f1f5f9",
                color: chainId === config.amoy.chainId ? "#fff" : "#64748b",
                border: "1px solid #e2e8f0",
                fontSize: 12,
                padding: "7px 0",
                justifyContent: "center",
              }}
              onClick={() => switchNetwork(config.amoy.chainIdHex)}
            >
              Amoy
            </button>
          </div>
        )}

        <div className="sidebar-section-label">
          {role === "hospital" ? "Hospital Navigation" : role === "validator" ? "Validator Control" : "Patient Navigation"}
        </div>

        <div className="sidebar-nav">
          {navItems.map((item) => (
            <button
              key={item.key}
              className={`sidebar-nav-item ${subPage === item.key ? "active" : ""}`}
              onClick={() => setSubPage(item.key)}
            >
              {item.icon}
              {item.label}
              {item.badge && <span className="nav-badge">{item.badge}</span>}
            </button>
          ))}
        </div>

        {/* Switch Role */}
        <div style={{ padding: "0 12px", marginBottom: 8 }}>
          <div className="sidebar-section-label" style={{ padding: 0 }}>Switch Role</div>
          <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
            {["patient", "hospital", "validator"].map((r) => (
              <button
                key={r}
                onClick={() => enterRole(r)}
                style={{
                  flex: 1,
                  padding: "6px 0",
                  border: role === r ? "2px solid #0d9488" : "1px solid #e2e8f0",
                  borderRadius: 6,
                  background: role === r ? "#f0fdf9" : "#fff",
                  color: role === r ? "#0d9488" : "#64748b",
                  fontSize: 11,
                  fontWeight: role === r ? 700 : 500,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textTransform: "capitalize",
                }}
              >
                {r === "patient" ? "Patient" : r === "hospital" ? "Hospital" : "Validator"}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="main-content">
        {!account ? (
          <div className="connect-prompt">
            <h2>Connect Your Wallet</h2>
            <p>Please connect your MetaMask wallet to access the dashboard.</p>
            <button className="btn btn-primary btn-lg" onClick={connectWallet}>Connect MetaMask</button>
          </div>
        ) : (
          renderDashboardContent(role, subPage)
        )}
      </main>
    </div>
  );
}

function getNavItems(role, subPage) {
  if (role === "patient") {
    return [
      { key: "dashboard", label: "Dashboard", icon: <IconFile /> },
      { key: "records", label: "My Records", icon: <IconFile /> },
      { key: "consent", label: "Grant Access", icon: <IconKey /> },
      { key: "bridge-nft", label: "Bridge NFT", icon: <IconLink /> },
      { key: "bridge-brt", label: "Bridge BRT", icon: <IconDollar /> },
      { key: "activity", label: "Activity History", icon: <IconActivity /> },
    ];
  }
  if (role === "hospital") {
    return [
      { key: "dashboard", label: "Upload & Mint", icon: <IconFile /> },
      { key: "history", label: "Mint History", icon: <IconActivity /> },
      { key: "patients", label: "Manage Patients", icon: <IconUser /> },
    ];
  }
  if (role === "validator") {
    return [
      { key: "dashboard", label: "Pending Queue", icon: <IconShield /> },
      { key: "processed", label: "Processed TXs", icon: <IconActivity /> },
      { key: "status", label: "Node Status", icon: <IconRadio /> },
      { key: "events", label: "Event Listener", icon: <IconActivity /> },
    ];
  }
  return [];
}

function renderDashboardContent(role, subPage) {
  if (role === "patient") {
    return <PatientDashboard subPage={subPage} />;
  }
  if (role === "hospital") {
    return <HospitalDashboard subPage={subPage} />;
  }
  if (role === "validator") {
    return <ValidatorDashboard subPage={subPage} />;
  }
  return null;
}

export default function App() {
  return (
    <BridgeProvider>
      <AppContent />
    </BridgeProvider>
  );
}
