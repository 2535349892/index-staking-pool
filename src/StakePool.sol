// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IERC20 - ERC20 标准接口
 */
interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/**
 * @title StakePool
 * @author Hugo
 * @notice 基于 index 的质押池合约
 *
 * ═══════════════════════════════════════════════════════
 *  核心概念:
 * ═══════════════════════════════════════════════════════
 *
 *  Token A = 原始资产（你质押进去的代币）
 *  Token B = 份额凭证（质押后获得的凭证代币，本合约自身就是 B）
 *
 *  index 表示 "1 个 B 能换多少个 A"
 *  初始 index = BASE = 1e10，代表比例 1:1
 *
 *  公式：
 *    质押:  存入 amountA 个 A → 获得 (amountA * BASE / index) 个 B
 *    赎回:  销毁 amountB 个 B → 取回 (amountB * index / BASE) 个 A
 *
 *  收益注入：
 *    项目方存入 reward 个 A → index 上涨
 *    newIndex = oldIndex * (poolTotal + reward) / poolTotal
 *    所有 B 持有者自动享受收益，无需额外操作
 *
 * ═══════════════════════════════════════════════════════
 *  举例:
 * ═══════════════════════════════════════════════════════
 *
 *  1. index=1e10, 存入 1A → 得到 1B
 *  2. 项目方注入 0.1A 收益 → index 变为 1.1e10
 *  3. 用 1B 赎回 → 得到 1.1A ✓
 *  4. 此时新用户存入 1.1A → 只得到 1B（因为 index=1.1e10）
 */
contract StakePool {
    // ════════════════════════════════════════════════════
    //                     常量
    // ════════════════════════════════════════════════════

    /// @notice 精度基数，代表 index=1.0
    /// 用 1e10 而非 1e18，是为了在乘法时避免溢出
    uint256 public constant BASE = 1e10;

    // ════════════════════════════════════════════════════
    //                   状态变量
    // ════════════════════════════════════════════════════

    /// @notice Token A（质押代币）
    IERC20 public immutable tokenA;

    /// @notice 管理员（项目方）地址
    address public owner;

    /// @notice 当前兑换指数
    /// index = BASE 时代表 1:1
    /// index = 1.1 * BASE 时代表 1B = 1.1A
    uint256 public index;

    // ─── Token B 的 ERC20 数据 ───
    string public name = "Staked Token B";
    string public symbol = "sTKB";
    uint8 public decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // ════════════════════════════════════════════════════
    //                     事件
    // ════════════════════════════════════════════════════

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Staked(address indexed user, uint256 amountA, uint256 amountB);
    event Unstaked(address indexed user, uint256 amountB, uint256 amountA);
    event RewardAdded(uint256 amount, uint256 newIndex);

    // ════════════════════════════════════════════════════
    //                    构造函数
    // ════════════════════════════════════════════════════

    /// @param _tokenA Token A 的合约地址
    constructor(address _tokenA) {
        tokenA = IERC20(_tokenA);
        owner = msg.sender;
        index = BASE; // 初始比例 1:1
    }

    // ════════════════════════════════════════════════════
    //                   修饰器
    // ════════════════════════════════════════════════════

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // ════════════════════════════════════════════════════
    //                  核心功能
    // ════════════════════════════════════════════════════

    /**
     * @notice 质押：存入 Token A，获得 Token B
     * @param amountA 要存入的 A 数量（单位：wei）
     * @return amountB 获得的 B 数量
     *
     * 公式: amountB = amountA * BASE / index
     */
    function stake(uint256 amountA) external returns (uint256 amountB) {
        require(amountA > 0, "Cannot stake 0");

        // 根据当前 index 计算应得的 B 数量
        amountB = amountA * BASE / index;
        require(amountB > 0, "Amount too small");

        // 1. 把用户的 A 转到池子里
        require(tokenA.transferFrom(msg.sender, address(this), amountA), "Transfer failed");

        // 2. 给用户铸造 B
        _mint(msg.sender, amountB);

        emit Staked(msg.sender, amountA, amountB);
    }

    /**
     * @notice 赎回：销毁 Token B，取回 Token A
     * @param amountB 要销毁的 B 数量
     * @return amountA 取回的 A 数量
     *
     * 公式: amountA = amountB * index / BASE
     */
    function unstake(uint256 amountB) external returns (uint256 amountA) {
        require(amountB > 0, "Cannot unstake 0");
        require(balanceOf[msg.sender] >= amountB, "Insufficient balance");

        // 根据当前 index 计算能取回多少 A
        amountA = amountB * index / BASE;
        require(amountA > 0, "Amount too small");

        // 确保池子余额够
        require(tokenA.balanceOf(address(this)) >= amountA, "Pool insufficient");

        // 1. 销毁用户的 B
        _burn(msg.sender, amountB);

        // 2. 把 A 转给用户
        require(tokenA.transfer(msg.sender, amountA), "Transfer failed");

        emit Unstaked(msg.sender, amountB, amountA);
    }

    /**
     * @notice 项目方注入收益，index 自动上涨
     * @param amount 要注入的 A 数量
     *
     * 原理:
     *   池子里 A 多了，但 B 总量没变 → 每个 B 值更多 A
     *   newIndex = oldIndex * (totalA + reward) / totalA
     */
    function addReward(uint256 amount) external onlyOwner {
        require(amount > 0, "Cannot add 0");
        require(totalSupply > 0, "No stakers");

        // 注入前池子里的 A 总量
        uint256 totalA = tokenA.balanceOf(address(this));
        require(totalA > 0, "Pool is empty");

        // 把收益 A 转进池子
        require(tokenA.transferFrom(msg.sender, address(this), amount), "Transfer failed");

        // 更新 index
        // newIndex = oldIndex * (totalA + amount) / totalA
        index = index * (totalA + amount) / totalA;

        emit RewardAdded(amount, index);
    }

    // ════════════════════════════════════════════════════
    //                   视图函数
    // ════════════════════════════════════════════════════

    /// @notice 预览：存入 amountA 能得到多少 B
    function previewStake(uint256 amountA) external view returns (uint256) {
        return amountA * BASE / index;
    }

    /// @notice 预览：赎回 amountB 能得到多少 A
    function previewUnstake(uint256 amountB) external view returns (uint256) {
        return amountB * index / BASE;
    }

    // ════════════════════════════════════════════════════
    //              ERC20 标准实现（Token B）
    // ════════════════════════════════════════════════════

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "Insufficient balance");
        require(allowance[from][msg.sender] >= amount, "Insufficient allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }

    // ════════════════════════════════════════════════════
    //                  内部函数
    // ════════════════════════════════════════════════════

    /// @dev 铸造 Token B
    function _mint(address to, uint256 amount) internal {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    /// @dev 销毁 Token B
    function _burn(address from, uint256 amount) internal {
        balanceOf[from] -= amount;
        totalSupply -= amount;
        emit Transfer(from, address(0), amount);
    }
}
