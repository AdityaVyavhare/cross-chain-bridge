import React, { useState, useEffect } from "react";
import { ipfsToHttp } from "../utils/pinata";

/**
 * Modal to preview a medical record fetched from IPFS.
 * Fetches the metadata JSON, then displays the file preview (image/pdf) and metadata fields.
 *
 * Props:
 *  - record: { tokenId, patient, hospital, recordType, encryptedCID, timestamp }
 *  - onClose: () => void
 */
export default function RecordPreviewModal({ record, onClose }) {
  const [metadata, setMetadata] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!record?.encryptedCID) {
      setError("No IPFS CID available for this record.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function fetchMetadata() {
      setLoading(true);
      setError(null);
      try {
        const metaUrl = ipfsToHttp(record.encryptedCID);
        const res = await fetch(metaUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const contentType = res.headers.get("content-type") || "";

        if (contentType.includes("application/json")) {
          const json = await res.json();
          if (!cancelled) setMetadata(json);
        } else {
          // Not JSON — treat CID as a direct file
          if (!cancelled)
            setMetadata({
              _directFile: true,
              _fileUrl: metaUrl,
              _contentType: contentType,
            });
        }
      } catch (err) {
        if (!cancelled) setError("Failed to fetch from IPFS: " + err.message);
      }
      if (!cancelled) setLoading(false);
    }

    fetchMetadata();
    return () => {
      cancelled = true;
    };
  }, [record]);

  const fileUrl = metadata?.fileCID
    ? ipfsToHttp(metadata.fileCID)
    : metadata?._fileUrl || null;
  const fileName = metadata?.fileName || record?.recordType || "Medical Record";

  const isImage = (url) => {
    if (!url) return false;
    const lower = (fileName || url).toLowerCase();
    return (
      lower.endsWith(".jpg") ||
      lower.endsWith(".jpeg") ||
      lower.endsWith(".png") ||
      lower.endsWith(".gif") ||
      lower.endsWith(".webp") ||
      lower.endsWith(".bmp") ||
      (metadata?._contentType && metadata._contentType.startsWith("image/"))
    );
  };

  const isPdf = (url) => {
    if (!url) return false;
    const lower = (fileName || url).toLowerCase();
    return (
      lower.endsWith(".pdf") ||
      (metadata?._contentType && metadata._contentType.includes("pdf"))
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div>
            <h2>Medical Record #{record?.tokenId}</h2>
            <p>{record?.recordType}</p>
          </div>
          <button className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {loading && (
            <div className="modal-loading">
              <span className="spinner"></span>
              <p>Fetching record from IPFS...</p>
            </div>
          )}

          {error && (
            <div className="alert alert-error" style={{ margin: "16px 0" }}>
              {error}
            </div>
          )}

          {!loading && !error && metadata && (
            <>
              {/* Metadata Info */}
              <div className="preview-meta">
                <div className="preview-meta-row">
                  <span>Record Type</span>
                  <span>
                    {metadata.recordType || record?.recordType || "N/A"}
                  </span>
                </div>
                <div className="preview-meta-row">
                  <span>Patient</span>
                  <span className="mono">
                    {metadata.patient || record?.patient || "N/A"}
                  </span>
                </div>
                <div className="preview-meta-row">
                  <span>Hospital</span>
                  <span className="mono">
                    {metadata.hospital || record?.hospital || "N/A"}
                  </span>
                </div>
                {metadata.fileName && (
                  <div className="preview-meta-row">
                    <span>File Name</span>
                    <span>{metadata.fileName}</span>
                  </div>
                )}
                {metadata.timestamp && (
                  <div className="preview-meta-row">
                    <span>Uploaded</span>
                    <span>{new Date(metadata.timestamp).toLocaleString()}</span>
                  </div>
                )}
                <div className="preview-meta-row">
                  <span>IPFS CID</span>
                  <span
                    className="mono"
                    style={{ fontSize: 11, wordBreak: "break-all" }}
                  >
                    {record?.encryptedCID}
                  </span>
                </div>
                {metadata.fileCID && (
                  <div className="preview-meta-row">
                    <span>File CID</span>
                    <span
                      className="mono"
                      style={{ fontSize: 11, wordBreak: "break-all" }}
                    >
                      {metadata.fileCID}
                    </span>
                  </div>
                )}
              </div>

              {/* File Preview */}
              {fileUrl && (
                <div className="preview-file">
                  <h3>File Preview</h3>
                  {isImage(fileUrl) ? (
                    <img
                      src={fileUrl}
                      alt={fileName}
                      className="preview-image"
                      onError={(e) => {
                        e.target.style.display = "none";
                      }}
                    />
                  ) : isPdf(fileUrl) ? (
                    <iframe
                      src={fileUrl}
                      title={fileName}
                      className="preview-pdf"
                    />
                  ) : (
                    <div className="preview-generic">
                      <p>File type: {metadata._contentType || "unknown"}</p>
                      <a
                        href={fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-primary"
                      >
                        Download / Open File
                      </a>
                    </div>
                  )}
                </div>
              )}

              {!fileUrl && !metadata._directFile && (
                <div className="preview-generic" style={{ marginTop: 16 }}>
                  <p>No file attachment found in this record metadata.</p>
                </div>
              )}

              {/* Open in Gateway */}
              <div style={{ marginTop: 16, textAlign: "center" }}>
                <a
                  href={ipfsToHttp(record?.encryptedCID)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline btn-sm"
                >
                  Open Metadata in IPFS Gateway
                </a>
                {fileUrl && (
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary btn-sm"
                    style={{ marginLeft: 8 }}
                  >
                    Open File in New Tab
                  </a>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
