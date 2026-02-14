const { ethers } = require("ethers");

const CLAWD_TOKEN = process.env.CLAWD_TOKEN_ADDRESS || "0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07";
const BASE_RPC = process.env.BASE_RPC_URL || "https://base-mainnet.g.alchemy.com/v2/8GVG8WjDs-sGFRr6Rm839";
const MIN_BALANCE = BigInt(process.env.CLAWD_MIN_BALANCE || "1");

const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];

let _provider = null;
let _token = null;

function getToken() {
  if (!_provider) _provider = new ethers.JsonRpcProvider(BASE_RPC);
  if (!_token) _token = new ethers.Contract(CLAWD_TOKEN, ERC20_ABI, _provider);
  return _token;
}

async function checkBalance(walletAddress) {
  try {
    const balance = await getToken().balanceOf(walletAddress);
    return balance >= MIN_BALANCE;
  } catch (err) {
    console.error(`Balance check failed for ${walletAddress}:`, err.message);
    return false;
  }
}

module.exports = { checkBalance };
