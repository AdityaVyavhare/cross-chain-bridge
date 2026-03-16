import axios from "axios";

// --- Gateway selection ---
function normalizeGateway(input) {
  let url = (input || "").trim();
  if (!url) return "https://gateway.pinata.cloud/ipfs/";
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  if (!url.endsWith("/")) url += "/";
  if (!/\/ipfs\//i.test(url)) url += "ipfs/";
  if (!url.endsWith("/")) url += "/";
  return url;
}

export const DEFAULT_IPFS_GATEWAY = normalizeGateway(
  process.env.REACT_APP_IPFS_GATEWAY ||
    "blush-capitalist-chicken-122.mypinata.cloud",
);

export function ipfsToHttp(ipfsUri, gateway = DEFAULT_IPFS_GATEWAY) {
  if (!ipfsUri || typeof ipfsUri !== "string") return ipfsUri;
  if (!ipfsUri.startsWith("ipfs://")) return ipfsUri;
  const path = ipfsUri.replace("ipfs://", "");
  return `${gateway}${path}`;
}

// --- Auth selection (JWT preferred, else API keys) ---
const PINATA_JWT = process.env.REACT_APP_PINATA_JWT;
const PINATA_KEY = process.env.REACT_APP_PINATA_API_KEY;
const PINATA_SECRET = process.env.REACT_APP_PINATA_SECRET;

function authHeaders(isJson = false) {
  if (PINATA_JWT) {
    return {
      ...(isJson ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${PINATA_JWT}`,
    };
  }
  if (PINATA_KEY && PINATA_SECRET) {
    return {
      ...(isJson ? { "Content-Type": "application/json" } : {}),
      pinata_api_key: PINATA_KEY,
      pinata_secret_api_key: PINATA_SECRET,
    };
  }
  throw new Error(
    "Pinata credentials missing. Set REACT_APP_PINATA_JWT or REACT_APP_PINATA_API_KEY + REACT_APP_PINATA_SECRET in .env",
  );
}

// --- Upload helpers ---
export async function uploadFileToPinata(file) {
  if (!file) throw new Error("No file to upload");
  const url = "https://api.pinata.cloud/pinning/pinFileToIPFS";
  const data = new FormData();
  data.append("file", file);

  try {
    const res = await axios.post(url, data, {
      maxBodyLength: Infinity,
      headers: {
        "Content-Type": "multipart/form-data",
        ...authHeaders(false),
      },
    });
    return `ipfs://${res.data.IpfsHash}`;
  } catch (err) {
    const msg = err?.response?.data || err?.message;
    console.error("Pinata file upload failed:", msg);
    throw new Error(
      `Pinata upload failed (file): ${
        typeof msg === "string" ? msg : JSON.stringify(msg)
      }`,
    );
  }
}

// Upload JSON with optional Pinata metadata name
export async function uploadJSONToPinataWithName(json, name) {
  const url = "https://api.pinata.cloud/pinning/pinJSONToIPFS";
  const payload = {
    pinataContent: json,
    ...(name ? { pinataMetadata: { name } } : {}),
  };
  try {
    const res = await axios.post(url, payload, {
      headers: {
        ...authHeaders(true),
      },
    });
    return `ipfs://${res.data.IpfsHash}`;
  } catch (err) {
    const msg = err?.response?.data || err?.message;
    console.error("Pinata JSON upload (named) failed:", msg);
    throw new Error(
      `Pinata upload failed (json named): ${
        typeof msg === "string" ? msg : JSON.stringify(msg)
      }`,
    );
  }
}

export async function uploadJSONToPinata(json) {
  const url = "https://api.pinata.cloud/pinning/pinJSONToIPFS";
  try {
    const res = await axios.post(url, json, {
      headers: {
        ...authHeaders(true),
      },
    });
    return `ipfs://${res.data.IpfsHash}`;
  } catch (err) {
    const msg = err?.response?.data || err?.message;
    console.error("Pinata JSON upload failed:", msg);
    throw new Error(
      `Pinata upload failed (json): ${
        typeof msg === "string" ? msg : JSON.stringify(msg)
      }`,
    );
  }
}

// List pins filtered by Pinata metadata name substring
export async function listPinsByNamePrefix(prefix, pageLimit = 1000) {
  const url = "https://api.pinata.cloud/data/pinList";
  const params = new URLSearchParams();
  params.set("status", "pinned");
  if (prefix) params.set("metadata[nameContains]", prefix);
  params.set("pageLimit", String(pageLimit));
  try {
    const res = await axios.get(`${url}?${params.toString()}`, {
      headers: { ...authHeaders(true) },
    });
    return res.data?.rows || [];
  } catch (err) {
    const msg = err?.response?.data || err?.message;
    console.error("Pinata list pins failed:", msg);
    throw new Error(
      `Pinata list pins failed: ${
        typeof msg === "string" ? msg : JSON.stringify(msg)
      }`,
    );
  }
}
