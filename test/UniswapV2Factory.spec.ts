import path from 'path'
import chai from 'chai'
import { solidity, createMockProvider, getWallets, createFixtureLoader } from 'ethereum-waffle'
import { Contract } from 'ethers'
import { bigNumberify } from 'ethers/utils'

import { getCreate2Address } from './shared/utilities'
import { factoryFixture, FactoryFixture } from './shared/fixtures'

import UniswapV2 from '../build/UniswapV2.json'

chai.use(solidity)
const { expect } = chai

const TEST_ADDRESSES = {
  token0: '0x1000000000000000000000000000000000000000',
  token1: '0x2000000000000000000000000000000000000000'
}

describe('UniswapV2Factory', () => {
  const provider = createMockProvider(path.join(__dirname, '..', 'waffle.json'))
  const [wallet, other] = getWallets(provider)
  const loadFixture = createFixtureLoader(provider, [wallet])

  let bytecode: string
  let factory: Contract
  beforeEach(async () => {
    const { bytecode: _bytecode, factory: _factory }: FactoryFixture = await loadFixture(factoryFixture as any)
    bytecode = _bytecode
    factory = _factory
  })

  it('exchangeBytecode, feeAddress, feeOn, exchangesCount', async () => {
    expect(await factory.exchangeBytecode()).to.eq(bytecode)
    expect(await factory.feeAddress()).to.eq(wallet.address)
    expect(await factory.feeOn()).to.eq(false)
    expect(await factory.exchangesCount()).to.eq(0)
  })

  it('sortTokens', async () => {
    expect(await factory.sortTokens(TEST_ADDRESSES.token0, TEST_ADDRESSES.token1)).to.deep.eq([
      TEST_ADDRESSES.token0,
      TEST_ADDRESSES.token1
    ])
    expect(await factory.sortTokens(TEST_ADDRESSES.token1, TEST_ADDRESSES.token0)).to.deep.eq([
      TEST_ADDRESSES.token0,
      TEST_ADDRESSES.token1
    ])
  })

  async function createExchange(tokens: string[]) {
    const create2Address = getCreate2Address(factory.address, TEST_ADDRESSES.token0, TEST_ADDRESSES.token1, bytecode)
    await expect(factory.createExchange(...tokens))
      .to.emit(factory, 'ExchangeCreated')
      .withArgs(TEST_ADDRESSES.token0, TEST_ADDRESSES.token1, create2Address, bigNumberify(1))
    await expect(factory.createExchange(...tokens)).to.be.revertedWith('UniswapV2Factory: EXCHANGE_EXISTS')
    await expect(factory.createExchange(...tokens.slice().reverse())).to.be.revertedWith(
      'UniswapV2Factory: EXCHANGE_EXISTS'
    )
    expect(await factory.getExchange(...tokens)).to.eq(create2Address)
    expect(await factory.getExchange(...tokens.slice().reverse())).to.eq(create2Address)
    expect(await factory.getTokens(create2Address)).to.deep.eq([TEST_ADDRESSES.token0, TEST_ADDRESSES.token1])
    expect(await factory.exchanges(0)).to.eq(create2Address)
    expect(await factory.exchangesCount()).to.eq(1)

    const exchange = new Contract(create2Address, JSON.stringify(UniswapV2.abi), provider)
    expect(await exchange.factory()).to.eq(factory.address)
    expect(await exchange.token0()).to.eq(TEST_ADDRESSES.token0)
    expect(await exchange.token1()).to.eq(TEST_ADDRESSES.token1)
    expect(await exchange.feeAddress()).to.eq(wallet.address)
  }

  it('createExchange', async () => {
    await createExchange([TEST_ADDRESSES.token0, TEST_ADDRESSES.token1])
  })

  it('createExchange:reverse', async () => {
    await createExchange([TEST_ADDRESSES.token1, TEST_ADDRESSES.token0])
  })

  it('setFeeAddress', async () => {
    await expect(factory.connect(other).setFeeAddress(other.address)).to.be.revertedWith('UniswapV2Factory: FORBIDDEN')
    await factory.setFeeAddress(other.address)
    expect(await factory.feeAddress()).to.eq(other.address)
    await expect(factory.setFeeAddress(wallet.address)).to.be.revertedWith('UniswapV2Factory: FORBIDDEN')
  })

  it('turnFeeOn', async () => {
    await expect(factory.connect(other).turnFeeOn()).to.be.revertedWith('UniswapV2Factory: FORBIDDEN')
    await factory.turnFeeOn()
    expect(await factory.feeOn()).to.eq(true)
  })
})