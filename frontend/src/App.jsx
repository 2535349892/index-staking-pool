import { useState, useEffect, useCallback } from 'react'
import { ethers } from 'ethers'
import { Card, InputNumber, Button, Typography, Space, Row, Col, Statistic, Divider, message, Tag, Alert } from 'antd'
import { WalletOutlined, ArrowDownOutlined, GiftOutlined, ReloadOutlined, LinkOutlined } from '@ant-design/icons'
import { STAKE_POOL_ABI, ERC20_ABI, STAKE_POOL_ADDRESS } from './abi.js'
import './App.css'

const { Title, Text } = Typography
const BASE = 10000000000n // 1e10

function App() {
  const [account, setAccount] = useState('')
  const [poolContract, setPoolContract] = useState(null)
  const [tokenAContract, setTokenAContract] = useState(null)
  const [messageApi, contextHolder] = message.useMessage()

  // 数据
  const [currentIndex, setCurrentIndex] = useState('0')
  const [balanceA, setBalanceA] = useState('0')
  const [balanceB, setBalanceB] = useState('0')
  const [totalSupply, setTotalSupply] = useState('0')
  const [isOwner, setIsOwner] = useState(false)

  // 输入
  const [stakeAmount, setStakeAmount] = useState('')
  const [unstakeAmount, setUnstakeAmount] = useState('')
  const [rewardAmount, setRewardAmount] = useState('')
  const [mintAmount, setMintAmount] = useState('')

  // 加载状态
  const [loading, setLoading] = useState('')

  // ─── 连接钱包 ───
  const connectWallet = async () => {
    if (!window.ethereum) {
      messageApi.error('请安装 MetaMask 钱包')
      return
    }
    try {
      setLoading('connect')
      const provider = new ethers.BrowserProvider(window.ethereum)
      const accounts = await provider.send('eth_requestAccounts', [])
      const signer = await provider.getSigner()
      setAccount(accounts[0])

      const pool = new ethers.Contract(STAKE_POOL_ADDRESS, STAKE_POOL_ABI, signer)
      setPoolContract(pool)

      const tokenAAddr = await pool.tokenA()
      const tokenA = new ethers.Contract(tokenAAddr, ERC20_ABI, signer)
      setTokenAContract(tokenA)

      const ownerAddr = await pool.owner()
      setIsOwner(ownerAddr.toLowerCase() === accounts[0].toLowerCase())

      messageApi.success('钱包已连接')
    } catch (err) {
      messageApi.error('连接失败: ' + err.message)
    }
    setLoading('')
  }

  // ─── 刷新数据 ───
  const refreshData = useCallback(async () => {
    if (!poolContract || !tokenAContract || !account) return
    try {
      const [idx, balA, balB, supply] = await Promise.all([
        poolContract.index(),
        tokenAContract.balanceOf(account),
        poolContract.balanceOf(account),
        poolContract.totalSupply(),
      ])
      setCurrentIndex(idx.toString())
      setBalanceA(ethers.formatEther(balA))
      setBalanceB(ethers.formatEther(balB))
      setTotalSupply(ethers.formatEther(supply))
    } catch (err) {
      console.error('刷新失败:', err)
    }
  }, [poolContract, tokenAContract, account])

  useEffect(() => { refreshData() }, [refreshData])

  // ─── Mint Token A（测试用）───
  const handleMint = async () => {
    if (!mintAmount) return
    setLoading('mint')
    try {
      const amount = ethers.parseEther(mintAmount)
      const tx = await tokenAContract.mint(account, amount)
      await tx.wait()
      messageApi.success(`成功 Mint ${mintAmount} Token A`)
      setMintAmount('')
      refreshData()
    } catch (err) {
      messageApi.error('Mint 失败: ' + (err.reason || err.message))
    }
    setLoading('')
  }

  // ─── 质押 ───
  const handleStake = async () => {
    if (!stakeAmount) return
    setLoading('stake')
    try {
      const amount = ethers.parseEther(stakeAmount)
      // 先 approve
      const allowance = await tokenAContract.allowance(account, STAKE_POOL_ADDRESS)
      if (allowance < amount) {
        const tx = await tokenAContract.approve(STAKE_POOL_ADDRESS, ethers.MaxUint256)
        await tx.wait()
      }
      const tx = await poolContract.stake(amount)
      await tx.wait()
      messageApi.success(`成功质押 ${stakeAmount} Token A`)
      setStakeAmount('')
      refreshData()
    } catch (err) {
      messageApi.error('质押失败: ' + (err.reason || err.message))
    }
    setLoading('')
  }

  // ─── 赎回 ───
  const handleUnstake = async () => {
    if (!unstakeAmount) return
    setLoading('unstake')
    try {
      const amount = ethers.parseEther(unstakeAmount)
      const tx = await poolContract.unstake(amount)
      await tx.wait()
      messageApi.success(`成功赎回 ${unstakeAmount} Token B`)
      setUnstakeAmount('')
      refreshData()
    } catch (err) {
      messageApi.error('赎回失败: ' + (err.reason || err.message))
    }
    setLoading('')
  }

  // ─── 注入收益 ───
  const handleAddReward = async () => {
    if (!rewardAmount) return
    setLoading('reward')
    try {
      const amount = ethers.parseEther(rewardAmount)
      const allowance = await tokenAContract.allowance(account, STAKE_POOL_ADDRESS)
      if (allowance < amount) {
        const tx = await tokenAContract.approve(STAKE_POOL_ADDRESS, ethers.MaxUint256)
        await tx.wait()
      }
      const tx = await poolContract.addReward(amount)
      await tx.wait()
      messageApi.success(`成功注入 ${rewardAmount} 收益`)
      setRewardAmount('')
      refreshData()
    } catch (err) {
      messageApi.error('注入失败: ' + (err.reason || err.message))
    }
    setLoading('')
  }

  // ─── 预览计算 ───
  const previewStake = () => {
    if (!stakeAmount || !currentIndex || currentIndex === '0') return null
    try {
      const amt = ethers.parseEther(stakeAmount)
      const result = (amt * BASE) / BigInt(currentIndex)
      return Number(ethers.formatEther(result)).toFixed(6)
    } catch { return null }
  }

  const previewUnstake = () => {
    if (!unstakeAmount || !currentIndex || currentIndex === '0') return null
    try {
      const amt = ethers.parseEther(unstakeAmount)
      const result = (amt * BigInt(currentIndex)) / BASE
      return Number(ethers.formatEther(result)).toFixed(6)
    } catch { return null }
  }

  const formatIndex = () => {
    if (!currentIndex || currentIndex === '0') return '1.000000'
    return (Number(currentIndex) / 1e10).toFixed(6)
  }

  const shortAddr = (addr) => `${addr.slice(0, 6)}...${addr.slice(-4)}`

  return (
    <div className="app">
      {contextHolder}
      <Card className="main-card" bordered={false}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>

          <div style={{ textAlign: 'center' }}>
            <Title level={2} style={{ color: '#fff', margin: 0 }}>
              🏦 Staking Pool
            </Title>
            <Text type="secondary">基于 Index 机制的质押池</Text>
          </div>

          {!account ? (
            <Button
              type="primary" block size="large"
              icon={<LinkOutlined />}
              onClick={connectWallet}
              loading={loading === 'connect'}
            >
              连接 MetaMask 钱包
            </Button>
          ) : (
            <>
              <div style={{ textAlign: 'center' }}>
                <Tag icon={<WalletOutlined />} color="blue">{shortAddr(account)}</Tag>
                {isOwner && <Tag color="magenta">管理员</Tag>}
              </div>

              <Row gutter={[12, 12]}>
                <Col span={12}>
                  <Card size="small" className="stat-card">
                    <Statistic title="当前 Index" value={formatIndex()} valueStyle={{ color: '#fff', fontSize: 18 }} />
                  </Card>
                </Col>
                <Col span={12}>
                  <Card size="small" className="stat-card">
                    <Statistic title="总质押份额" value={Number(totalSupply).toFixed(4)} valueStyle={{ color: '#fff', fontSize: 18 }} />
                  </Card>
                </Col>
                <Col span={12}>
                  <Card size="small" className="stat-card">
                    <Statistic title="我的 Token A" value={Number(balanceA).toFixed(4)} valueStyle={{ color: '#43e97b', fontSize: 18 }} />
                  </Card>
                </Col>
                <Col span={12}>
                  <Card size="small" className="stat-card">
                    <Statistic title="我的 Token B" value={Number(balanceB).toFixed(4)} valueStyle={{ color: '#7c83ff', fontSize: 18 }} />
                  </Card>
                </Col>
              </Row>

              {/* Mint 测试代币 */}
              <Card size="small" className="action-card" title="🪙 Mint Token A（测试用）">
                <Space.Compact style={{ width: '100%' }}>
                  <InputNumber
                    style={{ width: '100%' }}
                    placeholder="输入 Mint 数量"
                    value={mintAmount}
                    onChange={(v) => setMintAmount(v?.toString() || '')}
                    min="0" stringMode
                  />
                  <Button style={{ background: '#43e97b', borderColor: '#43e97b', color: '#000' }}
                    type="primary" onClick={handleMint}
                    loading={loading === 'mint'} icon={<GiftOutlined />}>
                    Mint
                  </Button>
                </Space.Compact>
              </Card>

              {/* 质押 */}
              <Card size="small" className="action-card" title="📥 质押 (A → B)">
                <Space.Compact style={{ width: '100%' }}>
                  <InputNumber
                    style={{ width: '100%' }}
                    placeholder="输入 Token A 数量"
                    value={stakeAmount}
                    onChange={(v) => setStakeAmount(v?.toString() || '')}
                    min="0" stringMode
                  />
                  <Button type="primary" onClick={handleStake}
                    loading={loading === 'stake'} icon={<ArrowDownOutlined />}>
                    质押
                  </Button>
                </Space.Compact>
                {previewStake() && (
                  <Text type="secondary" style={{ fontSize: 12, marginTop: 8, display: 'block' }}>
                    预计获得: {previewStake()} Token B
                  </Text>
                )}
              </Card>

              {/* 赎回 */}
              <Card size="small" className="action-card" title="📤 赎回 (B → A)">
                <Space.Compact style={{ width: '100%' }}>
                  <InputNumber
                    style={{ width: '100%' }}
                    placeholder="输入 Token B 数量"
                    value={unstakeAmount}
                    onChange={(v) => setUnstakeAmount(v?.toString() || '')}
                    min="0" stringMode
                  />
                  <Button type="primary" danger onClick={handleUnstake}
                    loading={loading === 'unstake'} icon={<WalletOutlined />}>
                    赎回
                  </Button>
                </Space.Compact>
                {previewUnstake() && (
                  <Text type="secondary" style={{ fontSize: 12, marginTop: 8, display: 'block' }}>
                    预计获得: {previewUnstake()} Token A
                  </Text>
                )}
              </Card>

              {/* 管理员 */}
              {isOwner && (
                <>
                  <Divider style={{ borderColor: 'rgba(255,255,255,0.1)', margin: '8px 0' }} />
                  <Card size="small" className="action-card admin" title="⚙️ 注入收益 (仅管理员)">
                    <Space.Compact style={{ width: '100%' }}>
                      <InputNumber
                        style={{ width: '100%' }}
                        placeholder="输入收益 Token A 数量"
                        value={rewardAmount}
                        onChange={(v) => setRewardAmount(v?.toString() || '')}
                        min="0" stringMode
                      />
                      <Button style={{ background: '#a18cd1', borderColor: '#a18cd1' }}
                        type="primary" onClick={handleAddReward}
                        loading={loading === 'reward'} icon={<GiftOutlined />}>
                        注入
                      </Button>
                    </Space.Compact>
                  </Card>
                </>
              )}

              <Button block icon={<ReloadOutlined />} onClick={refreshData}>
                刷新数据
              </Button>
            </>
          )}
        </Space>
      </Card>
    </div>
  )
}

export default App
