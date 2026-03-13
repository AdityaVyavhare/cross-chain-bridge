const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Cross-Chain Bridge", function () {
  let token, bridgeSepolia, bridgeAmoy;
  let owner, user, validator;
  const SEPOLIA_CHAIN_ID = 11155111;
  const AMOY_CHAIN_ID = 80002;
  const AMOUNT = ethers.utils.parseEther("100");

  beforeEach(async function () {
    [owner, user, validator] = await ethers.getSigners();

    // Deploy tokens
    const BridgeToken = await ethers.getContractFactory("BridgeToken");

    // Sepolia token (lock/unlock model)
    const sepoliaToken = await BridgeToken.deploy("Bridge Token", "BRT");
    await sepoliaToken.deployed();

    // Amoy token (mint/burn model)
    const amoyToken = await BridgeToken.deploy("Bridge Token", "BRT");
    await amoyToken.deployed();

    // Deploy bridges
    const BridgeSepolia = await ethers.getContractFactory("BridgeSepolia");
    bridgeSepolia = await BridgeSepolia.deploy(
      sepoliaToken.address,
      validator.address,
    );
    await bridgeSepolia.deployed();

    const BridgeAmoy = await ethers.getContractFactory("BridgeAmoy");
    bridgeAmoy = await BridgeAmoy.deploy(amoyToken.address, validator.address);
    await bridgeAmoy.deployed();

    // Transfer Amoy token ownership to bridge (for mint/burn)
    await amoyToken.transferOwnership(bridgeAmoy.address);

    // Give user some Sepolia tokens
    await sepoliaToken.transfer(user.address, AMOUNT);

    // Give bridge some Sepolia tokens (to simulate locked tokens for unlock)
    await sepoliaToken.transfer(bridgeSepolia.address, AMOUNT);

    // Store references
    this.sepoliaToken = sepoliaToken;
    this.amoyToken = amoyToken;
  });

  // Helper: create validator signature
  async function signMessage(validatorSigner, user, amount, nonce, chainId) {
    const messageHash = ethers.utils.solidityKeccak256(
      ["address", "uint256", "uint256", "uint256"],
      [user, amount, nonce, chainId],
    );
    const messageBytes = ethers.utils.arrayify(messageHash);
    return validatorSigner.signMessage(messageBytes);
  }

  describe("Deployment", function () {
    it("Should deploy token & bridges correctly", async function () {
      expect(this.sepoliaToken.address).to.be.properAddress;
      expect(this.amoyToken.address).to.be.properAddress;
      expect(bridgeSepolia.address).to.be.properAddress;
      expect(bridgeAmoy.address).to.be.properAddress;
    });

    it("Should set correct validator", async function () {
      expect(await bridgeSepolia.validator()).to.equal(validator.address);
      expect(await bridgeAmoy.validator()).to.equal(validator.address);
    });

    it("Token ownership transferred to Amoy bridge", async function () {
      expect(await this.amoyToken.owner()).to.equal(bridgeAmoy.address);
    });
  });

  describe("Sepolia → Amoy (Lock → Mint)", function () {
    it("Should lock tokens on Sepolia", async function () {
      const lockAmount = ethers.utils.parseEther("50");

      // Approve bridge
      await this.sepoliaToken
        .connect(user)
        .approve(bridgeSepolia.address, lockAmount);

      // Lock
      const tx = await bridgeSepolia.connect(user).lock(lockAmount);
      const receipt = await tx.wait();

      // Verify event emitted
      const event = receipt.events.find((e) => e.event === "Locked");
      expect(event).to.not.be.undefined;
      expect(event.args.user).to.equal(user.address);
      expect(event.args.amount).to.equal(lockAmount);
      expect(event.args.nonce).to.equal(0);
    });

    it("Should mint tokens on Amoy with valid signature", async function () {
      const mintAmount = ethers.utils.parseEther("50");
      const nonce = 0;

      // Validator signs
      const signature = await signMessage(
        validator,
        user.address,
        mintAmount,
        nonce,
        SEPOLIA_CHAIN_ID,
      );

      // Mint on Amoy
      const tx = await bridgeAmoy.mint(
        user.address,
        mintAmount,
        nonce,
        SEPOLIA_CHAIN_ID,
        signature,
      );
      const receipt = await tx.wait();

      // Check event
      const event = receipt.events.find((e) => e.event === "Minted");
      expect(event).to.not.be.undefined;
      expect(event.args.user).to.equal(user.address);
      expect(event.args.amount).to.equal(mintAmount);

      // Check balance
      expect(await this.amoyToken.balanceOf(user.address)).to.equal(mintAmount);
    });

    it("Should prevent replay attack (processed nonce)", async function () {
      const mintAmount = ethers.utils.parseEther("50");
      const nonce = 0;

      const signature = await signMessage(
        validator,
        user.address,
        mintAmount,
        nonce,
        SEPOLIA_CHAIN_ID,
      );

      // First mint works
      await bridgeAmoy.mint(
        user.address,
        mintAmount,
        nonce,
        SEPOLIA_CHAIN_ID,
        signature,
      );

      // Replay fails
      await expect(
        bridgeAmoy.mint(
          user.address,
          mintAmount,
          nonce,
          SEPOLIA_CHAIN_ID,
          signature,
        ),
      ).to.be.revertedWith("Already processed");
    });

    it("Should reject invalid signature", async function () {
      const mintAmount = ethers.utils.parseEther("50");
      const nonce = 0;

      // Sign with wrong signer (user instead of validator)
      const badSignature = await signMessage(
        user,
        user.address,
        mintAmount,
        nonce,
        SEPOLIA_CHAIN_ID,
      );

      await expect(
        bridgeAmoy.mint(
          user.address,
          mintAmount,
          nonce,
          SEPOLIA_CHAIN_ID,
          badSignature,
        ),
      ).to.be.revertedWith("Invalid signature");
    });
  });

  describe("Amoy → Sepolia (Burn → Unlock)", function () {
    it("Should burn and unlock in reverse direction", async function () {
      const amount = ethers.utils.parseEther("50");

      // First, mint tokens on Amoy for user
      const mintNonce = 0;
      const mintSig = await signMessage(
        validator,
        user.address,
        amount,
        mintNonce,
        SEPOLIA_CHAIN_ID,
      );
      await bridgeAmoy.mint(
        user.address,
        amount,
        mintNonce,
        SEPOLIA_CHAIN_ID,
        mintSig,
      );
      expect(await this.amoyToken.balanceOf(user.address)).to.equal(amount);

      // Burn on Amoy
      const burnTx = await bridgeAmoy.connect(user).burn(amount);
      const burnReceipt = await burnTx.wait();

      const burnEvent = burnReceipt.events.find((e) => e.event === "Burned");
      expect(burnEvent).to.not.be.undefined;
      expect(burnEvent.args.user).to.equal(user.address);
      expect(burnEvent.args.amount).to.equal(amount);
      expect(burnEvent.args.nonce).to.equal(0);

      // After burn, user balance is 0
      expect(await this.amoyToken.balanceOf(user.address)).to.equal(0);

      // Validator signs unlock on Sepolia
      const unlockNonce = 0;
      const unlockSig = await signMessage(
        validator,
        user.address,
        amount,
        unlockNonce,
        AMOY_CHAIN_ID,
      );

      const userBalBefore = await this.sepoliaToken.balanceOf(user.address);

      // Unlock on Sepolia
      const unlockTx = await bridgeSepolia.unlock(
        user.address,
        amount,
        unlockNonce,
        AMOY_CHAIN_ID,
        unlockSig,
      );
      const unlockReceipt = await unlockTx.wait();

      const unlockEvent = unlockReceipt.events.find(
        (e) => e.event === "Unlocked",
      );
      expect(unlockEvent).to.not.be.undefined;

      const userBalAfter = await this.sepoliaToken.balanceOf(user.address);
      expect(userBalAfter.sub(userBalBefore)).to.equal(amount);
    });

    it("Should prevent replay on Sepolia unlock", async function () {
      const amount = ethers.utils.parseEther("25");
      const nonce = 0;

      const signature = await signMessage(
        validator,
        user.address,
        amount,
        nonce,
        AMOY_CHAIN_ID,
      );

      await bridgeSepolia.unlock(
        user.address,
        amount,
        nonce,
        AMOY_CHAIN_ID,
        signature,
      );

      await expect(
        bridgeSepolia.unlock(
          user.address,
          amount,
          nonce,
          AMOY_CHAIN_ID,
          signature,
        ),
      ).to.be.revertedWith("Already processed");
    });

    it("Should reject invalid signature on unlock", async function () {
      const amount = ethers.utils.parseEther("25");
      const nonce = 0;

      const badSig = await signMessage(
        owner, // wrong signer
        user.address,
        amount,
        nonce,
        AMOY_CHAIN_ID,
      );

      await expect(
        bridgeSepolia.unlock(
          user.address,
          amount,
          nonce,
          AMOY_CHAIN_ID,
          badSig,
        ),
      ).to.be.revertedWith("Invalid signature");
    });
  });
});
