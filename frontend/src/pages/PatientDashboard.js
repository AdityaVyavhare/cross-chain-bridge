import React, { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { useSelector, useDispatch } from "react-redux";
import { useBridge } from "../context/BridgeContext";
import {
  getNFTContract,
  getConsentContract,
  getBridgeContract,
  getTokenContract,
  getGasOverrides,
  shortenAddress,
  formatAmount,
  isSepolia,
} from "../utils/contracts";
import { addTransaction, selectAllTransactions } from "../slices/bridgeSlice";
import config from "../config";
import { ipfsToHttp } from "../utils/pinata";
import RecordPreviewModal from "../components/RecordPreviewModal";

export default function PatientDashboard({ subPage }) {
  const { account, signer, provider, chainId, networkConfig, isSupported } = useBridge();
  const dispatch = useDispatch();
  const transactions = useSelector(selectAllTransactions);

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [brtBalance, setBrtBalance] = useState(null);
  const [status, setStatus] = useState(null);
  const [statusType, setStatusType] = useState("info");

  // Consent form
  const [consentTokenId, setConsentTokenId] = useState("");
  const [consentHospital, setConsentHospital] = useState("");
  const [accessLists, setAccessLists] = useState({});

  // Bridge NFT form
  const [bridgeTokenId, setBridgeTokenId] = useState("");

  // Bridge BRT form
  const [brtAmount, setBrtAmount] = useState("");
  const [allowance, setAllowance] = useState(null);
  const [bridgeFee, setBridgeFee] = useState(null);
  const [approving, setApproving] = useState(false);
  const [bridging, setBridging] = useState(false);

  // Preview modal
  const [previewRecord, setPreviewRecord] = useState(null);

  const setMsg = (msg, type = "info") => { setStatus(msg); setStatusType(type); };
  const chainName = isSepolia(chainId) ? "Ethereum Sepolia" : "Polygon Amoy";
  const destChainName = isSepolia(chainId) ? "Polygon Amoy" : "Ethereum Sepolia";

  // Fetch records
  const fetchRecords = useCallback(async () => {
    if (!account || !provider || !networkConfig) return;
    setLoading(true);
    try {
      const nftContract = getNFTContract(networkConfig, provider);
      if (!nftContract) { setRecords([]); return; }
      const tokenIds = await nftContract.getPatientTokens(account);
      const items = [];
      for (const tid of tokenIds) {
        try {
          const [patient, hospital, recordType, encryptedCID, timestamp, originalChainId] =
            await nftContract.getRecordMetadata(tid);
          const locked = await nftContract.lockedForBridge(tid);
          const mirror = await nftContract.isMirror(tid);
          items.push({
            tokenId: tid.toString(),
            patient, hospital, recordType, encryptedCID,
            timestamp: new Date(timestamp.toNumber() * 1000).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" }),
            originalChainId: originalChainId.toString(),
            locked, isMirror: mirror,
          });
        } catch (e) { console.warn("Error reading token", tid.toString(), e.message); }
      }
      setRecords(items);
    } catch (err) { console.error("Fetch records error:", err); }
    finally { setLoading(false); }
  }, [account, provider, networkConfig]);

  // Fetch BRT balance
  const fetchBalance = useCallback(async () => {
    if (!account || !provider || !networkConfig) return;
    try {
      const token = getTokenContract(networkConfig, provider);
      if (!token) return;
      const bal = await token.balanceOf(account);
      setBrtBalance(bal);
    } catch (e) { console.warn(e); }
  }, [account, provider, networkConfig]);

  // Fetch allowance + bridge fee
  const fetchAllowance = useCallback(async () => {
    if (!account || !provider || !networkConfig?.bridge) return;
    try {
      const token = getTokenContract(networkConfig, provider);
      if (!token) return;
      const a = await token.allowance(account, networkConfig.bridge);
      setAllowance(a);
      const bridge = getBridgeContract(networkConfig, provider);
      if (bridge) { setBridgeFee(await bridge.bridgeFee()); }
    } catch (e) { console.warn(e); }
  }, [account, provider, networkConfig]);

  // Fetch access list for a token
  const fetchAccessList = useCallback(async (tokenId) => {
    if (!provider || !networkConfig) return;
    try {
      const consent = getConsentContract(networkConfig, provider);
      if (!consent) return;
      const list = await consent.getAccessList(tokenId);
      setAccessLists((prev) => ({ ...prev, [tokenId]: list }));
    } catch (e) { console.warn(e); }
  }, [provider, networkConfig]);

  useEffect(() => { fetchRecords(); fetchBalance(); fetchAllowance(); }, [fetchRecords, fetchBalance, fetchAllowance, chainId]);

  // ── Grant Access ─────────────────────────────────────
  const handleGrantAccess = async () => {
    if (!consentTokenId || !consentHospital || !signer || !networkConfig) return;
    setMsg("Granting access...");
    try {
      const consent = getConsentContract(networkConfig, signer);
      if (!consent) { setMsg("ConsentManager not configured", "error"); return; }
      const tx = await consent.grantAccess(consentTokenId, consentHospital, await getGasOverrides(chainId));
      await tx.wait();
      setMsg("Access granted!", "success");
      setConsentHospital("");
      fetchAccessList(consentTokenId);
    } catch (err) { setMsg("Grant failed: " + (err.reason || err.message), "error"); }
  };

  // ── Revoke Access ────────────────────────────────────
  const handleRevokeAccess = async (tokenId, hospital) => {
    if (!signer || !networkConfig) return;
    setMsg("Revoking access...");
    try {
      const consent = getConsentContract(networkConfig, signer);
      if (!consent) { setMsg("ConsentManager not configured", "error"); return; }
      const tx = await consent.revokeAccess(tokenId, hospital, await getGasOverrides(chainId));
      await tx.wait();
      setMsg("Access revoked!", "success");
      fetchAccessList(tokenId);
    } catch (err) { setMsg("Revoke failed: " + (err.reason || err.message), "error"); }
  };

  // ── Bridge NFT ───────────────────────────────────────
  const handleBridgeNFT = async (tokenId) => {
    if (!signer || !networkConfig) return;
    const rec = records.find((r) => r.tokenId === tokenId);
    if (!rec) return;
    const destChainId = chainId === config.sepolia.chainId ? config.amoy.chainId : config.sepolia.chainId;
    setMsg("Approving BRT for bridge fee...");
    try {
      const bridge = getBridgeContract(networkConfig, signer);
      const token = getTokenContract(networkConfig, signer);
      if (!bridge || !token) { setMsg("Contracts not configured", "error"); return; }
      const fee = await bridge.bridgeFee();
      const gasOverrides = await getGasOverrides(chainId);
      if (fee.gt(0)) {
        const approveTx = await token.approve(networkConfig.bridge, fee, gasOverrides);
        await approveTx.wait();
      }
      setMsg("Locking NFT for bridge...");
      const tx = await bridge.lockNFT(tokenId, destChainId, gasOverrides);
      const receipt = await tx.wait();
      const event = receipt.events?.find((e) => e.event === "NFTLocked");
      const nonce = event ? event.args.nonce.toString() : "?";
      dispatch(addTransaction({
        id: `nft-${chainName}-${nonce}`,
        type: rec.isMirror ? "NFT Burn -> Unlock" : "NFT Lock -> Mint",
        sourceChain: isSepolia(chainId) ? "Sepolia" : "Amoy",
        destChain: isSepolia(chainId) ? "Amoy" : "Sepolia",
        sourceChainId: chainId,
        destChainId,
        sender: account,
        tokenId,
        recordType: rec.recordType,
        encryptedCID: rec.encryptedCID,
        hospital: rec.hospital,
        originalChainId: rec.originalChainId,
        nonce,
        txHash: receipt.transactionHash,
        timestamp: Date.now(),
        status: "pending",
      }));
      setMsg("NFT locked! Validator will mint mirror on destination chain.", "success");
      fetchRecords();
    } catch (err) { setMsg("Bridge failed: " + (err.reason || err.message), "error"); }
  };

  // ── Burn Mirror NFT ──────────────────────────────────
  const handleBurnMirror = async (tokenId) => {
    if (!signer || !networkConfig) return;
    setMsg("Approving BRT for bridge fee...");
    try {
      const bridge = getBridgeContract(networkConfig, signer);
      const token = getTokenContract(networkConfig, signer);
      if (!bridge || !token) { setMsg("Contracts not configured", "error"); return; }
      const fee = await bridge.bridgeFee();
      const gasOverrides = await getGasOverrides(chainId);
      if (fee.gt(0)) {
        const approveTx = await token.approve(networkConfig.bridge, fee, gasOverrides);
        await approveTx.wait();
      }
      setMsg("Burning mirror NFT...");
      const tx = await bridge.burnMirrorNFT(tokenId, gasOverrides);
      await tx.wait();
      setMsg("Mirror burned! Validator will unlock original.", "success");
      fetchRecords();
    } catch (err) { setMsg("Burn failed: " + (err.reason || err.message), "error"); }
  };

  // ── BRT Bridge ───────────────────────────────────────
  const getTotalNeeded = () => {
    if (!brtAmount || !bridgeFee) return null;
    try { return ethers.utils.parseEther(brtAmount).add(bridgeFee); }
    catch { return null; }
  };
  const hasEnoughAllowance = () => {
    const total = getTotalNeeded();
    if (!total || !allowance) return false;
    return allowance.gte(total);
  };

  const handleApproveBRT = async () => {
    if (!brtAmount || !signer || !networkConfig) return;
    setApproving(true);
    setMsg("Approving BRT tokens...");
    try {
      const token = getTokenContract(networkConfig, signer);
      const total = getTotalNeeded();
      const tx = await token.approve(networkConfig.bridge, total, await getGasOverrides(chainId));
      await tx.wait();
      await fetchAllowance();
      setMsg("Approved! Click Bridge to proceed.", "success");
    } catch (err) { setMsg("Approve failed: " + (err.reason || err.message), "error"); }
    setApproving(false);
  };

  const handleBridgeBRT = async () => {
    if (!brtAmount || !signer || !networkConfig) return;
    if (!hasEnoughAllowance()) { setMsg("Approve first.", "error"); return; }
    setBridging(true);
    const onSepolia = isSepolia(chainId);
    try {
      const bridge = getBridgeContract(networkConfig, signer);
      const weiAmount = ethers.utils.parseEther(brtAmount);
      const gasOverrides = await getGasOverrides(chainId);
      setMsg(onSepolia ? "Locking BRT on Sepolia..." : "Burning BRT on Amoy...");
      const tx = onSepolia ? await bridge.lockTokens(weiAmount, gasOverrides) : await bridge.burnTokens(weiAmount, gasOverrides);
      const receipt = await tx.wait();
      const eventName = onSepolia ? "TokenLocked" : "TokenBurned";
      const event = receipt.events?.find((e) => e.event === eventName);
      const nonce = event ? event.args.nonce.toString() : "?";
      dispatch(addTransaction({
        id: `token-${onSepolia ? "Sepolia" : "Amoy"}-${nonce}`,
        type: onSepolia ? "BRT Lock -> Mint" : "BRT Burn -> Unlock",
        sourceChain: onSepolia ? "Sepolia" : "Amoy",
        destChain: onSepolia ? "Amoy" : "Sepolia",
        sourceChainId: chainId,
        destChainId: onSepolia ? config.amoy.chainId : config.sepolia.chainId,
        sender: account,
        amount: weiAmount.toString(),
        amountFormatted: parseFloat(brtAmount).toFixed(4),
        nonce, txHash: receipt.transactionHash,
        timestamp: Date.now(), status: "pending",
      }));
      setMsg(`${onSepolia ? "Locked" : "Burned"} ${brtAmount} BRT! Validator will process.`, "success");
      setBrtAmount("");
      await fetchAllowance();
      await fetchBalance();
    } catch (err) { setMsg("Bridge failed: " + (err.reason || err.message), "error"); }
    setBridging(false);
  };

  if (!isSupported) {
    return (
      <div className="connect-prompt">
        <h2>Unsupported Network</h2>
        <p>Please switch to Ethereum Sepolia or Polygon Amoy to use the patient dashboard.</p>
      </div>
    );
  }

  const topBar = (title, subtitle) => (
    <div className="topbar">
      <div className="topbar-left">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="topbar-right">
        <span className="topbar-chip">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>
          {chainName}
        </span>
        <span className="topbar-chip"><span className="dot"></span>{shortenAddress(account)}</span>
      </div>
    </div>
  );

  // ═══════════ Dashboard (overview) ═══════════════
  if (subPage === "dashboard") {
    return (
      <div>
        {topBar("Patient Dashboard", "Overview of your medical records and bridge activity.")}
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-card-header"><span>Total Records</span><span className="stat-icon">&#128203;</span></div>
            <div className="stat-value">{loading ? "..." : records.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-header"><span>Active Bridges</span><span className="stat-icon">&#128279;</span></div>
            <div className="stat-value">{records.filter(r => r.locked).length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-header"><span>Mirror NFTs</span><span className="stat-icon">&#128196;</span></div>
            <div className="stat-value">{records.filter(r => r.isMirror).length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-header"><span>BRT Balance</span><span className="stat-icon">&#128176;</span></div>
            <div className="stat-value">{brtBalance ? formatAmount(brtBalance) : "0"}</div>
            <div className="stat-sub">Available across chains</div>
          </div>
        </div>
        {/* Recent Records */}
        <div className="card">
          <div className="card-header">
            <h2>Recent Medical Records</h2>
            <button className="btn btn-sm btn-outline" onClick={fetchRecords}>Refresh</button>
          </div>
          {records.length === 0 ? (
            <div className="empty-state"><p>No medical records found on this chain.</p></div>
          ) : (
            <table className="data-table">
              <thead><tr><th>Record</th><th>Type</th><th>Hospital</th><th>Date</th><th>Chain</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {records.slice(0, 5).map((rec) => (
                  <tr key={rec.tokenId}>
                    <td><span className="cell-main">#{rec.tokenId}</span></td>
                    <td>{rec.recordType}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>{shortenAddress(rec.hospital)}</td>
                    <td>{rec.timestamp}</td>
                    <td><span className="chain-badge">{chainName}</span></td>
                    <td>
                      {rec.locked ? <span className="badge badge-locked">Locked</span>
                        : rec.isMirror ? <span className="badge badge-validated">Mirror</span>
                        : <span className="badge badge-active">Active</span>}
                    </td>
                    <td>
                      {rec.encryptedCID && (
                        <button className="btn btn-sm btn-outline" onClick={() => setPreviewRecord(rec)}>Preview</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {status && <div className={`alert alert-${statusType}`}>{status}</div>}
        {previewRecord && <RecordPreviewModal record={previewRecord} onClose={() => setPreviewRecord(null)} />}
      </div>
    );
  }

  // ═══════════ My Records ═══════════════════════
  if (subPage === "records") {
    return (
      <div>
        {topBar("My Medical Records", "Manage, bridge, and grant access to your encrypted health data NFTs.")}
        {records.length === 0 ? (
          <div className="card"><div className="empty-state"><p>No medical records found on this chain.</p></div></div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Record</th><th>Type</th><th>Hospital</th><th>Date</th><th>IPFS CID</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {records.map((rec) => (
                <tr key={rec.tokenId}>
                  <td><span className="cell-main">#{rec.tokenId}</span></td>
                  <td>{rec.recordType}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>{shortenAddress(rec.hospital)}</td>
                  <td>{rec.timestamp}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 11, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {rec.encryptedCID ? rec.encryptedCID.slice(0, 16) + "..." : "N/A"}
                  </td>
                  <td>
                    {rec.locked ? <span className="badge badge-locked">Locked</span>
                      : rec.isMirror ? <span className="badge badge-validated">Mirror</span>
                      : <span className="badge badge-active">Active</span>}
                  </td>
                  <td>
                    <div className="action-btns">
                      {rec.encryptedCID && (
                        <button onClick={() => setPreviewRecord(rec)}>Preview</button>
                      )}
                      {!rec.locked && !rec.isMirror && (
                        <button className="btn-teal" onClick={() => handleBridgeNFT(rec.tokenId)}>Bridge Record</button>
                      )}
                      {rec.isMirror && (
                        <button onClick={() => handleBurnMirror(rec.tokenId)}>Burn Mirror</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {status && <div className={`alert alert-${statusType}`} style={{ marginTop: 16 }}>{status}</div>}
        {previewRecord && <RecordPreviewModal record={previewRecord} onClose={() => setPreviewRecord(null)} />}
      </div>
    );
  }

  // ═══════════ Grant Access ═════════════════════
  if (subPage === "consent") {
    return (
      <div>
        {topBar("Grant Access", "Control which hospitals can view your medical records.")}
        <div className="two-col">
          <div className="card">
            <div className="card-header"><h2>Grant Hospital Access</h2></div>
            <div className="form-group">
              <label>Record (Token ID)</label>
              <select value={consentTokenId} onChange={(e) => { setConsentTokenId(e.target.value); if (e.target.value) fetchAccessList(e.target.value); }}>
                <option value="">Select a record...</option>
                {records.map((r) => <option key={r.tokenId} value={r.tokenId}>#{r.tokenId} - {r.recordType}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Hospital Wallet Address</label>
              <input type="text" placeholder="0x..." value={consentHospital} onChange={(e) => setConsentHospital(e.target.value)} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary" onClick={handleGrantAccess} disabled={!consentTokenId || !consentHospital}>
                Grant Access
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><h2>Current Permissions</h2></div>
            {consentTokenId && accessLists[consentTokenId] ? (
              accessLists[consentTokenId].length === 0 ? (
                <div className="empty-state"><p>No hospitals have access to this record.</p></div>
              ) : (
                <table className="data-table">
                  <thead><tr><th>Hospital Address</th><th>Action</th></tr></thead>
                  <tbody>
                    {accessLists[consentTokenId].map((addr) => (
                      <tr key={addr}>
                        <td style={{ fontFamily: "monospace", fontSize: 13 }}>{shortenAddress(addr)}</td>
                        <td>
                          <button className="btn btn-sm btn-danger" onClick={() => handleRevokeAccess(consentTokenId, addr)}>
                            Revoke
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : (
              <div className="empty-state"><p>Select a record to view permissions.</p></div>
            )}
          </div>
        </div>
        {status && <div className={`alert alert-${statusType}`} style={{ marginTop: 16 }}>{status}</div>}
      </div>
    );
  }

  // ═══════════ Bridge NFT ══════════════════════
  if (subPage === "bridge-nft") {
    const bridgeable = records.filter((r) => !r.locked);
    return (
      <div>
        {topBar("Bridge Medical NFT", "Transfer your medical record NFTs across chains.")}
        <div className="card">
          <div className="card-header"><h2>Bridge NFT Cross-Chain</h2></div>
          <div className="bridge-chains">
            <div className="chain-select">
              <label>Source Chain</label>
              <div className="chain-display">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>
                {chainName}
              </div>
            </div>
            <div className="chain-arrow">&rarr;</div>
            <div className="chain-select">
              <label>Destination Chain</label>
              <div className="chain-display">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                {destChainName}
              </div>
            </div>
          </div>
          <div className="form-group">
            <label>Select Record to Bridge</label>
            <select value={bridgeTokenId} onChange={(e) => setBridgeTokenId(e.target.value)}>
              <option value="">Select a record...</option>
              {bridgeable.map((r) => (
                <option key={r.tokenId} value={r.tokenId}>
                  #{r.tokenId} - {r.recordType} {r.isMirror ? "(Mirror)" : ""}
                </option>
              ))}
            </select>
          </div>
          {bridgeTokenId && (
            <div className="bridge-summary">
              <div className="bridge-summary-row"><span>Record</span><span>#{bridgeTokenId}</span></div>
              <div className="bridge-summary-row"><span>Type</span><span>{records.find(r => r.tokenId === bridgeTokenId)?.recordType}</span></div>
              <div className="bridge-summary-row"><span>Action</span><span className="teal">{records.find(r => r.tokenId === bridgeTokenId)?.isMirror ? "Burn Mirror -> Unlock" : "Lock -> Mint Mirror"}</span></div>
            </div>
          )}
          {bridgeTokenId && (
            records.find(r => r.tokenId === bridgeTokenId)?.isMirror ? (
              <button className="btn btn-primary btn-full" onClick={() => handleBurnMirror(bridgeTokenId)}>
                Burn Mirror & Bridge Back
              </button>
            ) : (
              <button className="btn btn-primary btn-full" onClick={() => handleBridgeNFT(bridgeTokenId)}>
                Lock & Bridge NFT
              </button>
            )
          )}
        </div>
        {status && <div className={`alert alert-${statusType}`} style={{ marginTop: 16 }}>{status}</div>}
      </div>
    );
  }

  // ═══════════ Bridge BRT Token ════════════════
  if (subPage === "bridge-brt") {
    return (
      <div>
        {topBar("Bridge BRT Token", "Transfer BRT tokens between Sepolia and Polygon Amoy.")}
        <div className="card">
          <div className="card-header"><h2>Bridge BRT Tokens</h2></div>
          <div className="bridge-chains">
            <div className="chain-select">
              <label>Source Chain</label>
              <div className="chain-display">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>
                {chainName}
              </div>
            </div>
            <div className="chain-arrow">&rarr;</div>
            <div className="chain-select">
              <label>Destination Chain</label>
              <div className="chain-display">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                {destChainName}
              </div>
            </div>
          </div>

          <div className="form-group">
            <label>Amount</label>
            <div className="amount-input-wrap">
              <input type="number" min="0" step="any" placeholder="Enter amount" value={brtAmount} onChange={(e) => setBrtAmount(e.target.value)} />
              <div className="amount-suffix">BRT</div>
            </div>
          </div>

          {brtAmount && (
            <div className="bridge-summary">
              <div className="bridge-summary-row"><span>Amount</span><span>{brtAmount} BRT</span></div>
              <div className="bridge-summary-row"><span>Bridge Fee</span><span>{bridgeFee ? formatAmount(bridgeFee) + " BRT" : "..."}</span></div>
              <div className="bridge-summary-row"><span>Mechanism</span><span className="teal">{isSepolia(chainId) ? "Lock -> Mint" : "Burn -> Unlock"}</span></div>
              <div className="bridge-summary-row"><span>Allowance</span><span>{allowance ? formatAmount(allowance) + " BRT" : "..."}</span></div>
            </div>
          )}

          <div style={{ display: "flex", gap: 12 }}>
            <button
              className="btn btn-outline"
              onClick={handleApproveBRT}
              disabled={approving || bridging || !brtAmount}
              style={{ flex: 1 }}
            >
              {approving ? "Approving..." : hasEnoughAllowance() ? "Approved" : "1. Approve"}
            </button>
            <button
              className="btn btn-primary"
              onClick={handleBridgeBRT}
              disabled={bridging || !brtAmount || !hasEnoughAllowance()}
              style={{ flex: 1 }}
            >
              {bridging ? "Processing..." : isSepolia(chainId) ? "2. Lock & Bridge" : "2. Burn & Bridge"}
            </button>
          </div>
        </div>
        {status && <div className={`alert alert-${statusType}`} style={{ marginTop: 16 }}>{status}</div>}
      </div>
    );
  }

  // ═══════════ Activity History ═════════════════
  if (subPage === "activity") {
    return (
      <div>
        {topBar("Activity History", "Track all your bridge transactions and record events.")}
        <div className="card">
          <div className="card-header">
            <h2>Transaction History</h2>
          </div>
          {transactions.length === 0 ? (
            <div className="empty-state"><p>No activity yet. Bridge NFTs or tokens to see transactions here.</p></div>
          ) : (
            <table className="data-table">
              <thead><tr><th>Type</th><th>Details</th><th>Route</th><th>Status</th><th>Time</th></tr></thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td>
                      <span className={tx.type.includes("NFT") ? "badge badge-nft" : "badge badge-token"}>
                        {tx.type.includes("NFT") ? "Medical NFT" : "Token"}
                      </span>
                    </td>
                    <td>
                      <span className="cell-main">
                        {tx.type.includes("NFT") ? `#${tx.tokenId || "?"}` : `${tx.amountFormatted || "?"} BRT`}
                      </span>
                      <span className="cell-sub" style={{ fontFamily: "monospace" }}>{tx.txHash ? shortenAddress(tx.txHash) : ""}</span>
                    </td>
                    <td>
                      <span className="route-text">
                        {tx.sourceChain} &rarr; {tx.destChain}
                      </span>
                    </td>
                    <td><span className={`badge badge-${tx.status}`}>{tx.status}</span></td>
                    <td>{new Date(tx.timestamp).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  return null;
}
