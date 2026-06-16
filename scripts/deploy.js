const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("部署账户:", deployer.address);

  // 1. 部署 MockERC20 (Token A)
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const tokenA = await MockERC20.deploy("Token A", "TKA");
  await tokenA.waitForDeployment();
  const tokenAAddr = await tokenA.getAddress();
  console.log("MockERC20 (Token A) 部署到:", tokenAAddr);

  // 2. 部署 StakePool
  const StakePool = await ethers.getContractFactory("StakePool");
  const pool = await StakePool.deploy(tokenAAddr);
  await pool.waitForDeployment();
  const poolAddr = await pool.getAddress();
  console.log("StakePool 部署到:", poolAddr);

  // 3. 给部署者 mint 10000 Token A 用于测试
  const mintAmount = ethers.parseEther("10000");
  const tx = await tokenA.mint(deployer.address, mintAmount);
  await tx.wait();
  console.log("已 Mint 10000 Token A 给", deployer.address);

  console.log("\n════════════════════════════════════════");
  console.log("部署完成！请更新 frontend/src/abi.js:");
  console.log(`STAKE_POOL_ADDRESS = "${poolAddr}"`);
  console.log("════════════════════════════════════════");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
