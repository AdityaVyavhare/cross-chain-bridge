// Minimal ABI fragments for frontend interaction

export const TOKEN_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

export const BRIDGE_SEPOLIA_ABI = [
  "function lock(uint256 amount) external",
  "function unlock(address user, uint256 amount, uint256 _nonce, uint256 sourceChainId, bytes calldata signature) external",
  "function token() view returns (address)",
  "function nonce() view returns (uint256)",
  "event TokensLocked(address user, uint256 amount, uint256 nonce)",
  "event TokensUnlocked(address user, uint256 amount, uint256 nonce)",
];

export const BRIDGE_AMOY_ABI = [
  "function burn(uint256 amount) external",
  "function mint(address user, uint256 amount, uint256 _nonce, uint256 sourceChainId, bytes calldata signature) external",
  "function token() view returns (address)",
  "function nonce() view returns (uint256)",
  "event TokensBurned(address user, uint256 amount, uint256 nonce)",
  "event TokensMinted(address user, uint256 amount, uint256 nonce)",
];
