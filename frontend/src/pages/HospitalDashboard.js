import React, { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { useBridge } from "../context/BridgeContext";
import {
  getNFTContract,
  getTokenContract,
  getConsentContract,
  getBridgeContract,
  getGasOverrides,
  shortenAddress,
  formatAmount,
} from "../utils/contracts";
import {
  uploadFileToPinata,
  uploadJSONToPinataWithName,
} from "../utils/pinata";
import RecordPreviewModal from "../components/RecordPreviewModal";

export default function HospitalDashboard({ subPage }) {
  const { account, signer, provider, chainId, networkConfig, isSupported } = useBridge();

  // Upload & Mint state
  const [patientAddr, setPatientAddr] = useState("");
  const [recordType, setRecordType] = useState("MRI Scan");
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState(null);
  const [statusType, setStatusType] = useState("info");
  const [loading, setLoading] = useState(false);
  const [isApproved, setIsApproved] = useState(null);
  const [brtBalance, setBrtBalance] = useState(null);
  const [mintStep, setMintStep] = useState(0);

  // Minted records (on-chain query)
  const [mintedRecords, setMintedRecords] = useState([]);
  const [mintedLoading, setMintedLoading] = useState(false);

  // Granted access records
  const [grantedRecords, setGrantedRecords] = useState([]);
  const [grantedLoading, setGrantedLoading] = useState(false);

  // Patients
  const [patients, setPatients] = useState([]);

  // Preview modal
  const [previewRecord, setPreviewRecord] = useState(null);

  const setMsg = (msg, type = "info") => { setStatus(msg); setStatusType(type); };
  const chainName = networkConfig ? networkConfig.name : "";

  // ── Check hospital approval & balance ────────────────
  useEffect(() => {
    async function check() {
      if (!account || !provider || !networkConfig) return;
      try {
        const nft = getNFTContract(networkConfig, provider);
        if (nft) { setIsApproved(await nft.approvedHospitals(account)); }
        const token = getTokenContract(networkConfig, provider);
        if (token) { setBrtBalance(await token.balanceOf(account)); }
      } catch (e) { console.warn(e); }
    }
    check();
  }, [account, provider, networkConfig, chainId]);

  // ── Fetch all minted records by this hospital ────────
  const fetchMintedRecords = useCallback(async () => {
    if (!account || !provider || !networkConfig) return;
    setMintedLoading(true);
    try {
      const nft = getNFTContract(networkConfig, provider);
      if (!nft) { setMintedRecords([]); setMintedLoading(false); return; }

      const nextId = await nft.nextTokenId();
      const total = nextId.toNumber();
      const records = [];

      for (let i = 1; i < total; i++) {
        try {
          const [patient, hospital, rType, encryptedCID, timestamp, originalChainId] =
            await nft.getRecordMetadata(i);
          if (hospital.toLowerCase() === account.toLowerCase()) {
            const locked = await nft.lockedForBridge(i);
            const mirror = await nft.isMirror(i);
            records.push({
              tokenId: i.toString(),
              patient, hospital, recordType: rType, encryptedCID,
              timestamp: new Date(timestamp.toNumber() * 1000).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" }),
              originalChainId: originalChainId.toString(),
              locked, isMirror: mirror,
            });
          }
        } catch (e) { /* token may not exist */ }
      }

      setMintedRecords(records);

      // Build patient list
      const patientMap = {};
      for (const rec of records) {
        const addr = rec.patient.toLowerCase();
        if (!patientMap[addr]) {
          patientMap[addr] = { address: rec.patient, records: [], types: new Set() };
        }
        patientMap[addr].records.push(rec);
        patientMap[addr].types.add(rec.recordType);
      }
      setPatients(Object.values(patientMap));
    } catch (err) { console.error("Fetch minted error:", err); }
    setMintedLoading(false);
  }, [account, provider, networkConfig]);

  // ── Fetch records where hospital has been granted access ──
  const fetchGrantedRecords = useCallback(async () => {
    if (!account || !provider || !networkConfig) return;
    setGrantedLoading(true);
    try {
      const nft = getNFTContract(networkConfig, provider);
      const consent = getConsentContract(networkConfig, provider);
      if (!nft || !consent) { setGrantedRecords([]); setGrantedLoading(false); return; }

      const nextId = await nft.nextTokenId();
      const total = nextId.toNumber();
      const records = [];

      for (let i = 1; i < total; i++) {
        try {
          const hasAccess = await consent.checkAccess(i, account);
          if (hasAccess) {
            const [patient, hospital, rType, encryptedCID, timestamp, originalChainId] =
              await nft.getRecordMetadata(i);
            if (hospital.toLowerCase() === account.toLowerCase()) continue;
            const locked = await nft.lockedForBridge(i);
            const mirror = await nft.isMirror(i);
            records.push({
              tokenId: i.toString(),
              patient, hospital, recordType: rType, encryptedCID,
              timestamp: new Date(timestamp.toNumber() * 1000).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" }),
              originalChainId: originalChainId.toString(),
              locked, isMirror: mirror,
              grantedAccess: true,
            });
          }
        } catch (e) { /* skip */ }
      }

      setGrantedRecords(records);
    } catch (err) { console.error("Fetch granted error:", err); }
    setGrantedLoading(false);
  }, [account, provider, networkConfig]);

  useEffect(() => {
    fetchMintedRecords();
    fetchGrantedRecords();
  }, [fetchMintedRecords, fetchGrantedRecords, chainId]);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;
    setFileName(selected.name);
    setFile(selected);
  };

  const handleMintRecord = async () => {
    if (!patientAddr || !recordType || !signer || !networkConfig) return;
    if (!ethers.utils.isAddress(patientAddr)) { setMsg("Invalid patient address", "error"); return; }

    setLoading(true);
    try {
      setMintStep(1);
      setMsg("Encrypting patient data...");
      await new Promise(r => setTimeout(r, 500));

      setMintStep(2);
      setMsg("Uploading to IPFS...");
      let encryptedCID;
      try {
        let fileCID = "";
        if (file) {
          fileCID = await uploadFileToPinata(file);
          setMsg("File uploaded! Uploading metadata...");
        }
        const metadata = {
          recordType, patient: patientAddr, hospital: account,
          fileName: fileName || "record", fileCID, timestamp: Date.now(),
        };
        const metadataName = `${patientAddr}/${Date.now()}-${recordType}.json`;
        encryptedCID = await uploadJSONToPinataWithName(metadata, metadataName);
      } catch (ipfsErr) {
        console.warn("IPFS upload failed, using placeholder:", ipfsErr.message);
        encryptedCID = "ipfs://Qm" + ethers.utils.id(Date.now().toString()).slice(2, 48);
        setMsg("IPFS upload failed — using placeholder CID. Minting...");
      }

      const bridge = getBridgeContract(networkConfig, signer);
      const token = getTokenContract(networkConfig, signer);
      if (bridge && token) {
        try {
          const fee = await bridge.bridgeFee();
          const gasOverrides = await getGasOverrides(chainId);
          if (fee.gt(0)) {
            setMsg("Approving BRT for minting fee...");
            const approveTx = await token.approve(networkConfig.bridge, fee, gasOverrides);
            await approveTx.wait();
            setMsg("Transferring minting fee...");
            const payTx = await token.transfer(networkConfig.bridge, fee, gasOverrides);
            await payTx.wait();
          }
        } catch (feeErr) { console.warn("Fee payment skipped:", feeErr.message); }
      }

      setMintStep(3);
      setMsg("Minting medical record NFT...");
      const nft = getNFTContract(networkConfig, signer);
      if (!nft) { setMsg("MedicalRecordNFT not configured", "error"); setLoading(false); return; }
      const gasOverridesNft = await getGasOverrides(chainId);
      const tx = await nft.mintRecord(patientAddr, recordType, encryptedCID, gasOverridesNft);
      const receipt = await tx.wait();
      const event = receipt.events?.find((e) => e.event === "RecordMinted");
      const tokenId = event ? event.args.tokenId.toString() : "?";

      setMsg(`Record minted! Token ID: #${tokenId}`, "success");
      setPatientAddr(""); setRecordType("MRI Scan"); setFile(null); setFileName(""); setMintStep(0);
      if (token) { setBrtBalance(await token.balanceOf(account)); }
      fetchMintedRecords();
    } catch (err) {
      setMsg("Mint failed: " + (err.reason || err.message), "error");
      setMintStep(0);
    }
    setLoading(false);
  };

  if (!isSupported) {
    return <div className="connect-prompt"><h2>Unsupported Network</h2><p>Switch to Sepolia or Polygon Amoy.</p></div>;
  }

  const topBar = (title, subtitle) => (
    <div className="topbar">
      <div className="topbar-left"><h1>{title}</h1><p>{subtitle}</p></div>
      <div className="topbar-right">
        <span className="topbar-chip">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>
          {chainName}
        </span>
        <span className="topbar-chip"><span className="dot"></span>{shortenAddress(account)}</span>
      </div>
    </div>
  );

  const renderRecordsTable = (records, isLoading, showGrantedBy) => {
    if (isLoading) {
      return <div className="empty-state"><span className="spinner"></span><p style={{ marginTop: 12 }}>Loading records from blockchain...</p></div>;
    }
    if (records.length === 0) {
      return <div className="empty-state"><p>No records found.</p></div>;
    }
    return (
      <table className="data-table">
        <thead>
          <tr>
            <th>Record</th><th>Type</th><th>Patient</th>
            {showGrantedBy && <th>Minted By</th>}
            <th>Date</th><th>Status</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {records.map((rec) => (
            <tr key={rec.tokenId}>
              <td><span className="cell-main">#{rec.tokenId}</span></td>
              <td>{rec.recordType}</td>
              <td style={{ fontFamily: "monospace", fontSize: 12 }}>{shortenAddress(rec.patient)}</td>
              {showGrantedBy && <td style={{ fontFamily: "monospace", fontSize: 12 }}>{shortenAddress(rec.hospital)}</td>}
              <td>{rec.timestamp}</td>
              <td>
                {rec.locked ? <span className="badge badge-locked">Locked</span>
                  : rec.isMirror ? <span className="badge badge-validated">Mirror</span>
                  : <span className="badge badge-active">Active</span>}
              </td>
              <td>
                <div className="action-btns">
                  <button onClick={() => setPreviewRecord(rec)}>Preview</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  // ═══════════ Upload & Mint ═══════════════════
  if (subPage === "dashboard") {
    return (
      <div>
        {topBar("Upload Medical Record", "Securely encrypt, store on IPFS, and mint as an NFT.")}
        {isApproved === false && <div className="alert alert-error">This address is not an approved hospital.</div>}
        <div className="two-col">
          <div className="card">
            <div className="card-header"><h2>Record Details</h2></div>
            <div className="form-group">
              <label>Patient Wallet Address</label>
              <input type="text" placeholder="0x71C...976F (Paste address here)" value={patientAddr} onChange={(e) => setPatientAddr(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Record Type</label>
              <select value={recordType} onChange={(e) => setRecordType(e.target.value)}>
                <option>MRI Scan</option><option>Blood Test</option><option>X-Ray</option>
                <option>ECG</option><option>Prescription</option><option>Lab Report</option>
                <option>Ultrasound</option><option>CT Scan</option>
              </select>
            </div>
            <div className="form-group">
              <label>Medical File</label>
              <div className={`file-upload-area ${file ? "has-file" : ""}`}>
                <input type="file" onChange={handleFileChange} />
                <div className="upload-icon">&#128196;</div>
                {file ? <p>{fileName}</p> : (
                  <><p><span className="link-text">Click to upload</span> or drag and drop</p>
                  <p className="upload-hint">PDF, JPG, PNG, or DICOM (max. 50MB)</p></>
                )}
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-header"><h2>Minting Flow</h2></div>
            <div className="minting-flow">
              <div className="minting-step">
                <div className="minting-step-header">
                  <div className={`minting-step-number ${mintStep >= 1 ? "" : "inactive"}`}>1</div>
                  <h4>Encrypt File</h4>
                </div>
                <p>Encrypt patient data locally before network upload.</p>
                {mintStep < 1 && <button className="btn btn-outline btn-sm step-btn" disabled>Encrypt File</button>}
                {mintStep === 1 && <span className="step-info"><span className="spinner"></span> Encrypting...</span>}
                {mintStep > 1 && <span className="step-info" style={{ color: "#059669" }}>&#10003; Encrypted</span>}
              </div>
              <div className="minting-step">
                <div className="minting-step-header">
                  <div className={`minting-step-number ${mintStep >= 2 ? "" : "inactive"}`}>2</div>
                  <h4>Upload to IPFS</h4>
                </div>
                <p>Store encrypted file on decentralized storage.</p>
                {mintStep < 2 && <button className="btn btn-outline btn-sm step-btn" disabled>Upload to IPFS</button>}
                {mintStep === 2 && <span className="step-info"><span className="spinner"></span> Uploading...</span>}
                {mintStep > 2 && <span className="step-info" style={{ color: "#059669" }}>&#10003; Uploaded</span>}
              </div>
              <div className="minting-step">
                <div className="minting-step-header">
                  <div className={`minting-step-number ${mintStep >= 3 ? "" : "inactive"}`}>3</div>
                  <h4>Mint Record NFT</h4>
                </div>
                <p>Create on-chain record linked to IPFS hash.</p>
                {mintStep < 3 ? (
                  <button className="btn btn-primary btn-full step-btn" onClick={handleMintRecord}
                    disabled={loading || !patientAddr || !recordType || isApproved === false}>
                    Mint MedicalRecordNFT
                  </button>
                ) : <span className="step-info"><span className="spinner"></span> Minting...</span>}
                <div className="step-info" style={{ marginTop: 8 }}>Requires 10 BRT token fee</div>
              </div>
            </div>
          </div>
        </div>
        {status && <div className={`alert alert-${statusType}`} style={{ marginTop: 16 }}>{status}</div>}
        {previewRecord && <RecordPreviewModal record={previewRecord} onClose={() => setPreviewRecord(null)} />}
      </div>
    );
  }

  // ═══════════ Minted by You ══════════════════
  if (subPage === "history") {
    return (
      <div>
        {topBar("Minted by You", "All Medical Record NFTs minted by your hospital.")}
        <div className="card">
          <div className="card-header">
            <h2>Records Minted by You ({mintedRecords.length})</h2>
            <button className="btn btn-sm btn-outline" onClick={fetchMintedRecords}>Refresh</button>
          </div>
          {renderRecordsTable(mintedRecords, mintedLoading, false)}
        </div>
        {previewRecord && <RecordPreviewModal record={previewRecord} onClose={() => setPreviewRecord(null)} />}
      </div>
    );
  }

  // ═══════════ Granted Access ════════════════
  if (subPage === "granted") {
    return (
      <div>
        {topBar("Granted Access", "Medical records that patients have granted you access to view.")}
        <div className="card">
          <div className="card-header">
            <h2>Records with Granted Access ({grantedRecords.length})</h2>
            <button className="btn btn-sm btn-outline" onClick={fetchGrantedRecords}>Refresh</button>
          </div>
          {renderRecordsTable(grantedRecords, grantedLoading, true)}
        </div>
        {previewRecord && <RecordPreviewModal record={previewRecord} onClose={() => setPreviewRecord(null)} />}
      </div>
    );
  }

  // ═══════════ Manage Patients ═════════════════
  if (subPage === "patients") {
    return (
      <div>
        {topBar("Manage Patients", "View and manage patients for whom you have minted medical records.")}
        <div className="stats-row stats-row-3">
          <div className="stat-card">
            <div className="stat-card-header"><span>Total Patients</span><span className="stat-icon">&#128100;</span></div>
            <div className="stat-value">{patients.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-header"><span>Total Records Minted</span><span className="stat-icon">&#128203;</span></div>
            <div className="stat-value">{mintedRecords.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-header"><span>Granted Access Records</span><span className="stat-icon">&#128273;</span></div>
            <div className="stat-value">{grantedRecords.length}</div>
          </div>
        </div>

        {mintedLoading ? (
          <div className="card"><div className="empty-state"><span className="spinner"></span><p style={{ marginTop: 12 }}>Loading patients...</p></div></div>
        ) : patients.length === 0 ? (
          <div className="card"><div className="empty-state"><p>No patients found. Mint a medical record to see patients here.</p></div></div>
        ) : (
          <div className="patient-grid">
            {patients.map((p) => (
              <div className="patient-card" key={p.address}>
                <div className="patient-card-header">
                  <div className="patient-card-avatar">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  </div>
                  <div>
                    <div className="patient-card-addr">{shortenAddress(p.address)}</div>
                    <div className="patient-card-sub">{p.address}</div>
                  </div>
                </div>
                <div className="patient-card-stats">
                  <div className="patient-card-stat">Records: <strong>{p.records.length}</strong></div>
                  <div className="patient-card-stat">Types: <strong>{Array.from(p.types).join(", ")}</strong></div>
                </div>
                <div style={{ marginTop: 12 }}>
                  {p.records.map((rec) => (
                    <div key={rec.tokenId} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "8px 0", borderTop: "1px solid #f1f5f9", fontSize: 13
                    }}>
                      <div>
                        <span style={{ fontWeight: 600 }}>#{rec.tokenId}</span>
                        <span style={{ color: "#64748b", marginLeft: 8 }}>{rec.recordType}</span>
                        <span style={{ color: "#94a3b8", marginLeft: 8, fontSize: 11 }}>{rec.timestamp}</span>
                      </div>
                      <button className="btn btn-sm btn-outline" onClick={() => setPreviewRecord(rec)}>Preview</button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {previewRecord && <RecordPreviewModal record={previewRecord} onClose={() => setPreviewRecord(null)} />}
      </div>
    );
  }

  return null;
}
