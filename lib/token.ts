import { ethers } from "ethers";

const CLAWD_TOKEN = process.env.CLAWD_TOKEN_ADDRESS || "0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07";
const BASE_RPC = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const MIN_BALANCE = BigInt(process.env.CLAWD_MIN_BALANCE || "1");

const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];

let _provider: ethers.JsonRpcProvider | null = null;
let _token: ethers.Contract | null = null;

function getToken() {
  if (!_provider) _provider = new ethers.JsonRpcProvider(BASE_RPC);
  if (!_token) _token = new ethers.Contract(CLAWD_TOKEN, ERC20_ABI, _provider);
  return _token;
}

export async function checkBalance(walletAddress: string): Promise<boolean> {
  try {
    const balance = await getToken().balanceOf(walletAddress);
    return balance >= MIN_BALANCE;
  } catch (err: any) {
    console.error(`Balance check failed for ${walletAddress}:`, err.message);
    return false;
  }
}
