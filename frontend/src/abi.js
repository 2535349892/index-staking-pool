/**
 * 合约 ABI 和地址配置
 * 
 * 部署合约后把地址填到下面
 */

// StakePool 合约 ABI
export const STAKE_POOL_ABI = [
  {
    name: "stake",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "amountA", type: "uint256" }],
    outputs: [{ name: "amountB", type: "uint256" }],
  },
  {
    name: "unstake",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "amountB", type: "uint256" }],
    outputs: [{ name: "amountA", type: "uint256" }],
  },
  {
    name: "addReward",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    name: "index",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "totalSupply",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "previewStake",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "amountA", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "previewUnstake",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "amountB", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "tokenA",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "owner",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "Staked",
    type: "event",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "amountA", type: "uint256", indexed: false },
      { name: "amountB", type: "uint256", indexed: false },
    ],
  },
  {
    name: "Unstaked",
    type: "event",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "amountB", type: "uint256", indexed: false },
      { name: "amountA", type: "uint256", indexed: false },
    ],
  },
]

// 标准 ERC20 ABI（只需要用到的部分）
export const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "mint",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
]

// ⚠️ 部署后把合约地址填在这里
export const STAKE_POOL_ADDRESS = "0x0000000000000000000000000000000000000000"
