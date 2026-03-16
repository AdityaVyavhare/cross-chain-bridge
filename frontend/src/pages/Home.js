import React from "react";

export default function Home({ onGetStarted, onConnect, account }) {
  return (
    <div className="landing-page">
      {/* ── Navbar ────────────────────────────────────────── */}
      <nav className="landing-nav">
        <div className="logo">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
          </svg>
          HealthBridge
        </div>
        <div className="landing-nav-links">
          <a href="#features">Features</a>
          <a href="#how-it-works">How It Works</a>
          <a href="#networks">Networks</a>
          {!account ? (
            <button className="btn btn-primary" onClick={onConnect}>Connect Wallet</button>
          ) : (
            <button className="btn btn-primary" onClick={onGetStarted}>Dashboard</button>
          )}
        </div>
      </nav>

      {/* ── Hero ──────────────────────────────────────────── */}
      <section className="hero">
        <div className="hero-badge">Blockchain Healthcare Platform</div>
        <h1>Secure Cross-Chain Medical Records</h1>
        <p>
          Manage encrypted medical records as soulbound NFTs. Bridge health data
          securely between Ethereum Sepolia and Polygon Amoy with validator-backed
          cross-chain transfers.
        </p>
        <div className="hero-buttons">
          <button className="btn btn-primary btn-lg" onClick={onGetStarted}>
            Get Started
          </button>
          <button className="btn btn-outline btn-lg" onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}>
            Learn More
          </button>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────── */}
      <section className="features-section" id="features">
        <h2>Key Features</h2>
        <p>Everything you need for secure, decentralized medical record management.</p>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <h3>Soulbound NFTs</h3>
            <p>Medical records are minted as non-transferable NFTs, permanently linked to patient wallets for tamper-proof ownership.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
            </div>
            <h3>Cross-Chain Bridge</h3>
            <p>Seamlessly bridge medical record NFTs and BRT tokens between Ethereum Sepolia and Polygon Amoy.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.78 7.78 5.5 5.5 0 017.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
            </div>
            <h3>Consent Management</h3>
            <p>Patients control who can access their records. Grant or revoke hospital access per record at any time.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
            </div>
            <h3>Validator Network</h3>
            <p>Decentralized validators sign and relay cross-chain transactions ensuring security and integrity.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            </div>
            <h3>IPFS Storage</h3>
            <p>Medical files are encrypted and stored on IPFS via Pinata, with only the encrypted hash stored on-chain.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
            </div>
            <h3>BRT Token Economy</h3>
            <p>The BRT token powers the ecosystem — used for minting fees, bridge fees, and validator rewards.</p>
          </div>
        </div>
      </section>

      {/* ── How It Works ──────────────────────────────────── */}
      <section className="how-section" id="how-it-works">
        <h2>How It Works</h2>
        <p>Simple 4-step process to manage and bridge medical records.</p>
        <div className="how-flow">
          <div className="how-step">
            <div className="how-step-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </div>
            <span>Upload Record</span>
          </div>
          <span className="how-arrow">&rarr;</span>
          <div className="how-step">
            <div className="how-step-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
            </div>
            <span>Encrypt & Store IPFS</span>
          </div>
          <span className="how-arrow">&rarr;</span>
          <div className="how-step">
            <div className="how-step-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <span>Mint NFT</span>
          </div>
          <span className="how-arrow">&rarr;</span>
          <div className="how-step">
            <div className="how-step-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
            </div>
            <span>Bridge Cross-Chain</span>
          </div>
        </div>
      </section>

      {/* ── Supported Networks ────────────────────────────── */}
      <section className="networks-section" id="networks">
        <h2>Supported Networks</h2>
        <p>Bridge medical records and tokens between these testnets.</p>
        <div className="networks-row">
          <div className="network-card">
            <div className="net-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>
            </div>
            Ethereum Sepolia
          </div>
          <div className="network-card">
            <div className="net-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            </div>
            Polygon Amoy
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────── */}
      <footer className="landing-footer">
        <div className="footer-brand">
          <div className="logo">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
            HealthBridge
          </div>
          <p>Secure, decentralized healthcare data management powered by blockchain technology and cross-chain bridges.</p>
        </div>
        <div className="footer-links">
          <h4>Platform</h4>
          <a href="#features">Features</a>
          <a href="#how-it-works">How It Works</a>
          <a href="#networks">Networks</a>
        </div>
        <div className="footer-links">
          <h4>Technology</h4>
          <a href="#features">Solidity Smart Contracts</a>
          <a href="#features">ERC-721 Soulbound NFTs</a>
          <a href="#features">IPFS via Pinata</a>
        </div>
      </footer>
    </div>
  );
}
