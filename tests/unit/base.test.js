'use strict'

const test = require('brittle')
const BaseMiner = require('../../workers/lib/base')
const { getRandomString } = require('../../workers/lib/utils')
const pass1 = getRandomString(5)
const pass2 = getRandomString(5)

test('BaseMiner constructor', (t) => {
  const opts = { id: 'test-miner-123' }
  const miner = new BaseMiner(opts)

  t.is(miner._type, 'miner', 'Should set type to "miner"')
  t.is(JSON.stringify(miner.opts), JSON.stringify({ lastSeenTimeout: 30000, timeout: 10000, id: 'test-miner-123' }), 'Should set opts correctly')
  t.ok(miner.deviceDataCache, 'Should initialize deviceDataCache')
  t.is(JSON.stringify(miner.deviceDataCache), JSON.stringify({}), 'deviceDataCache should be empty object')
  t.ok(miner.cachedShares, 'Should initialize cachedShares')
  t.is(JSON.stringify(miner.cachedShares), JSON.stringify({ accepted: 0, rejected: 0, stale: 0 }), 'cachedShares should have default values')
})

test('BaseMiner constructor with default opts', (t) => {
  const miner = new BaseMiner()

  t.is(miner._type, 'miner', 'Should set type to "miner"')
  t.is(JSON.stringify(miner.opts), JSON.stringify({ lastSeenTimeout: 30000, timeout: 10000 }), 'Should set default opts when none provided')
})

test('validateWriteAction with setLED - valid boolean', (t) => {
  const miner = new BaseMiner()

  t.is(miner.validateWriteAction('setLED', true), 1, 'Should return 1 for valid boolean true')
  t.is(miner.validateWriteAction('setLED', false), 1, 'Should return 1 for valid boolean false')
})

test('validateWriteAction with setLED - invalid types', (t) => {
  const miner = new BaseMiner()

  const invalidValues = [null, undefined, 'true', 'false', 1, 0, [], {}, 'string']

  for (const value of invalidValues) {
    try {
      miner.validateWriteAction('setLED', value)
      t.fail(`Should throw error for setLED with ${typeof value}`)
    } catch (error) {
      t.ok(error instanceof Error, `Should throw Error for setLED with ${typeof value} value`)
      t.is(error.message, 'ERR_SET_LED_ENABLED_INVALID', `Should throw correct error message for ${typeof value} value`)
    }
  }
})

test('validateWriteAction with other actions', (t) => {
  const miner = new BaseMiner()

  t.is(miner.validateWriteAction('reboot'), 1, 'Should return 1 for reboot action')
  t.is(miner.validateWriteAction('setPowerMode', 'high'), 1, 'Should return 1 for setPowerMode action')
  t.is(miner.validateWriteAction('unknownAction', 'any', 'args'), 1, 'Should return 1 for unknown actions')
})

test('checkSamePools with identical pools', (t) => {
  const miner = new BaseMiner()
  const newPools = [
    { url: 'stratum+tcp://pool1.com:4444', worker_name: 'worker1' },
    { url: 'stratum+tcp://pool2.com:4444', worker_name: 'worker2' }
  ]
  const oldPools = [
    { url: 'stratum+tcp://pool1.com:4444', username: 'worker1' },
    { url: 'stratum+tcp://pool2.com:4444', username: 'worker2' }
  ]

  t.ok(miner.checkSamePools(newPools, oldPools), 'Should return true for identical pools')
})

test('checkSamePools with different lengths', (t) => {
  const miner = new BaseMiner()
  const newPools = [
    { url: 'stratum+tcp://pool1.com:4444', worker_name: 'worker1' }
  ]
  const oldPools = [
    { url: 'stratum+tcp://pool1.com:4444', username: 'worker1' },
    { url: 'stratum+tcp://pool2.com:4444', username: 'worker2' }
  ]

  t.not(miner.checkSamePools(newPools, oldPools), 'Should return false for different lengths')
})

test('checkSamePools with different URLs', (t) => {
  const miner = new BaseMiner()
  const newPools = [
    { url: 'stratum+tcp://pool1.com:4444', worker_name: 'worker1' }
  ]
  const oldPools = [
    { url: 'stratum+tcp://different-pool.com:4444', username: 'worker1' }
  ]

  t.not(miner.checkSamePools(newPools, oldPools), 'Should return false for different URLs')
})

test('checkSamePools with different worker names', (t) => {
  const miner = new BaseMiner()
  const newPools = [
    { url: 'stratum+tcp://pool1.com:4444', worker_name: 'worker1' }
  ]
  const oldPools = [
    { url: 'stratum+tcp://pool1.com:4444', username: 'different-worker' }
  ]

  t.not(miner.checkSamePools(newPools, oldPools), 'Should return false for different worker names')
})

test('preProcessPoolData with valid pools and appendId true', (t) => {
  const miner = new BaseMiner({ id: 'test-miner-123' })
  const pools = [
    { url: 'stratum+tcp://pool1.com:4444', worker_name: 'worker1', worker_password: pass1 },
    { url: 'stratum+tcp://pool2.com:4444', worker_name: 'worker2', worker_password: pass2 }
  ]

  const result = miner.preProcessPoolData(pools, true)

  t.is(result.length, 3, 'Should return 3 pools (2 input + 1 empty)')
  t.is(result[0].worker_name, 'worker1.test-miner-123', 'Should append ID to first worker name')
  t.is(result[1].worker_name, 'worker2.test-miner-123', 'Should append ID to second worker name')
  t.is(result[2].worker_name, '', 'Should have empty worker name for third pool')
  t.is(result[2].url, '', 'Should have empty URL for third pool')
  t.is(result[2].worker_password, '', 'Should have empty password for third pool')
})

test('preProcessPoolData with valid pools and appendId false', (t) => {
  const miner = new BaseMiner({ id: 'test-miner-123' })
  const pools = [
    { url: 'stratum+tcp://pool1.com:4444', worker_name: 'worker1', worker_password: pass1 }
  ]

  const result = miner.preProcessPoolData(pools, false)

  t.is(result.length, 3, 'Should return 3 pools (1 input + 2 empty)')
  t.is(result[0].worker_name, 'worker1', 'Should not append ID to worker name')
  t.is(result[1].worker_name, '', 'Should have empty worker name for second pool')
  t.is(result[2].worker_name, '', 'Should have empty worker name for third pool')
})

test('preProcessPoolData with invalid input', (t) => {
  const miner = new BaseMiner()

  const invalidInputs = [null, undefined, 'string', 123, {}, true]

  for (const input of invalidInputs) {
    try {
      miner.preProcessPoolData(input)
      t.fail(`Should throw error for ${typeof input} input`)
    } catch (error) {
      t.ok(error instanceof Error, `Should throw Error for ${typeof input} input`)
      t.is(error.message, 'ERR_INVALID_ARG_TYPE', `Should throw correct error message for ${typeof input} input`)
    }
  }
})

test('preProcessPoolData with 3 or more pools', (t) => {
  const miner = new BaseMiner({ id: 'test-miner-123' })
  const pools = [
    { url: 'stratum+tcp://pool1.com:4444', worker_name: 'worker1' },
    { url: 'stratum+tcp://pool2.com:4444', worker_name: 'worker2' },
    { url: 'stratum+tcp://pool3.com:4444', worker_name: 'worker3' }
  ]

  const result = miner.preProcessPoolData(pools, true)

  t.is(result.length, 3, 'Should return exactly 3 pools')
  t.is(result[0].worker_name, 'worker1.test-miner-123', 'Should append ID to first worker name')
  t.is(result[1].worker_name, 'worker2.test-miner-123', 'Should append ID to second worker name')
  t.is(result[2].worker_name, 'worker3.test-miner-123', 'Should append ID to third worker name')
})

test('_prepPools with same pools', (t) => {
  const miner = new BaseMiner({ id: 'test-miner-123' })
  const pools = [
    { url: 'stratum+tcp://pool1.com:4444', worker_name: 'worker1' }
  ]
  const oldPools = [
    { url: 'stratum+tcp://pool1.com:4444', username: 'worker1.test-miner-123' },
    { url: '', username: '' },
    { url: '', username: '' }
  ]

  const result = miner._prepPools(pools, true, oldPools)

  t.is(result, false, 'Should return false for same pools')
})

test('_prepPools with different pools', (t) => {
  const miner = new BaseMiner({ id: 'test-miner-123' })
  const pools = [
    { url: 'stratum+tcp://pool1.com:4444', worker_name: 'worker1' }
  ]
  const oldPools = [
    { url: 'stratum+tcp://pool2.com:4444', username: 'worker1' }
  ]

  const result = miner._prepPools(pools, true, oldPools)

  t.ok(Array.isArray(result), 'Should return array for different pools')
  t.is(result.length, 3, 'Should return processed pools array')
})

test('_prepPools without oldPools', (t) => {
  const miner = new BaseMiner({ id: 'test-miner-123' })
  const pools = [
    { url: 'stratum+tcp://pool1.com:4444', worker_name: 'worker1' }
  ]

  const result = miner._prepPools(pools, true)

  t.ok(Array.isArray(result), 'Should return array when no oldPools provided')
  t.is(result.length, 3, 'Should return processed pools array')
})

test('_transformPoolConfig throws ERR_POOL_CONFIG_INVALID for missing poolUrls', async (t) => {
  const miner = new BaseMiner()
  await t.exception(() => miner._transformPoolConfig({}), { message: 'ERR_POOL_CONFIG_INVALID' })
  await t.exception(() => miner._transformPoolConfig({ poolUrls: 'not-an-array' }), { message: 'ERR_POOL_CONFIG_INVALID' })
  await t.exception(() => miner._transformPoolConfig(null), { message: 'ERR_POOL_CONFIG_INVALID' })
})

test('_transformPoolConfig maps poolUrls to the expected format', (t) => {
  const miner = new BaseMiner()
  const result = miner._transformPoolConfig({
    poolUrls: [
      { url: 'stratum+tcp://pool1.com:4444', workerName: 'w1', workerPassword: 'p1' },
      { url: 'stratum+tcp://pool2.com:4444', workerName: 'w2' }
    ]
  })
  t.is(result.length, 2)
  t.is(result[0].url, 'stratum+tcp://pool1.com:4444')
  t.is(result[0].worker_name, 'w1')
  t.is(result[0].worker_password, 'p1')
  t.is(result[1].worker_password, '.', 'defaults password to dot when missing')
})

test('setupPools success', async (t) => {
  const miner = new BaseMiner()
  miner.conf = { pools: [{ url: 'stratum+tcp://pool1.com:4444', worker_name: 'worker1' }] }

  let setPoolsCalled = false
  miner.setPools = async () => {
    setPoolsCalled = true
    return Promise.resolve()
  }

  const result = await miner.setupPools()

  t.is(JSON.stringify(result), JSON.stringify({ success: true }), 'Should return success result')
  t.ok(setPoolsCalled, 'Should call setPools')
})

test('setupPools with params.config calls _transformPoolConfig and sets poolConfig id', async (t) => {
  const miner = new BaseMiner()
  const poolUrls = [{ url: 'stratum+tcp://pool1.com:4444', workerName: 'w1' }]
  let usedPools = null
  miner.setPools = async (pools) => { usedPools = pools }

  const result = await miner.setupPools({ config: { id: 'cfg-42', poolUrls } })

  t.is(JSON.stringify(result), JSON.stringify({ success: true }))
  t.is(miner.poolConfig, 'cfg-42')
  t.is(usedPools[0].url, 'stratum+tcp://pool1.com:4444')
})

test('setupPools failure', async (t) => {
  const miner = new BaseMiner()
  miner.conf = { pools: [{ url: 'stratum+tcp://pool1.com:4444', worker_name: 'worker1' }] }

  let setPoolsCalled = false
  miner.setPools = async () => {
    setPoolsCalled = true
    throw new Error('Connection failed')
  }

  const result = await miner.setupPools()

  t.is(JSON.stringify(result), JSON.stringify({ success: false, error_msg: 'Connection failed' }), 'Should return failure result with error message')
  t.ok(setPoolsCalled, 'Should call setPools')
})

test('fetchDeviceData caching', async (t) => {
  const miner = new BaseMiner()

  let callCount = 0
  const mockFn = async () => {
    callCount++
    return 'cached-data'
  }

  // First call
  const result1 = await miner.fetchDeviceData(mockFn, 1000)
  t.is(result1, 'cached-data', 'Should return data from function')
  t.is(callCount, 1, 'Function should be called once')

  // Second call within cache time
  const result2 = await miner.fetchDeviceData(mockFn, 1000)
  t.is(result2, 'cached-data', 'Should return cached data')
  t.is(callCount, 1, 'Function should not be called again')

  // Third call after cache expires
  await new Promise(resolve => setTimeout(resolve, 1100))
  const result3 = await miner.fetchDeviceData(mockFn, 1000)
  t.is(result3, 'cached-data', 'Should return fresh data after cache expires')
  t.is(callCount, 2, 'Function should be called again after cache expires')
})

test('fetchDeviceData with different function names', async (t) => {
  const miner = new BaseMiner()

  let callCount1 = 0
  let callCount2 = 0

  const mockFn1 = async function function1 () {
    callCount1++
    return 'data1'
  }

  const mockFn2 = async function function2 () {
    callCount2++
    return 'data2'
  }

  const result1 = await miner.fetchDeviceData(mockFn1, 1000)
  const result2 = await miner.fetchDeviceData(mockFn2, 1000)

  t.is(result1, 'data1', 'Should return data from first function')
  t.is(result2, 'data2', 'Should return data from second function')
  t.is(callCount1, 1, 'First function should be called once')
  t.is(callCount2, 1, 'Second function should be called once')
})

test('_calcNewShares with valid pools', (t) => {
  const miner = new BaseMiner()
  miner.cachedShares = { accepted: 10, rejected: 2, stale: 1 }

  const pools = [
    { accepted: '15', rejected: '3', stale: '2' },
    { accepted: '5', rejected: '1', stale: '0' }
  ]

  const result = miner._calcNewShares(pools)

  t.is(JSON.stringify(result), JSON.stringify({ accepted: 10, rejected: 2, stale: 1 }), 'Should calculate new shares correctly')
  t.is(JSON.stringify(miner.cachedShares), JSON.stringify({ accepted: 20, rejected: 4, stale: 2 }), 'Should update cached shares')
})

test('_calcNewShares with empty pools', (t) => {
  const miner = new BaseMiner()
  miner.cachedShares = { accepted: 10, rejected: 2, stale: 1 }

  const result = miner._calcNewShares([])

  t.is(JSON.stringify(result), JSON.stringify({ accepted: 0, rejected: 0, stale: 0 }), 'Should return zero shares for empty pools')
  t.is(JSON.stringify(miner.cachedShares), JSON.stringify({ accepted: 10, rejected: 2, stale: 1 }), 'Should not update cached shares')
})

test('_calcNewShares with null pools', (t) => {
  const miner = new BaseMiner()
  miner.cachedShares = { accepted: 10, rejected: 2, stale: 1 }

  const result = miner._calcNewShares(null)

  t.is(JSON.stringify(result), JSON.stringify({ accepted: 0, rejected: 0, stale: 0 }), 'Should return zero shares for null pools')
  t.is(JSON.stringify(miner.cachedShares), JSON.stringify({ accepted: 10, rejected: 2, stale: 1 }), 'Should not update cached shares')
})

test('_calcNewShares with decreasing shares', (t) => {
  const miner = new BaseMiner()
  miner.cachedShares = { accepted: 20, rejected: 4, stale: 2 }

  const pools = [
    { accepted: '15', rejected: '3', stale: '1' }
  ]

  const result = miner._calcNewShares(pools)

  t.is(JSON.stringify(result), JSON.stringify({ accepted: 15, rejected: 3, stale: 1 }), 'Should use current shares when decreasing')
  t.is(JSON.stringify(miner.cachedShares), JSON.stringify({ accepted: 15, rejected: 3, stale: 1 }), 'Should update cached shares')
})

test('optional stats hooks are no-ops', (t) => {
  const miner = new BaseMiner()
  const stats = {}
  miner._getStatus([], stats)
  miner._isSuspended(stats)
  miner._calcPowerW(stats)
  miner._calcAvgTemp(stats)
  miner._getPowerMode(stats)
  miner._calcEfficiency(stats, {})
  miner._calcHashrates(stats)
  t.pass('no-op hooks should not throw')
})

test('abstract methods throw errors', async (t) => {
  const miner = new BaseMiner()

  const abstractMethods = [
    ['getPools', []],
    ['powerOn', []],
    ['powerOff', []],
    ['reboot', []],
    ['setPools', [[]]],
    ['setFanSpeed', [50]],
    ['setPowerMode', ['high']],
    ['updateFirmware', ['firmware.bin']]
  ]

  for (const [methodName, args] of abstractMethods) {
    try {
      await miner[methodName](...args)
      t.fail(`Should throw error for abstract method ${methodName}`)
    } catch (error) {
      t.ok(error instanceof Error, `Should throw Error for ${methodName}`)
      t.is(error.message, 'Not implemented', `Should throw "Not implemented" for ${methodName}`)
    }
  }
})
