# How to Run — Healthcare Medical NFT Cross-Chain Bridge

A complete guide to set up, deploy, and run the Healthcare Medical NFT Bridge application (Sepolia <-> Polygon Amoy).

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Project Setup](#2-project-setup)
3. [Environment Configuration](#3-environment-configuration)
4. [Compile & Deploy Smart Contracts](#4-compile--deploy-smart-contracts)
5. [Run the Frontend](#5-run-the-frontend)
6. [Run the Validator Service](#6-run-the-validator-service)
7. [Using the Application](#7-using-the-application)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Prerequisites

Before running the application, make sure you have:

- **Node.js** v18 or higher — [https://nodejs.org](https://nodejs.org)
- **MetaMask** browser extension — [https://metamask.io](https://metamask.io)
- **Alchemy Account** (free tier) — [https://www.alchemy.com](https://www.alchemy.com)
  - Create an app for **Ethereum Sepolia**
  - Create an app for **Polygon Amoy**
  - Copy your API keys / RPC URLs
- **Pinata Account** (free tier) — [https://www.pinata.cloud](https://www.pinata.cloud)
  - Get your API Key and Secret for IPFS uploads
- **Test tokens**:
  - Sepolia ETH — [https://sepoliafaucet.com](https://sepoliafaucet.com) or [https://www.alchemy.com/faucets/ethereum-sepolia](https://www.alchemy.com/faucets/ethereum-sepolia)
  - Amoy POL — [https://faucet.polygon.technology](https://faucet.polygon.technology)

---

## 2. Project Setup

```bash
# Clone the repository
git clone <your-repo-url>
cd cross-chain-bridge

# Install root dependencies (Hardhat, Solidity, ethers)
npm install

# Install frontend dependencies (React)
cd frontend
npm install
cd ..
```

### Project Structure

```
cross-chain-bridge/
├── contracts/            # Solidity smart contracts (5 contracts)
│   ├── BRTToken.sol          # ERC20 Bridge Utility Token
│   ├── MedicalRecordNFT.sol  # Soulbound Medical Record NFT (ERC721)
│   ├── ConsentManager.sol    # Patient consent/access management
│   ├── ValidatorManager.sol  # Validator registration & management
│   └── HealthcareBridge.sol  # Cross-chain bridge logic
├── scripts/              # Deployment scripts
│   ├── deployAll.js          # Deploy all contracts to both chains
│   └── updateFrontend.js     # Export ABIs & addresses to frontend
├── validator/            # Off-chain validator service
│   └── validator.js          # Event listener for bridge events
├── frontend/             # React frontend application
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   ├── context/          # BridgeContext (wallet, provider)
│   │   ├── contracts/        # ABIs & deployed addresses
│   │   ├── pages/            # Dashboard pages (Patient, Hospital, Validator)
│   │   ├── services/         # Event service
│   │   ├── slices/           # Redux slices
│   │   └── utils/            # Contract helpers, Pinata utils
│   └── public/
├── .env.example          # Root env template
├── hardhat.config.js     # Hardhat configuration
└── package.json
```

---

## 3. Environment Configuration

### Root `.env` (for Hardhat deployment & validator)

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Fill in the values:

```env
# Your MetaMask wallet private key (deployer + validator)
# Export from MetaMask: Account Details > Show Private Key
PRIVATE_KEY=your_private_key_here

# Alchemy RPC URLs
SEPOLIA_RPC=https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
AMOY_RPC=https://polygon-amoy.g.alchemy.com/v2/YOUR_ALCHEMY_KEY

# Alchemy WebSocket URLs (for validator event listener)
SEPOLIA_WS=wss://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
AMOY_WS=wss://polygon-amoy.g.alchemy.com/v2/YOUR_ALCHEMY_KEY

# Block explorer API keys (optional — for contract verification)
ETHERSCAN_API_KEY=your_etherscan_api_key
POLYGONSCAN_API_KEY=your_polygonscan_api_key
```

### Frontend `.env` (for React app)

Create a `.env` file inside `frontend/`:

```bash
cp frontend/.env.example frontend/.env
```

Fill in the values:

```env
# Pinata IPFS credentials (for uploading medical records)
REACT_APP_PINATA_API_KEY=your_pinata_api_key
REACT_APP_PINATA_SECRET=your_pinata_secret

# RPC URLs (same Alchemy keys)
REACT_APP_SEPOLIA_RPC=https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
REACT_APP_AMOY_RPC=https://polygon-amoy.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
```

> **Note:** Contract addresses are auto-loaded from `frontend/src/contracts/addresses.json` after deployment. You don't need to manually set them in the frontend `.env`.

---

## 4. Compile & Deploy Smart Contracts

### Step 1: Compile

```bash
npx hardhat compile
```

This compiles all 5 Solidity contracts and generates artifacts in `artifacts/`.

### Step 2: Deploy to Both Chains

```bash
npm run deploy
```

This single command runs `scripts/deployAll.js` which:

1. Compiles contracts
2. Exports ABIs to `frontend/src/contracts/abis/`
3. Deploys all 5 contracts to **Polygon Amoy**
4. Deploys all 5 contracts to **Ethereum Sepolia**
5. Wires permissions on each chain:
   - Authorizes the Bridge contract on BRTToken (mint/burn)
   - Sets the Bridge contract on MedicalRecordNFT
   - Approves the deployer wallet as a Hospital
   - Adds the deployer wallet as a Validator
6. Saves all addresses to `frontend/src/contracts/addresses.json`

**Expected output:**

```
Deploying to AMOY (chainId: 80002)
  [1/5] Deploying BRTToken...       -> 0x...
  [2/5] Deploying MedicalRecordNFT... -> 0x...
  [3/5] Deploying ValidatorManager... -> 0x...
  [4/5] Deploying ConsentManager...   -> 0x...
  [5/5] Deploying HealthcareBridge... -> 0x...

Deploying to SEPOLIA (chainId: 11155111)
  [1/5] Deploying BRTToken...       -> 0x...
  ...

DEPLOYMENT COMPLETE - ALL CONTRACTS LIVE
```

> **Important:** Make sure your wallet has enough Sepolia ETH and Amoy POL to cover gas fees for deployment (~15-20 transactions per chain).

---

## 5. Run the Frontend

```bash
cd frontend
npm start
```

The React app will start at **http://localhost:3000**.

### Production Build

```bash
cd frontend
npm run build
```

The optimized build will be in `frontend/build/`. You can serve it with:

```bash
npx serve -s build
```

---

## 6. Run the Validator Service

Open a separate terminal:

```bash
npm run validator
```

This starts the event listener (`validator/validator.js`) which monitors both chains for bridge events (NFT locks, token locks, burns, etc.) and logs them in real-time.

> **Note:** The actual validation (signing & relaying) is done manually through the Validator Dashboard in the UI. The validator service only acts as a real-time event monitor.

---

## 7. Using the Application

### Connect Wallet

1. Open **http://localhost:3000**
2. Click **Connect Wallet** — MetaMask will prompt you
3. Make sure MetaMask is on either **Sepolia** or **Polygon Amoy**

### Select a Role

After connecting, choose your role:

| Role          | What You Can Do                                                          |
| ------------- | ------------------------------------------------------------------------ |
| **Patient**   | View records, grant/revoke access, bridge NFTs & BRT tokens              |
| **Hospital**  | Upload medical files to IPFS, mint Medical Record NFTs, manage patients  |
| **Validator** | View pending bridge transactions, validate & relay cross-chain transfers |

### Mint a Medical Record (Hospital Role)

1. Select **Hospital** role
2. Go to **Upload & Mint**
3. Enter patient wallet address, record type, and upload a file
4. Click **Mint MedicalRecordNFT**
5. Approve the BRT fee in MetaMask, then confirm the mint transaction

### Bridge an NFT Cross-Chain (Patient Role)

1. Select **Patient** role
2. Go to **Bridge Medical NFT**
3. Select the record to bridge from the dropdown
4. Click **Lock & Bridge NFT**
5. Switch to **Validator** role
6. Switch MetaMask to the **destination chain**
7. Go to **Pending Queue** and click **Validate** on the pending transaction
8. Switch back to **Patient** on the destination chain to verify the mirror NFT

### Grant Access to a Hospital (Patient Role)

1. Select **Patient** role
2. Go to **Grant Access**
3. Select a record and enter the hospital wallet address
4. Click **Grant Access**
5. The hospital can now view this record under **Granted Access**

### Bridge BRT Tokens (Patient Role)

1. Select **Patient** role
2. Go to **Bridge BRT Token**
3. Enter the amount to bridge
4. Click **Approve** then **Lock & Bridge** (or Burn & Bridge on Amoy)
5. Validator completes the relay on the destination chain

---

## 8. Troubleshooting

### "Soulbound: transfers disabled" when minting

This happens when a mirror NFT (from bridging) occupies the same token ID that `mintRecord` tries to use. Redeploy the MedicalRecordNFT contract — the latest version skips occupied token IDs.

### Alchemy 400 errors (eth_getLogs)

Alchemy free tier limits `eth_getLogs` to 10 blocks per request. The app handles this automatically by chunking queries into 9-block ranges.

### MetaMask stuck / transaction pending

- Open MetaMask > Settings > Advanced > Clear Activity Tab Data
- Make sure you have enough native tokens (ETH on Sepolia, POL on Amoy) for gas

### "Not an approved hospital" when minting

The deployer wallet is auto-approved during deployment. If using a different wallet:

```bash
# In Hardhat console or a script
const nft = await ethers.getContractAt("MedicalRecordNFT", "NFT_ADDRESS");
await nft.setHospitalApproval("HOSPITAL_WALLET_ADDRESS", true);
```

### Gas price too low on Amoy

The app uses the Polygon Gas Station API for accurate Amoy gas prices. If transactions are still stuck, try increasing gas manually in MetaMask.

### IPFS upload fails

- Verify your Pinata API key and secret in `frontend/.env`
- Check Pinata dashboard for API usage limits
- The app will fall back to a placeholder CID if IPFS upload fails (record still mints, but without the actual file)

### Switch Networks

Use the **Sepolia / Amoy** toggle buttons in the sidebar to switch networks. MetaMask will prompt you to confirm the network switch.

### Switch Roles

Use the **Patient / Hospital / Validator** buttons at the bottom of the sidebar to switch roles without going back to the home page.

---

## Quick Reference — Commands

| Command                        | Description                            |
| ------------------------------ | -------------------------------------- |
| `npm install`                  | Install root dependencies              |
| `cd frontend && npm install`   | Install frontend dependencies          |
| `npx hardhat compile`          | Compile smart contracts                |
| `npm run deploy`               | Deploy all contracts to Sepolia & Amoy |
| `cd frontend && npm start`     | Start React dev server (port 3000)     |
| `cd frontend && npm run build` | Build production frontend              |
| `npm run validator`            | Start validator event listener         |
