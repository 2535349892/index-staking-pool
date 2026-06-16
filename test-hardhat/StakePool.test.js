const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * StakePool 完整测试
 * ═══════════════════════════════════════════════════════
 * 1. 零值测试：传入 0 看是否正确拒绝
 * 2. 溢出测试：传入极大值看是否会溢出
 * 3. 精度测试：传入极小值看舍入是否正确
 * 4. 权限测试：非授权用户调用受限函数
 * 5. 状态测试：在特殊状态（空池、无质押者）下操作
 * 6. 顺序测试：连续操作的前后状态一致性
 * 7. 多用户测试：多人交互时份额是否公平
 * ═══════════════════════════════════════════════════════
 */
describe("StakePool", function () {
  let tokenA, pool;
  let owner, alice, bob;
  const BASE = 10000000000n; // 1e10
  const ONE = ethers.parseEther("1"); // 1e18

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    // 部署 Token A
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    tokenA = await MockERC20.deploy("Token A", "TKA");

    // 部署质押池
    const StakePool = await ethers.getContractFactory("StakePool");
    pool = await StakePool.deploy(await tokenA.getAddress());

    // 给用户铸造 Token A
    await tokenA.mint(alice.address, ethers.parseEther("1000"));
    await tokenA.mint(bob.address, ethers.parseEther("1000"));
    await tokenA.mint(owner.address, ethers.parseEther("1000"));

    // 授权
    await tokenA.connect(alice).approve(await pool.getAddress(), ethers.MaxUint256);
    await tokenA.connect(bob).approve(await pool.getAddress(), ethers.MaxUint256);
    await tokenA.connect(owner).approve(await pool.getAddress(), ethers.MaxUint256);
  });

  // ══════════════════════════════════════════════════════
  //                  基础功能测试
  // ══════════════════════════════════════════════════════

  describe("初始状态", function () {
    it("index 初始为 BASE (1e10)", async function () {
      expect(await pool.index()).to.equal(BASE);
    });

    it("totalSupply 初始为 0", async function () {
      expect(await pool.totalSupply()).to.equal(0);
    });

    it("owner 正确设置", async function () {
      expect(await pool.owner()).to.equal(owner.address);
    });
  });

  describe("质押 (stake)", function () {
    it("index=1 时，100A → 100B", async function () {
      await pool.connect(alice).stake(ethers.parseEther("100"));
      expect(await pool.balanceOf(alice.address)).to.equal(ethers.parseEther("100"));
    });

    it("Token A 正确转入池子", async function () {
      await pool.connect(alice).stake(ethers.parseEther("100"));
      expect(await tokenA.balanceOf(await pool.getAddress())).to.equal(ethers.parseEther("100"));
    });

    it("用户 Token A 余额减少", async function () {
      await pool.connect(alice).stake(ethers.parseEther("100"));
      expect(await tokenA.balanceOf(alice.address)).to.equal(ethers.parseEther("900"));
    });

    it("触发 Staked 事件", async function () {
      await expect(pool.connect(alice).stake(ethers.parseEther("100")))
        .to.emit(pool, "Staked")
        .withArgs(alice.address, ethers.parseEther("100"), ethers.parseEther("100"));
    });
  });

  describe("赎回 (unstake)", function () {
    beforeEach(async function () {
      await pool.connect(alice).stake(ethers.parseEther("100"));
    });

    it("index=1 时，100B → 100A", async function () {
      await pool.connect(alice).unstake(ethers.parseEther("100"));
      expect(await tokenA.balanceOf(alice.address)).to.equal(ethers.parseEther("1000"));
    });

    it("Token B 被销毁", async function () {
      await pool.connect(alice).unstake(ethers.parseEther("100"));
      expect(await pool.balanceOf(alice.address)).to.equal(0);
      expect(await pool.totalSupply()).to.equal(0);
    });

    it("触发 Unstaked 事件", async function () {
      await expect(pool.connect(alice).unstake(ethers.parseEther("100")))
        .to.emit(pool, "Unstaked")
        .withArgs(alice.address, ethers.parseEther("100"), ethers.parseEther("100"));
    });
  });

  // ══════════════════════════════════════════════════════
  //             收益注入测试（核心机制）
  // ══════════════════════════════════════════════════════

  describe("收益注入 (addReward)", function () {
    beforeEach(async function () {
      await pool.connect(alice).stake(ethers.parseEther("100"));
    });

    it("注入 10A → index 上涨 10%", async function () {
      await pool.connect(owner).addReward(ethers.parseEther("10"));
      // newIndex = 1e10 * 110 / 100 = 1.1e10
      expect(await pool.index()).to.equal(BASE * 110n / 100n);
    });

    it("注入后赎回得到更多 A：100B → 110A", async function () {
      await pool.connect(owner).addReward(ethers.parseEther("10"));
      await pool.connect(alice).unstake(ethers.parseEther("100"));
      expect(await tokenA.balanceOf(alice.address)).to.equal(ethers.parseEther("1010"));
      // 原来 900 + 赎回 110 = 1010
    });

    it("注入后新质押需更多 A：110A → 100B", async function () {
      await pool.connect(owner).addReward(ethers.parseEther("10"));
      await pool.connect(bob).stake(ethers.parseEther("110"));
      expect(await pool.balanceOf(bob.address)).to.equal(ethers.parseEther("100"));
    });

    it("多次注入累积", async function () {
      await pool.connect(owner).addReward(ethers.parseEther("10")); // 100→110, index=1.1e10
      await pool.connect(owner).addReward(ethers.parseEther("11")); // 110→121, index=1.21e10
      expect(await pool.index()).to.equal(BASE * 121n / 100n);
    });

    it("触发 RewardAdded 事件", async function () {
      await expect(pool.connect(owner).addReward(ethers.parseEther("10")))
        .to.emit(pool, "RewardAdded")
        .withArgs(ethers.parseEther("10"), BASE * 110n / 100n);
    });
  });

  // ══════════════════════════════════════════════════════
  //                  多用户场景
  // ══════════════════════════════════════════════════════

  describe("多用户公平性", function () {
    it("收益按份额比例分配", async function () {
      await pool.connect(alice).stake(ethers.parseEther("100")); // 100B
      await pool.connect(bob).stake(ethers.parseEther("200"));   // 200B

      await pool.connect(owner).addReward(ethers.parseEther("30")); // index=1.1e10

      await pool.connect(alice).unstake(ethers.parseEther("100")); // → 110A
      await pool.connect(bob).unstake(ethers.parseEther("200"));   // → 220A

      // Alice: 900 + 110 = 1010
      expect(await tokenA.balanceOf(alice.address)).to.equal(ethers.parseEther("1010"));
      // Bob: 800 + 220 = 1020
      expect(await tokenA.balanceOf(bob.address)).to.equal(ethers.parseEther("1020"));
    });

    it("后加入者不享受之前的收益", async function () {
      await pool.connect(alice).stake(ethers.parseEther("100"));
      await pool.connect(owner).addReward(ethers.parseEther("10")); // index=1.1e10

      // Bob 在 index=1.1 时存入 110A → 100B
      await pool.connect(bob).stake(ethers.parseEther("110"));

      // 此时两人都持有 100B，再注入收益
      await pool.connect(owner).addReward(ethers.parseEther("22")); // 220→242, index=1.21e10

      // 两人赎回都得 121A
      await pool.connect(alice).unstake(ethers.parseEther("100"));
      await pool.connect(bob).unstake(ethers.parseEther("100"));

      // Alice: 900 + 121 = 1021
      expect(await tokenA.balanceOf(alice.address)).to.equal(ethers.parseEther("1021"));
      // Bob: 890 + 121 = 1011
      expect(await tokenA.balanceOf(bob.address)).to.equal(ethers.parseEther("1011"));
    });
  });

  // ══════════════════════════════════════════════════════
  //        边界测试
  // ══════════════════════════════════════════════════════

  describe("边界测试", function () {

    // ─── 零值边界 ───
    describe("零值", function () {
      it("质押 0 → revert", async function () {
        await expect(pool.connect(alice).stake(0))
          .to.be.revertedWith("Cannot stake 0");
      });

      it("赎回 0 → revert", async function () {
        await expect(pool.connect(alice).unstake(0))
          .to.be.revertedWith("Cannot unstake 0");
      });

      it("注入 0 收益 → revert", async function () {
        await pool.connect(alice).stake(ethers.parseEther("100"));
        await expect(pool.connect(owner).addReward(0))
          .to.be.revertedWith("Cannot add 0");
      });
    });

    // ─── 余额不足边界 ───
    describe("余额不足", function () {
      it("赎回超过持有量 → revert", async function () {
        await pool.connect(alice).stake(ethers.parseEther("100"));
        await expect(pool.connect(alice).unstake(ethers.parseEther("200")))
          .to.be.revertedWith("Insufficient balance");
      });

      it("没有 B 代币也尝试赎回 → revert", async function () {
        await expect(pool.connect(bob).unstake(ethers.parseEther("1")))
          .to.be.revertedWith("Insufficient balance");
      });
    });

    // ─── 权限边界 ───
    describe("权限控制", function () {
      it("非 owner 不能注入收益", async function () {
        await pool.connect(alice).stake(ethers.parseEther("100"));
        await expect(pool.connect(alice).addReward(ethers.parseEther("10")))
          .to.be.revertedWith("Not owner");
      });
    });

    // ─── 状态边界 ───
    describe("特殊状态", function () {
      it("无质押者时不能注入收益", async function () {
        await expect(pool.connect(owner).addReward(ethers.parseEther("10")))
          .to.be.revertedWith("No stakers");
      });

      it("全部赎回后池子清空，再质押正常", async function () {
        await pool.connect(alice).stake(ethers.parseEther("100"));
        await pool.connect(alice).unstake(ethers.parseEther("100"));

        expect(await pool.totalSupply()).to.equal(0);

        // 再次质押应该正常
        await pool.connect(alice).stake(ethers.parseEther("50"));
        expect(await pool.balanceOf(alice.address)).to.equal(ethers.parseEther("50"));
      });
    });

    // ─── 精度边界（最关键！）───
    describe("精度", function () {
      it("极小金额：1 wei 在 index>1 时转换为 0 → revert", async function () {
        await pool.connect(alice).stake(ethers.parseEther("100"));
        await pool.connect(owner).addReward(ethers.parseEther("100")); // index=2e10

        // 1 wei * 1e10 / 2e10 = 0 → revert
        await expect(pool.connect(bob).stake(1n))
          .to.be.revertedWith("Amount too small");
      });

      it("刚好不为 0 的最小金额能成功", async function () {
        await pool.connect(alice).stake(ethers.parseEther("100"));
        await pool.connect(owner).addReward(ethers.parseEther("100")); // index=2e10

        // 最小能成功的金额：amountA * BASE / index >= 1
        // amountA >= index / BASE = 2e10 / 1e10 = 2
        await pool.connect(bob).stake(2n);
        expect(await pool.balanceOf(bob.address)).to.equal(1n); // 得到 1 wei 的 B
      });

      it("连续小额收益注入不会让 index 偏差过大", async function () {
        await pool.connect(alice).stake(ethers.parseEther("1000"));

        // 注入 10 次每次 1A
        for (let i = 0; i < 10; i++) {
          await pool.connect(owner).addReward(ethers.parseEther("1"));
        }

        const finalIndex = await pool.index();
        // 理论值 1e10 * 1010/1000 = 10100000000
        // 实际因为整数除法误差，允许微小偏差
        expect(finalIndex).to.be.gte(BASE * 1009n / 1000n);
        expect(finalIndex).to.be.lte(BASE * 1010n / 1000n);
      });
    });

    // ─── 大数值边界（溢出测试）───
    describe("大数值", function () {
      it("10亿级别质押不溢出", async function () {
        const [,,, charlie] = await ethers.getSigners();
        const large = ethers.parseEther("1000000000"); // 10亿
        await tokenA.mint(charlie.address, large);
        await tokenA.connect(charlie).approve(await pool.getAddress(), ethers.MaxUint256);

        // 质押
        await pool.connect(charlie).stake(large);
        expect(await pool.balanceOf(charlie.address)).to.equal(large);

        // 注入 10% 收益
        const reward = large / 10n;
        await tokenA.mint(owner.address, reward);
        await pool.connect(owner).addReward(reward);

        // 赎回全部
        await pool.connect(charlie).unstake(large);

        // Charlie 只有赎回所得
        expect(await tokenA.balanceOf(charlie.address)).to.equal(large * 11n / 10n);
      });
    });

    // ─── Token B 转让边界 ───
    describe("Token B 转让", function () {
      it("转让后接收方可赎回", async function () {
        await pool.connect(alice).stake(ethers.parseEther("100"));
        await pool.connect(alice).transfer(bob.address, ethers.parseEther("50"));

        await pool.connect(owner).addReward(ethers.parseEther("10")); // index=1.1e10

        await pool.connect(bob).unstake(ethers.parseEther("50"));
        // Bob 原来 1000A，得到 55A
        expect(await tokenA.balanceOf(bob.address)).to.equal(ethers.parseEther("1055"));
      });

      it("转让超过余额 → revert", async function () {
        await pool.connect(alice).stake(ethers.parseEther("100"));
        await expect(pool.connect(alice).transfer(bob.address, ethers.parseEther("200")))
          .to.be.revertedWith("Insufficient balance");
      });
    });

    // ─── 部分赎回 ───
    describe("部分赎回", function () {
      it("分多次赎回结果正确", async function () {
        await pool.connect(alice).stake(ethers.parseEther("100"));
        await pool.connect(owner).addReward(ethers.parseEther("10")); // index=1.1e10

        // 赎回 50B → 55A
        await pool.connect(alice).unstake(ethers.parseEther("50"));
        expect(await pool.balanceOf(alice.address)).to.equal(ethers.parseEther("50"));

        // 再赎回 50B → 55A
        await pool.connect(alice).unstake(ethers.parseEther("50"));
        expect(await pool.balanceOf(alice.address)).to.equal(0);

        // 总共拿回 110A (900 + 110 = 1010)
        expect(await tokenA.balanceOf(alice.address)).to.equal(ethers.parseEther("1010"));
      });
    });
  });

  // ══════════════════════════════════════════════════════
  //                  预览函数测试
  // ══════════════════════════════════════════════════════

  describe("预览函数", function () {
    it("previewStake 准确", async function () {
      await pool.connect(alice).stake(ethers.parseEther("100"));
      await pool.connect(owner).addReward(ethers.parseEther("10"));

      // index=1.1e10, 110A → 100B
      expect(await pool.previewStake(ethers.parseEther("110"))).to.equal(ethers.parseEther("100"));
    });

    it("previewUnstake 准确", async function () {
      await pool.connect(alice).stake(ethers.parseEther("100"));
      await pool.connect(owner).addReward(ethers.parseEther("10"));

      // index=1.1e10, 100B → 110A
      expect(await pool.previewUnstake(ethers.parseEther("100"))).to.equal(ethers.parseEther("110"));
    });
  });
});
