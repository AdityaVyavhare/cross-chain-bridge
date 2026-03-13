# Cross-Chain Token Bridge (Sepolia ↔ Polygon Amoy)

Minimal bi-directional cross-chain token bridge using Lock/Unlock + Burn/Mint mechanism with a single validator.

## Project Structure

```
cross-chain-bridge/
├── contracts/
│   ├── BridgeToken.sol       # ERC20 with mint/burn (owner-restricted)
│   ├── BridgeSepolia.sol     # Lock & Unlock bridge (Sepolia side)
│   └── BridgeAmoy.sol        # Burn & Mint bridge (Amoy side)
├── scripts/
│   ├── deployToken.js        # Deploy BridgeToken
│   ├── deploySepoliaBridge.js # Deploy Sepolia bridge
│   ├── deployAmoyBridge.js   # Deploy Amoy bridge
│   ├── setup.js              # Transfer token ownership to bridge
│   └── verify.js             # Verify contracts on explorer
├── test/
│   └── Bridge.test.js        # Full test suite
├── validator/
│   └── validator.js          # Event listener + relayer
├── frontend/
│   ├── public/
│   │   └── index.html
│   └── src/
│       ├── App.js            # Main app with navigation
│       ├── config.js         # Contract addresses & network config
│       ├── index.js
│       ├── index.css
│       ├── context/
│       │   └── BridgeContext.js  # React Context state management
│       ├── components/
│       │   ├── WalletConnect.js
│       │   ├── NetworkSwitch.js
│       │   └── TokenBalance.js
│       ├── pages/
│       │   ├── Home.js
│       │   ├── Transfer.js
│       │   └── History.js
│       └── utils/
│           ├── abis.js       # Contract ABI fragments
│           ├── contracts.js  # Contract helpers
│           └── pinata.js     # Pinata IPFS upload
├── hardhat.config.js
├── package.json
├── .env.example
└── README.md
```

## Architecture

### Sepolia → Amoy Flow
1. User **approves** BridgeToken for BridgeSepolia
2. User calls `lock(amount)` on BridgeSepolia → tokens transferred to bridge
3. `Locked` event emitted
4. **Validator** listens for event, signs message, calls `mint()` on BridgeAmoy
5. BridgeAmoy mints new tokens to user on Amoy

### Amoy → Sepolia Flow
1. User calls `burn(amount)` on BridgeAmoy → tokens burned
2. `Burned` event emitted
3. **Validator** listens for event, signs message, calls `unlock()` on BridgeSepolia
4. BridgeSepolia transfers locked tokens back to user on Sepolia

### Signature Verification
```
hash = keccak256(abi.encodePacked(user, amount, nonce, sourceChainId))
```
Each side verifies the validator's ECDSA signature before executing.

## Setup & Run

### 1. Install Dependencies

```bash
# Root (contracts + hardhat)
npm install

# Frontend
cd frontend
npm install
cd ..
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your private key and RPC URLs

cp frontend/.env.example frontend/.env
# Edit after deployment with contract addresses
```

### 3. Compile Contracts

```bash
npx hardhat compile
```

### 4. Run Tests

```bash
npx hardhat test
```

### 5. Deploy to Sepolia

```bash
npx hardhat run scripts/deployToken.js --network sepolia
# Note the token address → set SEPOLIA_TOKEN in .env

npx hardhat run scripts/deploySepoliaBridge.js --network sepolia
# Note the bridge address → set SEPOLIA_BRIDGE in .env
```

### 6. Deploy to Amoy

```bash
npx hardhat run scripts/deployToken.js --network amoy
# Note the token address → set AMOY_TOKEN in .env

npx hardhat run scripts/deployAmoyBridge.js --network amoy
# Note the bridge address → set AMOY_BRIDGE in .env
```

### 7. Transfer Ownership

```bash
npx hardhat run scripts/setup.js --network sepolia
npx hardhat run scripts/setup.js --network amoy
```

### 8. Update Frontend Config

Edit `frontend/.env`:
```
REACT_APP_SEPOLIA_TOKEN=0x...
REACT_APP_SEPOLIA_BRIDGE=0x...
REACT_APP_AMOY_TOKEN=0x...
REACT_APP_AMOY_BRIDGE=0x...
```

### 9. Start Validator

```bash
node validator/validator.js
```

### 10. Start Frontend

```bash
cd frontend
npm start
```

## Performing a Transfer

### Sepolia → Amoy
1. Connect MetaMask
2. Switch to Sepolia network
3. Enter amount, click **Approve**
4. Click **Lock (Sepolia → Amoy)**
5. Wait for validator to relay (~30s)
6. Switch to Amoy — see minted balance

### Amoy → Sepolia
1. Switch to Amoy network
2. Enter amount, click **Burn (Amoy → Sepolia)**
3. Wait for validator to relay (~30s)
4. Switch to Sepolia — tokens unlocked

## Getting Testnet Tokens

- **Sepolia ETH**: https://sepoliafaucet.com or https://www.alchemy.com/faucets/ethereum-sepolia
- **Amoy POL**: https://faucet.polygon.technology/ or https://www.alchemy.com/faucets/polygon-amoy

## Adding Networks to MetaMask

### Sepolia
- Network Name: Sepolia
- RPC URL: https://rpc.sepolia.org
- Chain ID: 11155111
- Currency: ETH
- Explorer: https://sepolia.etherscan.io

### Polygon Amoy
- Network Name: Polygon Amoy
- RPC URL: https://rpc-amoy.polygon.technology
- Chain ID: 80002
- Currency: POL
- Explorer: https://amoy.polygonscan.com

## Verify Contracts

```bash
npx hardhat run scripts/verify.js --network sepolia
npx hardhat run scripts/verify.js --network amoy
```

## Tech Stack

- Solidity 0.8.24 + OpenZeppelin v5
- Hardhat + ethers v5
- React (CRA) + ethers v5
- Single-file validator (Node.js)
- Pinata IPFS for metadata
- MetaMask wallet integration
