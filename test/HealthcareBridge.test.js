const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Healthcare Medical NFT Bridge", function () {
  let brtToken, nft, consentManager, validatorManager, bridge;
  let owner, hospital, patient, validator, other;
  const SEPOLIA_CHAIN_ID = 11155111;
  const AMOY_CHAIN_ID = 80002;
  const AMOUNT = ethers.utils.parseEther("100");
  const BRIDGE_FEE = ethers.utils.parseEther("1");

  beforeEach(async function () {
    [owner, hospital, patient, validator, other] = await ethers.getSigners();

    // Deploy BRTToken
    const BRTToken = await ethers.getContractFactory("BRTToken");
    brtToken = await BRTToken.deploy("Bridge Token", "BRT");
    await brtToken.deployed();

    // Deploy MedicalRecordNFT
    const MedicalRecordNFT = await ethers.getContractFactory(
      "MedicalRecordNFT",
    );
    nft = await MedicalRecordNFT.deploy();
    await nft.deployed();

    // Deploy ValidatorManager
    const ValidatorManager = await ethers.getContractFactory(
      "ValidatorManager",
    );
    validatorManager = await ValidatorManager.deploy();
    await validatorManager.deployed();
    await validatorManager.addValidator(validator.address);

    // Deploy ConsentManager
    const ConsentManager = await ethers.getContractFactory("ConsentManager");
    consentManager = await ConsentManager.deploy(nft.address);
    await consentManager.deployed();

    // Deploy HealthcareBridge
    const HealthcareBridge = await ethers.getContractFactory(
      "HealthcareBridge",
    );
    bridge = await HealthcareBridge.deploy(
      brtToken.address,
      nft.address,
      validatorManager.address,
    );
    await bridge.deployed();

    // Wire permissions
    await brtToken.setBridge(bridge.address, true);
    await nft.setBridgeContract(bridge.address);
    await nft.setHospitalApproval(hospital.address, true);

    // Give patient some BRT tokens for fees
    await brtToken.transfer(patient.address, ethers.utils.parseEther("1000"));

    // Give bridge some BRT tokens (to simulate locked tokens for unlock)
    await brtToken.transfer(bridge.address, ethers.utils.parseEther("5000"));
  });

  // ── Helper: create validator signature for token bridge ──
  async function signTokenMessage(signer, user, amount, nonce, chainId) {
    const messageHash = ethers.utils.solidityKeccak256(
      ["string", "address", "uint256", "uint256", "uint256"],
      ["TOKEN", user, amount, nonce, chainId],
    );
    return signer.signMessage(ethers.utils.arrayify(messageHash));
  }

  // ── Helper: create validator signature for NFT bridge ────
  async function signNFTMessage(signer, patient, tokenId, nonce, chainId) {
    const messageHash = ethers.utils.solidityKeccak256(
      ["string", "address", "uint256", "uint256", "uint256"],
      ["NFT", patient, tokenId, nonce, chainId],
    );
    return signer.signMessage(ethers.utils.arrayify(messageHash));
  }

  // ═══════════════════════════════════════════════════════════
  //  DEPLOYMENT
  // ═══════════════════════════════════════════════════════════
  describe("Deployment", function () {
    it("Should deploy all contracts correctly", async function () {
      expect(brtToken.address).to.be.properAddress;
      expect(nft.address).to.be.properAddress;
      expect(consentManager.address).to.be.properAddress;
      expect(validatorManager.address).to.be.properAddress;
      expect(bridge.address).to.be.properAddress;
    });

    it("Should set correct validator", async function () {
      expect(await validatorManager.isValidator(validator.address)).to.be.true;
      expect(await validatorManager.validatorCount()).to.equal(1);
    });

    it("Should approve hospital correctly", async function () {
      expect(await nft.approvedHospitals(hospital.address)).to.be.true;
      expect(await nft.approvedHospitals(other.address)).to.be.false;
    });

    it("Should authorize bridge on BRTToken", async function () {
      expect(await brtToken.bridges(bridge.address)).to.be.true;
    });

    it("Should set bridge on NFT contract", async function () {
      expect(await nft.bridgeContract()).to.equal(bridge.address);
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  BRT TOKEN
  // ═══════════════════════════════════════════════════════════
  describe("BRTToken", function () {
    it("Should have correct initial supply", async function () {
      const total = await brtToken.totalSupply();
      // Owner minted 1M, transferred 1000 to patient and 5000 to bridge
      expect(total).to.equal(ethers.utils.parseEther("1000000"));
    });

    it("Should allow bridge to mint", async function () {
      // Bridge contract calls mint — simulate via setBridge on a test account
      await brtToken.setBridge(other.address, true);
      await brtToken.connect(other).mint(patient.address, AMOUNT);
      expect(await brtToken.balanceOf(patient.address)).to.equal(
        ethers.utils.parseEther("1000").add(AMOUNT),
      );
    });

    it("Should not allow unauthorized to mint", async function () {
      await expect(
        brtToken.connect(other).mint(patient.address, AMOUNT),
      ).to.be.revertedWith("Not authorized");
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  MEDICAL RECORD NFT — MINTING
  // ═══════════════════════════════════════════════════════════
  describe("MedicalRecordNFT Minting", function () {
    it("Should allow approved hospital to mint record", async function () {
      const tx = await nft
        .connect(hospital)
        .mintRecord(patient.address, "Blood Test", "QmEncryptedCID123");
      const receipt = await tx.wait();

      const event = receipt.events.find((e) => e.event === "RecordMinted");
      expect(event).to.not.be.undefined;
      expect(event.args.tokenId).to.equal(0);
      expect(event.args.patient).to.equal(patient.address);
      expect(event.args.hospital).to.equal(hospital.address);

      expect(await nft.ownerOf(0)).to.equal(patient.address);
    });

    it("Should store correct metadata", async function () {
      await nft
        .connect(hospital)
        .mintRecord(patient.address, "X-Ray", "QmEncryptedXray456");

      const [pat, hosp, recType, cid, ts, chainId] =
        await nft.getRecordMetadata(0);
      expect(pat).to.equal(patient.address);
      expect(hosp).to.equal(hospital.address);
      expect(recType).to.equal("X-Ray");
      expect(cid).to.equal("QmEncryptedXray456");
      expect(ts).to.be.gt(0);
      expect(chainId).to.equal(31337); // hardhat chain id
    });

    it("Should reject minting from non-hospital", async function () {
      await expect(
        nft.connect(other).mintRecord(patient.address, "Test", "QmCID"),
      ).to.be.revertedWith("Not approved hospital");
    });

    it("Should be soulbound (no transfers)", async function () {
      await nft.connect(hospital).mintRecord(patient.address, "Test", "QmCID");

      await expect(
        nft.connect(patient).transferFrom(patient.address, other.address, 0),
      ).to.be.revertedWith("Soulbound: transfers disabled");
    });

    it("Should track patient tokens", async function () {
      await nft.connect(hospital).mintRecord(patient.address, "A", "QmA");
      await nft.connect(hospital).mintRecord(patient.address, "B", "QmB");

      const tokens = await nft.getPatientTokens(patient.address);
      expect(tokens.length).to.equal(2);
      expect(tokens[0]).to.equal(0);
      expect(tokens[1]).to.equal(1);
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  CONSENT MANAGER
  // ═══════════════════════════════════════════════════════════
  describe("ConsentManager", function () {
    beforeEach(async function () {
      await nft
        .connect(hospital)
        .mintRecord(patient.address, "Blood Test", "QmCID");
    });

    it("Should allow patient to grant access", async function () {
      await consentManager.connect(patient).grantAccess(0, hospital.address);
      expect(await consentManager.checkAccess(0, hospital.address)).to.be.true;
    });

    it("Should allow patient to revoke access", async function () {
      await consentManager.connect(patient).grantAccess(0, hospital.address);
      await consentManager.connect(patient).revokeAccess(0, hospital.address);
      expect(await consentManager.checkAccess(0, hospital.address)).to.be.false;
    });

    it("Should reject non-patient granting access", async function () {
      await expect(
        consentManager.connect(other).grantAccess(0, hospital.address),
      ).to.be.revertedWith("Not record owner");
    });

    it("Should track access list", async function () {
      await consentManager.connect(patient).grantAccess(0, hospital.address);
      await consentManager.connect(patient).grantAccess(0, other.address);

      const list = await consentManager.getAccessList(0);
      expect(list.length).to.equal(2);
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  VALIDATOR MANAGER
  // ═══════════════════════════════════════════════════════════
  describe("ValidatorManager", function () {
    it("Should add validator", async function () {
      await validatorManager.addValidator(other.address);
      expect(await validatorManager.isValidator(other.address)).to.be.true;
      expect(await validatorManager.validatorCount()).to.equal(2);
    });

    it("Should remove validator", async function () {
      await validatorManager.removeValidator(validator.address);
      expect(await validatorManager.isValidator(validator.address)).to.be.false;
      expect(await validatorManager.validatorCount()).to.equal(0);
    });

    it("Should reject non-owner adding validator", async function () {
      await expect(validatorManager.connect(other).addValidator(other.address))
        .to.be.reverted;
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  TOKEN BRIDGE: Sepolia → Amoy (Lock → Mint)
  // ═══════════════════════════════════════════════════════════
  describe("Token Bridge: Lock -> Mint", function () {
    it("Should lock BRT tokens on source chain", async function () {
      const lockAmount = ethers.utils.parseEther("50");
      const totalNeeded = lockAmount.add(BRIDGE_FEE);

      // Patient approves bridge for lock + fee
      await brtToken.connect(patient).approve(bridge.address, totalNeeded);

      const tx = await bridge.connect(patient).lockTokens(lockAmount);
      const receipt = await tx.wait();

      const event = receipt.events.find((e) => e.event === "TokenLocked");
      expect(event).to.not.be.undefined;
      expect(event.args.user).to.equal(patient.address);
      expect(event.args.amount).to.equal(lockAmount);
      expect(event.args.nonce).to.equal(0);
    });

    it("Should mint BRT tokens on dest chain with valid signature", async function () {
      const mintAmount = ethers.utils.parseEther("50");
      const nonce = 0;
      const signature = await signTokenMessage(
        validator,
        patient.address,
        mintAmount,
        nonce,
        SEPOLIA_CHAIN_ID,
      );

      const balBefore = await brtToken.balanceOf(patient.address);
      await bridge
        .connect(validator)
        .mintTokens(
          patient.address,
          mintAmount,
          nonce,
          SEPOLIA_CHAIN_ID,
          signature,
        );
      const balAfter = await brtToken.balanceOf(patient.address);

      expect(balAfter.sub(balBefore)).to.equal(mintAmount);
    });

    it("Should prevent replay attack on mint", async function () {
      const mintAmount = ethers.utils.parseEther("50");
      const nonce = 0;
      const signature = await signTokenMessage(
        validator,
        patient.address,
        mintAmount,
        nonce,
        SEPOLIA_CHAIN_ID,
      );

      await bridge
        .connect(validator)
        .mintTokens(
          patient.address,
          mintAmount,
          nonce,
          SEPOLIA_CHAIN_ID,
          signature,
        );

      await expect(
        bridge
          .connect(validator)
          .mintTokens(
            patient.address,
            mintAmount,
            nonce,
            SEPOLIA_CHAIN_ID,
            signature,
          ),
      ).to.be.revertedWith("Already processed");
    });

    it("Should reject invalid signature on mint", async function () {
      const mintAmount = ethers.utils.parseEther("50");
      const badSig = await signTokenMessage(
        other, // wrong signer
        patient.address,
        mintAmount,
        0,
        SEPOLIA_CHAIN_ID,
      );

      await expect(
        bridge
          .connect(other)
          .mintTokens(patient.address, mintAmount, 0, SEPOLIA_CHAIN_ID, badSig),
      ).to.be.revertedWith("Invalid validator signature");
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  TOKEN BRIDGE: Amoy → Sepolia (Burn → Unlock)
  // ═══════════════════════════════════════════════════════════
  describe("Token Bridge: Burn -> Unlock", function () {
    it("Should burn and unlock in reverse direction", async function () {
      const amount = ethers.utils.parseEther("50");

      // First mint tokens to patient on Amoy side (nonce 0)
      const mintSig = await signTokenMessage(
        validator,
        patient.address,
        amount,
        0,
        SEPOLIA_CHAIN_ID,
      );
      await bridge
        .connect(validator)
        .mintTokens(patient.address, amount, 0, SEPOLIA_CHAIN_ID, mintSig);

      // Patient approves for burn + fee
      const totalNeeded = amount.add(BRIDGE_FEE);
      await brtToken.connect(patient).approve(bridge.address, totalNeeded);

      // Burn on Amoy side
      const burnTx = await bridge.connect(patient).burnTokens(amount);
      const burnReceipt = await burnTx.wait();
      const burnEvent = burnReceipt.events.find(
        (e) => e.event === "TokenBurned",
      );
      expect(burnEvent).to.not.be.undefined;

      // Validator signs unlock (nonce 1 — different from mint nonce 0)
      const unlockSig = await signTokenMessage(
        validator,
        patient.address,
        amount,
        1,
        AMOY_CHAIN_ID,
      );

      const balBefore = await brtToken.balanceOf(patient.address);
      await bridge
        .connect(validator)
        .unlockTokens(patient.address, amount, 1, AMOY_CHAIN_ID, unlockSig);
      const balAfter = await brtToken.balanceOf(patient.address);

      expect(balAfter.sub(balBefore)).to.equal(amount);
    });

    it("Should prevent replay on unlock", async function () {
      const amount = ethers.utils.parseEther("25");
      const signature = await signTokenMessage(
        validator,
        patient.address,
        amount,
        0,
        AMOY_CHAIN_ID,
      );

      await bridge
        .connect(validator)
        .unlockTokens(patient.address, amount, 0, AMOY_CHAIN_ID, signature);

      await expect(
        bridge
          .connect(validator)
          .unlockTokens(patient.address, amount, 0, AMOY_CHAIN_ID, signature),
      ).to.be.revertedWith("Already processed");
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  NFT BRIDGE: Sepolia → Amoy (Lock → Mint Mirror)
  // ═══════════════════════════════════════════════════════════
  describe("NFT Bridge: Lock -> Mint Mirror", function () {
    beforeEach(async function () {
      // Hospital mints a medical record for patient
      await nft
        .connect(hospital)
        .mintRecord(patient.address, "Blood Test", "QmEncryptedBlood");
    });

    it("Should lock NFT and emit event", async function () {
      // Patient approves bridge fee
      await brtToken.connect(patient).approve(bridge.address, BRIDGE_FEE);

      const tx = await bridge.connect(patient).lockNFT(0, AMOY_CHAIN_ID);
      const receipt = await tx.wait();

      const event = receipt.events.find((e) => e.event === "NFTLocked");
      expect(event).to.not.be.undefined;
      expect(event.args.patient).to.equal(patient.address);
      expect(event.args.tokenId).to.equal(0);
      expect(event.args.destinationChainId).to.equal(AMOY_CHAIN_ID);

      // Verify NFT is locked
      expect(await nft.lockedForBridge(0)).to.be.true;
    });

    it("Should mint mirror NFT on destination chain", async function () {
      // Use tokenId 100 for mirror — avoids collision with original tokenId 0
      // (on a real cross-chain setup these would be on different chains)
      const signature = await signNFTMessage(
        validator,
        patient.address,
        100, // mirror tokenId
        0, // nonce
        SEPOLIA_CHAIN_ID,
      );

      const tx = await bridge.connect(validator).mintMirrorNFT(
        patient.address,
        100,
        0,
        SEPOLIA_CHAIN_ID,
        "Blood Test",
        "QmEncryptedBlood",
        hospital.address,
        SEPOLIA_CHAIN_ID,
        signature,
      );
      const receipt = await tx.wait();

      const event = receipt.events.find((e) => e.event === "NFTMinted");
      expect(event).to.not.be.undefined;
      expect(event.args.tokenId).to.equal(100);

      // Mirror should be owned by patient
      expect(await nft.ownerOf(100)).to.equal(patient.address);
      expect(await nft.isMirror(100)).to.be.true;
    });

    it("Should prevent replay on NFT mint", async function () {
      const signature = await signNFTMessage(
        validator,
        patient.address,
        200,
        0,
        SEPOLIA_CHAIN_ID,
      );

      await bridge
        .connect(validator)
        .mintMirrorNFT(
          patient.address,
          200,
          0,
          SEPOLIA_CHAIN_ID,
          "Blood Test",
          "QmEncryptedBlood",
          hospital.address,
          SEPOLIA_CHAIN_ID,
          signature,
        );

      await expect(
        bridge
          .connect(validator)
          .mintMirrorNFT(
            patient.address,
            200,
            0,
            SEPOLIA_CHAIN_ID,
            "Blood Test",
            "QmEncryptedBlood",
            hospital.address,
            SEPOLIA_CHAIN_ID,
            signature,
          ),
      ).to.be.revertedWith("Already processed");
    });

    it("Should reject non-owner trying to lock NFT", async function () {
      await expect(
        bridge.connect(other).lockNFT(0, AMOY_CHAIN_ID),
      ).to.be.revertedWith("Not NFT owner");
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  NFT BRIDGE: Amoy → Sepolia (Burn Mirror → Unlock)
  // ═══════════════════════════════════════════════════════════
  describe("NFT Bridge: Burn Mirror -> Unlock", function () {
    beforeEach(async function () {
      // Mint original record (tokenId 0)
      await nft
        .connect(hospital)
        .mintRecord(patient.address, "ECG Report", "QmEncryptedECG");

      // Lock the original
      await brtToken.connect(patient).approve(bridge.address, BRIDGE_FEE);
      await bridge.connect(patient).lockNFT(0, AMOY_CHAIN_ID);

      // Mint mirror on "dest chain" (same chain for testing)
      // Use tokenId 300 to avoid collision with originals
      const sig = await signNFTMessage(
        validator,
        patient.address,
        300,
        0,
        SEPOLIA_CHAIN_ID,
      );
      await bridge
        .connect(validator)
        .mintMirrorNFT(
          patient.address,
          300,
          0,
          SEPOLIA_CHAIN_ID,
          "ECG Report",
          "QmEncryptedECG",
          hospital.address,
          SEPOLIA_CHAIN_ID,
          sig,
        );
    });

    it("Should burn mirror NFT", async function () {
      // Patient approves bridge fee for burn
      await brtToken.connect(patient).approve(bridge.address, BRIDGE_FEE);

      const tx = await bridge.connect(patient).burnMirrorNFT(300);
      const receipt = await tx.wait();

      const event = receipt.events.find((e) => e.event === "NFTBurned");
      expect(event).to.not.be.undefined;
      expect(event.args.patient).to.equal(patient.address);
      expect(event.args.tokenId).to.equal(300);
    });

    it("Should unlock original NFT after reverse bridge", async function () {
      expect(await nft.lockedForBridge(0)).to.be.true;

      const sig = await signNFTMessage(
        validator,
        patient.address,
        0,
        1, // nonce 1 since 0 was used for mirror mint
        AMOY_CHAIN_ID,
      );

      await bridge
        .connect(validator)
        .unlockNFT(patient.address, 0, 1, AMOY_CHAIN_ID, sig);

      expect(await nft.lockedForBridge(0)).to.be.false;
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  VALIDATOR REWARDS
  // ═══════════════════════════════════════════════════════════
  describe("Validator Rewards", function () {
    it("Should reward validator on mint relay", async function () {
      const amount = ethers.utils.parseEther("50");
      const sig = await signTokenMessage(
        validator,
        patient.address,
        amount,
        0,
        SEPOLIA_CHAIN_ID,
      );

      const balBefore = await brtToken.balanceOf(validator.address);
      await bridge
        .connect(validator)
        .mintTokens(patient.address, amount, 0, SEPOLIA_CHAIN_ID, sig);
      const balAfter = await brtToken.balanceOf(validator.address);

      const reward = await bridge.validatorReward();
      expect(balAfter.sub(balBefore)).to.equal(reward);
    });

    it("Should reward validator on NFT mint relay", async function () {
      const sig = await signNFTMessage(
        validator,
        patient.address,
        0,
        0,
        SEPOLIA_CHAIN_ID,
      );

      const balBefore = await brtToken.balanceOf(validator.address);
      await bridge
        .connect(validator)
        .mintMirrorNFT(
          patient.address,
          0,
          0,
          SEPOLIA_CHAIN_ID,
          "Test",
          "QmCID",
          hospital.address,
          SEPOLIA_CHAIN_ID,
          sig,
        );
      const balAfter = await brtToken.balanceOf(validator.address);

      const reward = await bridge.validatorReward();
      expect(balAfter.sub(balBefore)).to.equal(reward);
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  BRIDGE FEES
  // ═══════════════════════════════════════════════════════════
  describe("Bridge Fees", function () {
    it("Should collect bridge fee on token lock", async function () {
      const lockAmount = ethers.utils.parseEther("10");
      const totalNeeded = lockAmount.add(BRIDGE_FEE);
      await brtToken.connect(patient).approve(bridge.address, totalNeeded);

      const bridgeBalBefore = await brtToken.balanceOf(bridge.address);
      await bridge.connect(patient).lockTokens(lockAmount);
      const bridgeBalAfter = await brtToken.balanceOf(bridge.address);

      // Bridge balance should increase by lockAmount + fee
      expect(bridgeBalAfter.sub(bridgeBalBefore)).to.equal(totalNeeded);
    });

    it("Should allow owner to update bridge fee", async function () {
      const newFee = ethers.utils.parseEther("2");
      await bridge.setBridgeFee(newFee);
      expect(await bridge.bridgeFee()).to.equal(newFee);
    });
  });
});
