# Cross-Chain Bridge — Project Setup & Execution Guide

## Project Overview

This is a **bi-directional cross-chain token bridge** between **Ethereum Sepolia** and **Polygon Amoy** testnets.

### Architecture

```
┌─────────────────┐                          ┌─────────────────┐
│  Sepolia Chain   │                          │   Amoy Chain    │
│                  │                          │                 │
│  BridgeToken     │    ┌──────────────┐      │  BridgeToken    │
│  (ERC-20 BRT)   │◄──►│  Validator    │◄────►│  (ERC-20 BRT)  │
│                  │    │  (off-chain) │      │                 │
│  BridgeSepolia   │    └──────────────┘      │  BridgeAmoy     │
│  (Lock/Unlock)   │                          │  (Burn/Mint)    │
└─────────────────┘                          └─────────────────┘
```

### Bridge Mechanism

| Direction      | Source Action | Destination Action | Mechanism       |
| -------------- | ------------- | ------------------ | --------------- |
| Sepolia → Amoy | Lock tokens   | Mint tokens        | Lock-and-Mint   |
| Amoy → Sepolia | Burn tokens   | Unlock tokens      | Burn-and-Unlock |

### How It Works

1. **User** initiates a transfer on the source chain (Lock or Burn)
2. Smart contract emits an event (`Locked` or `Burned`)
3. **Validator** detects the event, signs the message, and submits to the destination chain
4. Destination contract verifies the validator signature and executes (Mint or Unlock)
5. **Redux store** updates in real-time across both User and Validator dashboards

### Smart Contracts

| Contract          | Network | Purpose                                       |
| ----------------- | ------- | --------------------------------------------- |
| BridgeToken.sol   | Both    | ERC-20 token (BRT) with mint/burn by owner    |
| BridgeSepolia.sol | Sepolia | Lock tokens (user), Unlock tokens (validator) |
| BridgeAmoy.sol    | Amoy    | Burn tokens (user), Mint tokens (validator)   |

---

## Prerequisites

- **Node.js** v18+ (with npm)
- **MetaMask** browser extension
- **Git** (optional, for cloning)
- Test ETH on Sepolia (from a faucet)
- Test POL on Amoy (from a faucet)

### Faucets

- Sepolia ETH: https://sepoliafaucet.com or https://faucets.chain.link
- Amoy POL: https://faucet.polygon.technology

---

## Environment Setup

### 1. Install Root Dependencies (Smart Contracts)

```bash
cd cross-chain-bridge
npm install
```

### 2. Install Frontend Dependencies

```bash
cd frontend
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the project root (`cross-chain-bridge/.env`):

```env
# Private key of deployer/validator (MetaMask account)
PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE

# RPC endpoints (Alchemy recommended)
SEPOLIA_RPC=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
AMOY_RPC=https://polygon-amoy.g.alchemy.com/v2/YOUR_KEY

# WebSocket RPCs (for validator real-time events)
SEPOLIA_WS=wss://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
AMOY_WS=wss://polygon-amoy.g.alchemy.com/v2/YOUR_KEY

# Deployed addresses (auto-filled by deploy scripts)
SEPOLIA_TOKEN=
SEPOLIA_BRIDGE=
AMOY_TOKEN=
AMOY_BRIDGE=

# Block explorer API keys (optional, for verification)
ETHERSCAN_API_KEY=
POLYGONSCAN_API_KEY=
```

> **Important:** Never commit your private key. The `.env` file is gitignored.

---

## Smart Contract Deployment

### Compile Contracts

```bash
npx hardhat compile
```

### Run Tests

```bash
npx hardhat test
```

All 10 tests should pass, covering:

- Token deployment & initial supply
- Lock/Unlock on Sepolia
- Burn/Mint on Amoy
- Replay attack prevention
- Invalid signature rejection

### Deploy to Sepolia

```bash
npx hardhat run scripts/deployAllChains.js --network sepolia
```

### Deploy to Amoy

```bash
npx hardhat run scripts/deployAllChains.js --network amoy
```

### What Deployment Does

Each deployment automatically:

1. Deploys `BridgeToken` (BRT) to the target network
2. Deploys the correct Bridge contract (`BridgeSepolia` or `BridgeAmoy`)
3. Transfers token ownership to the bridge (so it can mint/burn)
4. Exports ABIs to `frontend/src/contracts/abis/`
5. Saves contract addresses to `frontend/src/contracts/addresses.json`

> The frontend automatically picks up the new addresses — no manual copying required.

### Deploy to Local Hardhat Node (for testing)

Terminal 1:

```bash
npx hardhat node
```

Terminal 2:

```bash
npx hardhat run scripts/deployAllChains.js --network localhost
```

### Individual Deployment (Advanced)

If you prefer deploying step-by-step:

```bash
# 1. Deploy token
npx hardhat run scripts/deployToken.js --network sepolia

# 2. Update .env with SEPOLIA_TOKEN address, then:
npx hardhat run scripts/deploySepoliaBridge.js --network sepolia

# 3. Transfer ownership
npx hardhat run scripts/setup.js --network sepolia
```

---

## Frontend Setup

### Start Development Server

```bash
cd frontend
npm start
```

The app opens at `http://localhost:3000`.

### Build for Production

```bash
cd frontend
npm run build
```

### Frontend Architecture

```
frontend/src/
├── App.js                    # Main app with tab navigation
├── index.js                  # Entry point with Redux Provider
├── index.css                 # Global styles
├── config.js                 # Network configs + deployed addresses
├── store/
│   └── index.js              # Redux store (wallet + bridge slices)
├── slices/
│   ├── walletSlice.js        # Wallet connection state
│   └── bridgeSlice.js        # Bridge transactions state
├── services/
│   └── eventService.js       # Real-time event listeners
├── hooks/
│   └── useBridgeEvents.js    # Hook to boot event listeners
├── context/
│   └── BridgeContext.js      # Wallet connection context
├── contracts/
│   ├── index.js              # ABI + address re-exports
│   ├── addresses.json        # Auto-generated contract addresses
│   └── abis/                 # Auto-generated ABI files
├── pages/
│   ├── Home.js               # Dashboard with stats
│   ├── Transfer.js           # Bridge transfer interface
│   ├── History.js            # Transaction history
│   └── ValidatorDashboard.js # Validator operations panel
├── components/
│   ├── WalletConnect.js      # MetaMask connection button
│   ├── NetworkSwitch.js      # Sepolia/Amoy chain switcher
│   └── TokenBalance.js       # BRT balance display
└── utils/
    ├── contracts.js           # Contract helper functions
    ├── abis.js               # Minimal ABI fragments
    └── pinata.js             # IPFS upload helper
```

---

## Validator Operations

### What is the Validator?

The validator is a trusted entity (currently a single MetaMask account) that:

1. Monitors bridge events on both chains
2. Signs relay messages with ECDSA
3. Submits transactions to the destination chain

### Option A: Automatic Validator (Background Script)

Run the Node.js validator script:

```bash
cd cross-chain-bridge
node validator/validator.js
```

This script:

- Connects via WebSocket to both Sepolia and Amoy
- Listens for `Locked` events → signs → calls `mint()` on Amoy
- Listens for `Burned` events → signs → calls `unlock()` on Sepolia
- Runs continuously until stopped

> Requires `SEPOLIA_WS` and `AMOY_WS` in `.env`.

### Option B: Manual Validator (Browser Dashboard)

1. Open the frontend (`http://localhost:3000`)
2. Click the **Validator** tab
3. Connect MetaMask with the validator account (same private key used for deployment)
4. View all pending bridge transactions in real-time
5. Click **"Validate & Relay"** on any pending transaction
6. MetaMask will prompt for signature, then submit the relay transaction
7. Transaction status updates to "Completed" automatically

### Validator Dashboard Sections

| Section   | Description                            |
| --------- | -------------------------------------- |
| Pending   | Transfers waiting for validator action |
| Validated | Transfers signed but relay in progress |
| Completed | Successfully bridged transfers         |

---

## Testing Cross-Chain Transfer

### Step-by-Step Test

1. **Deploy** contracts to both Sepolia and Amoy (see Deployment section)

2. **Start Frontend**

   ```bash
   cd frontend && npm start
   ```

3. **Start Validator** (pick one):

   - Background: `node validator/validator.js`
   - Or use the Validator Dashboard in the browser

4. **Connect MetaMask** to Sepolia

5. **Transfer (Sepolia → Amoy)**:

   - Go to the **Transfer** tab
   - Enter an amount (e.g., `100`)
   - Click **"1. Approve"** — confirm in MetaMask
   - Click **"2. Lock & Bridge →"** — confirm in MetaMask
   - The Validator will detect the `Locked` event and mint on Amoy

6. **Switch MetaMask to Amoy** and verify BRT balance increased

7. **Transfer (Amoy → Sepolia)**:

   - Stay on the **Transfer** tab (source chain is now Amoy)
   - Enter an amount (e.g., `50`)
   - Click **"Burn & Bridge →"** — confirm in MetaMask
   - The Validator will detect the `Burned` event and unlock on Sepolia

8. **Check History** tab for all transaction records

---

## MetaMask Network Configuration

### Add Sepolia

| Field           | Value                        |
| --------------- | ---------------------------- |
| Network Name    | Sepolia                      |
| RPC URL         | https://rpc.sepolia.org      |
| Chain ID        | 11155111                     |
| Currency Symbol | ETH                          |
| Block Explorer  | https://sepolia.etherscan.io |

### Add Polygon Amoy

| Field           | Value                               |
| --------------- | ----------------------------------- |
| Network Name    | Polygon Amoy                        |
| RPC URL         | https://rpc-amoy.polygon.technology |
| Chain ID        | 80002                               |
| Currency Symbol | POL                                 |
| Block Explorer  | https://amoy.polygonscan.com        |

> The app will automatically prompt to add these networks when you click the network switch buttons.

### Add BRT Token to MetaMask

After deployment, add the BRT token to MetaMask:

1. Open MetaMask → Import Tokens
2. Paste the BridgeToken contract address for the current network
3. Token Symbol: BRT, Decimals: 18

Addresses can be found in `frontend/src/contracts/addresses.json`.

---

## Troubleshooting

### Common Issues

#### "Module not found" Errors

```bash
cd frontend
rm -rf node_modules
npm install
```

#### Contract Addresses Not Loading

Verify `frontend/src/contracts/addresses.json` has been populated:

```bash
cat frontend/src/contracts/addresses.json
```

If empty, redeploy:

```bash
npx hardhat run scripts/deployAllChains.js --network sepolia
npx hardhat run scripts/deployAllChains.js --network amoy
```

#### "Invalid signature" on Validator Relay

The validator account must match the `validator` address set in the bridge contracts. This is the account that deployed the contracts (same `PRIVATE_KEY` in `.env`).

#### MetaMask "Nonce too high" Error

Reset MetaMask account: Settings → Advanced → Clear Activity Tab Data

#### Hardhat Node Issues

If `npx hardhat node` fails, check no other process is using port 8545:

```bash
# Windows
netstat -ano | findstr :8545
```

#### Compilation Errors (mcopy opcode)

Ensure `hardhat.config.js` has:

```javascript
settings: {
  evmVersion: "cancun";
}
```

#### Validator WebSocket Disconnects

Use Alchemy WebSocket endpoints (more reliable than public RPCs). Ensure `SEPOLIA_WS` and `AMOY_WS` are set in `.env`.

#### Frontend Shows 0 Balance

1. Verify you're on a supported network (Sepolia or Amoy)
2. Check the token address is correct in `addresses.json`
3. Ensure the token was deployed on that network

---

## Supported Networks

| Network          | Chain ID | Type        |
| ---------------- | -------- | ----------- |
| Ethereum Sepolia | 11155111 | Testnet     |
| Polygon Amoy     | 80002    | Testnet     |
| Hardhat Local    | 31337    | Development |

---

## Technology Stack

| Component        | Technology                               |
| ---------------- | ---------------------------------------- |
| Smart Contracts  | Solidity 0.8.24, OpenZeppelin v5         |
| Development      | Hardhat, ethers.js v5                    |
| Frontend         | React 18, Redux Toolkit, ethers.js       |
| State Management | Redux Toolkit (bridgeSlice, walletSlice) |
| Real-time Events | ethers.js contract event listeners       |
| Wallet           | MetaMask (Web3Provider)                  |
| Signature        | ECDSA (EIP-191 personal sign)            |
