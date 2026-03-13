/**
 * Fund your MetaMask account on the local Hardhat node.
 *
 * The Hardhat node starts with 20 pre-funded accounts (10,000 ETH each).
 * This script sends ETH from the first pre-funded account to your MetaMask
 * address (derived from PRIVATE_KEY in .env).
 *
 * Usage:
 *   npx hardhat run scripts/fundLocal.js --network localhost
 */

const hre = require("hardhat");
require("dotenv").config();
const { ethers } = require("ethers");

async function main() {
  // Derive your MetaMask address from the .env private key
  const myWallet = new ethers.Wallet(process.env.PRIVATE_KEY);
  const myAddress = myWallet.address;

  // Get first Hardhat pre-funded account (has 10,000 ETH)
  const provider = new ethers.providers.JsonRpcProvider(
    "http://127.0.0.1:8545",
  );
  const hardhatAccount0 = provider.getSigner(0);

  const amount = ethers.utils.parseEther("1000");

  console.log(`Funding ${myAddress} with 1000 ETH from Hardhat account #0...`);

  const tx = await hardhatAccount0.sendTransaction({
    to: myAddress,
    value: amount,
  });
  await tx.wait();

  const balance = await provider.getBalance(myAddress);
  console.log(`Done! Balance: ${ethers.utils.formatEther(balance)} ETH`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
