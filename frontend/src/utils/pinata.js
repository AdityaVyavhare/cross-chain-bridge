import config from "../config";

/**
 * Upload JSON metadata to Pinata IPFS
 * @param {object} metadata - JSON data to upload
 * @returns {string} CID
 */
export async function uploadToPinata(metadata) {
  const { apiKey, secret } = config.pinata;

  if (!apiKey || !secret) {
    throw new Error(
      "Pinata API key and secret required. Set REACT_APP_PINATA_API_KEY and REACT_APP_PINATA_SECRET.",
    );
  }

  const response = await fetch(
    "https://api.pinata.cloud/pinning/pinJSONToIPFS",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        pinata_api_key: apiKey,
        pinata_secret_api_key: secret,
      },
      body: JSON.stringify({
        pinataContent: metadata,
        pinataMetadata: {
          name: `bridge-tx-${Date.now()}`,
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error("Pinata upload failed: " + response.statusText);
  }

  const data = await response.json();
  return data.IpfsHash;
}

export function getIpfsUrl(cid) {
  return config.pinata.gateway + cid;
}
