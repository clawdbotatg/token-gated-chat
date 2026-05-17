const { ethers } = require("ethers");
const config = require("./config");

const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];

const provider = new ethers.JsonRpcProvider(config.BASE_RPC_URL);
const token = new ethers.Contract(config.CLAWD_TOKEN_ADDRESS, ERC20_ABI, provider);

async function checkBalance(walletAddress) {
  // Let errors propagate — callers must handle RPC failures
  const balance = await token.balanceOf(walletAddress);
  return balance >= config.CLAWD_MIN_BALANCE;
}

async function getBalance(walletAddress) {
  // Let errors propagate — callers must handle RPC failures
  return await token.balanceOf(walletAddress);
}

module.exports = { checkBalance, getBalance };
