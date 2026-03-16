# Healthcare Medical NFT Bridge (Sepolia <-> Polygon Amoy)

Decentralized healthcare record platform with cross-chain NFT and BRT token bridging.

Hospitals create encrypted medical records as soulbound NFTs. Patients own and control access to their records. Medical NFTs and BRT tokens can be transferred across chains using a validator-based bridge.

## Architecture

### System Components

| Component            | Description                                                        |
| -------------------- | ------------------------------------------------------------------ |
| **BRTToken**         | ERC20 utility token (minting fees, bridge fees, validator rewards) |
| **MedicalRecordNFT** | Soulbound ERC721 with encrypted IPFS metadata                      |
| **ConsentManager**   | Patient-controlled hospital access permissions                     |
| **ValidatorManager** | Manages approved bridge validators                                 |
| **HealthcareBridge** | Cross-chain bridge for both NFTs and BRT tokens                    |

### NFT Bridge Flow (Sepolia -> Amoy)

1. Hospital mints MedicalRecordNFT to patient (pays BRT fee)
2. Patient calls `lockNFT(tokenId, destChain)` on HealthcareBridge (pays BRT fee)
3. `NFTLocked` event emitted with full metadata
4. Validator detects event, signs message, calls `mintMirrorNFT()` on Amoy
5. Mirror NFT minted to patient on Amoy (validator earns BRT reward)

### NFT Bridge Flow (Amoy -> Sepolia)

1. Patient calls `burnMirrorNFT(tokenId)` on Amoy (pays BRT fee)
2. `NFTBurned` event emitted
3. Validator detects event, signs message, calls `unlockNFT()` on Sepolia
4. Original NFT unlocked on Sepolia (validator earns BRT reward)

### Token Bridge Flow (Sepolia -> Amoy)

1. Patient calls `lockTokens(amount)` (pays BRT fee)
2. `TokenLocked` event emitted
3. Validator calls `mintTokens()` on Amoy
4. BRT minted to patient on Amoy

### Token Bridge Flow (Amoy -> Sepolia)

1. Patient calls `burnTokens(amount)` (pays BRT fee)
2. `TokenBurned` event emitted
3. Validator calls `unlockTokens()` on Sepolia
4. BRT transferred back to patient

### Signature Verification

```
Token: keccak256(abi.encodePacked("TOKEN", user, amount, nonce, sourceChainId))
NFT:   keccak256(abi.encodePacked("NFT", patient, tokenId, nonce, sourceChainId))
```

ValidatorManager verifies the signer is an approved validator.

## Project Structure

```
cross-chain-bridge/
contracts/
  BRTToken.sol              # ERC20 with bridge mint/burn authorization
  MedicalRecordNFT.sol      # Soulbound ERC721 with metadata + bridge ops
  ConsentManager.sol        # Patient access control per record
  ValidatorManager.sol      # Approved validator registry
  HealthcareBridge.sol      # NFT + Token cross-chain bridge
scripts/
  deployAll.js              # Deploy all 5 contracts + wire permissions
  updateFrontend.js         # Export ABIs + addresses to frontend
test/
  HealthcareBridge.test.js  # Full test suite (36 tests)
validator/
  validator.js              # Event monitor for both chains
frontend/src/
  App.js                    # Main app — 6 tabs
  config.js                 # Network + contract configuration
  pages/
    Home.js                 # Landing page + dashboard
    PatientDashboard.js     # View records, manage access, bridge NFTs
    HospitalDashboard.js    # Upload + mint medical record NFTs
    Transfer.js             # BRT token bridge
    ValidatorDashboard.js   # Validate + relay bridge transactions
    Activity.js             # Full transaction history
  components/
    WalletConnect.js
    NetworkSwitch.js
    TokenBalance.js
  context/
    BridgeContext.js         # React Context (wallet, provider, signer)
  services/
    eventService.js          # Real-time event listeners for all bridge events
  slices/
    bridgeSlice.js           # Redux state for bridge transactions
    walletSlice.js           # Redux state for wallet
  utils/
    contracts.js             # Contract factories for all 5 contracts
    pinata.js                # IPFS upload via Pinata
```

## Setup & Run

### 1. Install Dependencies

```bash
npm install
cd frontend && npm install && cd ..
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your private key and RPC URLs
```

### 3. Compile Contracts

```bash
npx hardhat compile
```

### 4. Run Tests

```bash
npx hardhat test test/HealthcareBridge.test.js
```

### 5. Deploy to Sepolia (all contracts)

```bash
npx hardhat run scripts/deployAll.js --network sepolia
```

### 6. Deploy to Amoy (all contracts)

```bash
npx hardhat run scripts/deployAll.js --network amoy
```

### 7. Start Validator Monitor

```bash
node validator/validator.js
```

### 8. Start Frontend

```bash
cd frontend
npm start
```

## Smart Contract Details

### BRTToken.sol

- ERC20 with 1M initial supply
- `mint()` and `burn()` callable by owner or authorized bridges
- `setBridge(addr, bool)` grants/revokes bridge authorization

### MedicalRecordNFT.sol

- Soulbound ERC721 (transfers disabled between wallets)
- Metadata: patient, hospital, recordType, encryptedCID, timestamp, originalChainId
- `mintRecord()` restricted to approved hospitals
- `lockForBridge()`, `unlockRecord()`, `mintMirror()`, `burnMirror()` for bridge ops

### ConsentManager.sol

- `grantAccess(tokenId, hospital)` — only patient can call
- `revokeAccess(tokenId, hospital)` — only patient can call
- `checkAccess(tokenId, hospital)` — public view

### ValidatorManager.sol

- Owner adds/removes validators
- Bridge verifies signatures come from approved validators

### HealthcareBridge.sol

- Unified bridge for both tokens and NFTs
- Separate nonce counters for token and NFT operations
- Bridge fee collected on lock/burn operations
- Validator rewards minted on mint/unlock relay
- ECDSA signature verification via ValidatorManager

## Security

- Replay protection via nonce-based `processed` mappings
- ECDSA signature verification (EIP-191)
- Soulbound NFTs prevent unauthorized transfers
- Only approved hospitals can mint records
- Only patients can manage access permissions
- Only approved validators can relay bridge transactions
- Medical data encrypted before IPFS upload

## Tech Stack

- Solidity 0.8.24 + OpenZeppelin v5
- Hardhat + ethers v5
- React 18 + Redux Toolkit + ethers v5
- Pinata IPFS for encrypted record storage
- MetaMask wallet integration
- Node.js validator monitor
