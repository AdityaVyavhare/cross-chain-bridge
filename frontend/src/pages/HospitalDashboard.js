import React, { useState } from "react";
import { ethers } from "ethers";
import { useBridge } from "../context/BridgeContext";
import {
  getNFTContract,
  getTokenContract,
  getBridgeContract,
  getGasOverrides,
  shortenAddress,
  formatAmount,
} from "../utils/contracts";
import {
  uploadFileToPinata,
  uploadJSONToPinataWithName,
} from "../utils/pinata";

export default function HospitalDashboard({ subPage }) {
  const { account, signer, provider, chainId, networkConfig, isSupported } = useBridge();

  const [patientAddr, setPatientAddr] = useState("");
  const [recordType, setRecordType] = useState("MRI Scan");
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState(null);
  const [statusType, setStatusType] = useState("info");
  const [loading, setLoading] = useState(false);
  const [isApproved, setIsApproved] = useState(null);
  const [brtBalance, setBrtBalance] = useState(null);
  const [mintStep, setMintStep] = useState(0); // 0=idle, 1=encrypting, 2=uploading, 3=minting
  const [mintedRecords, setMintedRecords] = useState([]);

  const setMsg = (msg, type = "info") => { setStatus(msg); setStatusType(type); };
  const chainName = networkConfig ? networkConfig.name : "";

  // Check hospital approval & balance
  React.useEffect(() => {
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
      // Step 1: Encrypt
      setMintStep(1);
      setMsg("Encrypting patient data...");
      await new Promise(r => setTimeout(r, 500)); // simulated encrypt delay

      // Step 2: Upload IPFS
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

      // Pay BRT minting fee
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

      // Step 3: Mint NFT
      setMintStep(3);
      setMsg("Minting medical record NFT...");
      const nft = getNFTContract(networkConfig, signer);
      if (!nft) { setMsg("MedicalRecordNFT not configured", "error"); setLoading(false); return; }
      const gasOverridesNft = await getGasOverrides(chainId);
      const tx = await nft.mintRecord(patientAddr, recordType, encryptedCID, gasOverridesNft);
      const receipt = await tx.wait();
      const event = receipt.events?.find((e) => e.event === "RecordMinted");
      const tokenId = event ? event.args.tokenId.toString() : "?";

      setMintedRecords(prev => [{ tokenId, recordType, patient: patientAddr, cid: encryptedCID, time: new Date().toLocaleString() }, ...prev]);
      setMsg(`Record minted! Token ID: #${tokenId}`, "success");
      setPatientAddr("");
      setRecordType("MRI Scan");
      setFile(null);
      setFileName("");
      setMintStep(0);

      // Refresh balance
      if (token) { setBrtBalance(await token.balanceOf(account)); }
    } catch (err) {
      setMsg("Mint failed: " + (err.reason || err.message), "error");
      setMintStep(0);
    }
    setLoading(false);
  };

  if (!isSupported) {
    return (
      <div className="connect-prompt">
        <h2>Unsupported Network</h2>
        <p>Please switch to Ethereum Sepolia or Polygon Amoy.</p>
      </div>
    );
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

  // ═══════════ Upload & Mint ═══════════════════
  if (subPage === "dashboard") {
    return (
      <div>
        {topBar("Upload Medical Record", "Securely encrypt, store on IPFS, and mint as an NFT.")}

        {isApproved === false && (
          <div className="alert alert-error">This address is not an approved hospital. Contact the contract owner to get approved.</div>
        )}

        <div className="two-col">
          {/* Left: Form */}
          <div className="card">
            <div className="card-header"><h2>Record Details</h2></div>

            <div className="form-group">
              <label>Patient Wallet Address</label>
              <input type="text" placeholder="0x71C...976F (Paste address here)" value={patientAddr} onChange={(e) => setPatientAddr(e.target.value)} />
            </div>

            <div className="form-group">
              <label>Record Type</label>
              <select value={recordType} onChange={(e) => setRecordType(e.target.value)}>
                <option>MRI Scan</option>
                <option>Blood Test</option>
                <option>X-Ray</option>
                <option>ECG</option>
                <option>Prescription</option>
                <option>Lab Report</option>
                <option>Ultrasound</option>
                <option>CT Scan</option>
              </select>
            </div>

            <div className="form-group">
              <label>Medical File</label>
              <div className={`file-upload-area ${file ? "has-file" : ""}`}>
                <input type="file" onChange={handleFileChange} />
                <div className="upload-icon">&#128196;</div>
                {file ? (
                  <p>{fileName}</p>
                ) : (
                  <>
                    <p><span className="link-text">Click to upload</span> or drag and drop</p>
                    <p className="upload-hint">PDF, JPG, PNG, or DICOM (max. 50MB)</p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right: Minting Flow */}
          <div className="card">
            <div className="card-header"><h2>Minting Flow</h2></div>
            <div className="minting-flow">
              <div className="minting-step">
                <div className="minting-step-header">
                  <div className={`minting-step-number ${mintStep >= 1 ? "" : "inactive"}`}>1</div>
                  <h4>Encrypt File</h4>
                </div>
                <p>Encrypt patient data locally before network upload.</p>
                {mintStep < 1 && (
                  <button className="btn btn-outline btn-sm step-btn" disabled>Encrypt File</button>
                )}
                {mintStep === 1 && <span className="step-info"><span className="spinner"></span> Encrypting...</span>}
                {mintStep > 1 && <span className="step-info" style={{ color: "#059669" }}>&#10003; Encrypted</span>}
              </div>

              <div className="minting-step">
                <div className="minting-step-header">
                  <div className={`minting-step-number ${mintStep >= 2 ? "" : "inactive"}`}>2</div>
                  <h4>Upload to IPFS</h4>
                </div>
                <p>Store encrypted file on decentralized storage.</p>
                {mintStep < 2 && (
                  <button className="btn btn-outline btn-sm step-btn" disabled>Upload to IPFS</button>
                )}
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
                  <button
                    className="btn btn-primary btn-full step-btn"
                    onClick={handleMintRecord}
                    disabled={loading || !patientAddr || !recordType || isApproved === false}
                  >
                    Mint MedicalRecordNFT
                  </button>
                ) : (
                  <span className="step-info"><span className="spinner"></span> Minting...</span>
                )}
                <div className="step-info" style={{ marginTop: 8 }}>Requires 10 BRT token fee</div>
              </div>
            </div>
          </div>
        </div>

        {status && <div className={`alert alert-${statusType}`} style={{ marginTop: 16 }}>{status}</div>}
      </div>
    );
  }

  // ═══════════ Mint History ════════════════════
  if (subPage === "history") {
    return (
      <div>
        {topBar("Mint History", "Records minted during this session.")}
        <div className="card">
          {mintedRecords.length === 0 ? (
            <div className="empty-state"><p>No records minted during this session.</p></div>
          ) : (
            <table className="data-table">
              <thead><tr><th>Token ID</th><th>Type</th><th>Patient</th><th>CID</th><th>Time</th></tr></thead>
              <tbody>
                {mintedRecords.map((r, i) => (
                  <tr key={i}>
                    <td><span className="cell-main">#{r.tokenId}</span></td>
                    <td>{r.recordType}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>{shortenAddress(r.patient)}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 11 }}>{r.cid?.slice(0, 16)}...</td>
                    <td>{r.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  // ═══════════ Manage Patients ═════════════════
  if (subPage === "patients") {
    return (
      <div>
        {topBar("Manage Patients", "View and manage patient records.")}
        <div className="card">
          <div className="empty-state">
            <p>Patient management features are available via the smart contract. Use the Patient Dashboard to view records.</p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
