# Index-Based Staking Pool

基于 index 机制的 EVM 质押合约，用 Foundry 框架开发和测试。

## 快速开始

### 1. 安装 Foundry

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

Windows 用户参考: https://book.getfoundry.sh/getting-started/installation

### 2. 安装依赖

```bash
forge install foundry-rs/forge-std --no-commit
```

### 3. 运行测试

```bash
forge test -vvv
```

## 核心机制

- `index` 初始为 `1e10`（代表 1.0）
- 质押: `amountB = amountA * 1e10 / index`
- 赎回: `amountA = amountB * index / 1e10`
- 注入收益: `newIndex = oldIndex * (poolTotal + reward) / poolTotal`

## 文件结构

```
src/
  StakePool.sol   - 主合约（含 Token B 的 ERC20 实现）
  MockERC20.sol   - 测试用 Token A
test/
  StakePool.t.sol - 完整测试用例
```
