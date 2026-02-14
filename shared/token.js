const { ethers } = require("ethers");
const config = require("./config");

const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];

const provider = new ethers.JsonRpcProvider(config.BASE_RPC_URL);
const token = new ethers.Contract(config.CLAWD_TOKEN_ADDRESS, ERC20_ABI, provider);

async function checkBalance(walletAddress) {
  try {
    const balance = await token.balanceOf(walletAddress);
    return balance >= config.CLAWD_MIN_BALANCE;
  } catch (err) {
    console.error(`Balance check failed for ${walletAddress}:`, err.message);
    return false;
  }
}

async function getBalance(walletAddress) {
  try {
    return await token.balanceOf(walletAddress);
  } catch (err) {
    console.error(`Balance fetch failed for ${walletAddress}:`, err.message);
    return 0n;
  }
}

module.exports = { checkBalance, getBalance };
