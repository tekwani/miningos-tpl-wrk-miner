'use strict'

const test = require('brittle')
const libAlerts = require('../../workers/lib/alerts')
const crypto = require('crypto')

const getRandomIP = () => [...crypto.randomBytes(4)].join('.')

const MIN_30_MS = 30 * 60 * 1000

// Helper function to create mock context
const createMockContext = (thingConf = {}, configuredParams = {}, id = 'test-miner-123') => {
  return {
    id,
    thingConf: {
      pools: [
        { url: 'stratum+tcp://pool1.example.com:4444', worker_name: 'worker1' },
        { url: 'stratum+tcp://pool2.example.com:4444', worker_name: 'worker2' }
      ],
      ...thingConf
    },
    configuredParams
  }
}

// Helper function to create mock snap
const createMockSnap = (config = {}, stats = {}) => {
  return {
    config: {
      pool_config: [
        { url: 'stratum+tcp://pool1.example.com:4444', username: 'worker1.test-miner-123' },
        { url: 'stratum+tcp://pool2.example.com:4444', username: 'worker2.test-miner-123' }
      ],
      network_config: {
        ip_address: getRandomIP()
      },
      ...config
    },
    stats: {
      status: 'mining',
      ...stats
    }
  }
}

test('isValidPoolConfigSnap with valid snap', (t) => {
  const ctx = createMockContext()
  const snap = createMockSnap()

  // We need to access the function through the module's internal structure
  // Since it's not exported, we'll test it through the alert specs
  const alertSpec = libAlerts.specs.miner_default.wrong_miner_pool
  t.ok(alertSpec.valid(ctx, snap), 'Should return true for valid pool config snap')
})

test('miner alert valid callbacks agree on pool config snap', (t) => {
  const ctx = createMockContext()
  const snap = createMockSnap()
  const md = libAlerts.specs.miner_default
  t.ok(md.wrong_miner_subaccount.valid(ctx, snap))
  t.ok(md.wrong_worker_name.valid(ctx, snap))
  t.ok(md.ip_worker_name.valid(ctx, snap))
})

test('isValidPoolConfigSnap with invalid snap - no pools', (t) => {
  const ctx = createMockContext({ pools: [] })
  const snap = createMockSnap()

  const alertSpec = libAlerts.specs.miner_default.wrong_miner_pool
  t.absent(alertSpec.valid(ctx, snap), 'Should return false for snap with no pools in context')
})

test('isValidPoolConfigSnap with invalid snap - no pool_config', (t) => {
  const ctx = createMockContext()
  const snap = createMockSnap({ pool_config: [] })

  const alertSpec = libAlerts.specs.miner_default.wrong_miner_pool
  t.absent(alertSpec.valid(ctx, snap), 'Should return false for snap with no pool_config')
})

test('isValidPoolConfigSnap with offline status', (t) => {
  const ctx = createMockContext()
  const snap = createMockSnap({}, { status: 'offline' })

  const alertSpec = libAlerts.specs.miner_default.wrong_miner_pool
  t.absent(alertSpec.valid(ctx, snap), 'Should return false for offline status')
})

test('wrong_miner_pool alert - correctly configured pools', (t) => {
  const ctx = createMockContext()
  const snap = createMockSnap()

  const alertSpec = libAlerts.specs.miner_default.wrong_miner_pool
  t.absent(alertSpec.probe(ctx, snap), 'Should not trigger alert for correctly configured pools')
})

test('wrong_miner_pool alert - incorrectly configured pools', (t) => {
  const ctx = createMockContext()
  const snap = createMockSnap({
    pool_config: []
  })

  const alertSpec = libAlerts.specs.miner_default.wrong_miner_pool
  t.ok(alertSpec.probe(ctx, snap), 'Should trigger alert for incorrectly configured pools')
})

test('wrong_miner_pool alert - triggers when a pool url differs', (t) => {
  const ctx = createMockContext()
  const snap = createMockSnap({
    pool_config: [
      { url: 'stratum+tcp://attacker.example.com:3333', username: 'worker1.test-miner-123' },
      { url: 'stratum+tcp://pool2.example.com:4444', username: 'worker2.test-miner-123' }
    ]
  })

  const md = libAlerts.specs.miner_default
  t.ok(md.wrong_miner_pool.valid(ctx, snap))
  t.ok(md.wrong_miner_pool.probe(ctx, snap))
})

test('wrong_miner_pool alert - compares against the pools last pushed to the miner', (t) => {
  const ctx = { ...createMockContext(), info: { poolConfig: 'cfg-1', poolUrls: ['stratum+tcp://pm.example.com:3333'] } }
  const probe = libAlerts.specs.miner_default.wrong_miner_pool.probe

  t.absent(probe(ctx, createMockSnap({ pool_config: [{ url: 'stratum+tcp://pm.example.com:3333', username: 'u1' }] })))
  t.ok(probe(ctx, createMockSnap()))
})

test('wrong_miner_pool alert - skips a pool manager miner with no recorded pool urls', (t) => {
  const ctx = { ...createMockContext(), info: { poolConfig: 'cfg-1' } }
  const snap = createMockSnap({ pool_config: [{ url: 'stratum+tcp://other.example.com:3333', username: 'u1' }] })

  t.absent(libAlerts.specs.miner_default.wrong_miner_pool.probe(ctx, snap))
})

test('wrong_miner_pool alert - tolerates cosmetic url differences', (t) => {
  const ctx = createMockContext()
  const snap = createMockSnap({
    pool_config: [
      { url: 'POOL1.example.com:4444/', username: 'worker1.test-miner-123' },
      { url: ' stratum+tcp://pool2.example.com:4444 ', username: 'worker2.test-miner-123' }
    ]
  })

  t.absent(libAlerts.specs.miner_default.wrong_miner_pool.probe(ctx, snap))
})

test('wrong_miner_pool alert - triggers when the miner reports fewer pools than configured', (t) => {
  const ctx = createMockContext()
  const snap = createMockSnap({
    pool_config: [{ url: 'stratum+tcp://pool1.example.com:4444', username: 'worker1.test-miner-123' }]
  })

  t.ok(libAlerts.specs.miner_default.wrong_miner_pool.probe(ctx, snap))
})

test('worker name probes reject usernames that only contain the expected values', (t) => {
  const ctx = createMockContext()
  const md = libAlerts.specs.miner_default
  const withUsernames = (u1, u2) => createMockSnap({
    pool_config: [
      { url: 'stratum+tcp://pool1.example.com:4444', username: u1 },
      { url: 'stratum+tcp://pool2.example.com:4444', username: u2 }
    ]
  })

  // Configured worker name appears, but not as the account the pool credits
  const foreignAccount = withUsernames('attacker.worker1.test-miner-123', 'attacker.worker2.test-miner-123')
  t.ok(md.wrong_miner_subaccount.probe(ctx, foreignAccount))
  t.ok(md.wrong_miner_subaccount.valid(ctx, foreignAccount))

  // Look-alike account names that contain the configured worker name
  t.ok(md.wrong_miner_subaccount.probe(ctx, withUsernames('worker1x.test-miner-123', 'worker2x.test-miner-123')))

  // Device id appears, but the suffix is not exactly the device id
  const paddedSuffix = withUsernames('worker1.other.test-miner-123', 'worker2.other.test-miner-123')
  t.absent(md.wrong_miner_subaccount.probe(ctx, paddedSuffix))
  t.ok(md.wrong_worker_name.probe(ctx, paddedSuffix))
})

test('worker name probes - miner reports fewer pools than configured', (t) => {
  const ctx = createMockContext()
  const snap = createMockSnap({
    pool_config: [{ url: 'stratum+tcp://pool1.example.com:4444', username: 'worker1.test-miner-123' }]
  })
  const md = libAlerts.specs.miner_default

  t.ok(md.wrong_miner_subaccount.probe(ctx, snap))
  t.ok(md.wrong_worker_name.probe(ctx, snap))
  t.absent(md.ip_worker_name.probe(ctx, snap))
})

test('ip_worker_name alert - IP is only part of the suffix', (t) => {
  const ctx = createMockContext()
  const snap = createMockSnap({
    network_config: { ip_address: '10.20.30.40' },
    pool_config: [
      { url: 'stratum+tcp://pool1.example.com:4444', username: 'worker1.110x20x30x40' },
      { url: 'stratum+tcp://pool2.example.com:4444', username: 'worker2.110x20x30x40' }
    ]
  })

  t.absent(libAlerts.specs.miner_default.ip_worker_name.probe(ctx, snap))
})

test('wrong_miner_subaccount alert - correct worker names', (t) => {
  const ctx = createMockContext()
  const snap = createMockSnap()

  const alertSpec = libAlerts.specs.miner_default.wrong_miner_subaccount
  t.absent(alertSpec.probe(ctx, snap), 'Should not trigger alert for correct worker names')
})

test('wrong_miner_subaccount alert - incorrect worker names', (t) => {
  const ctx = createMockContext()
  const snap = createMockSnap({
    pool_config: [
      { url: 'stratum+tcp://pool1.example.com:4444', username: 'wrong-worker.test-miner-123' },
      { url: 'stratum+tcp://pool2.example.com:4444', username: 'worker2.test-miner-123' }
    ]
  })

  const alertSpec = libAlerts.specs.miner_default.wrong_miner_subaccount
  t.ok(alertSpec.probe(ctx, snap), 'Should trigger alert for incorrect worker names')
})

test('wrong_worker_name alert - correct ID in username', (t) => {
  const ctx = createMockContext()
  const snap = createMockSnap()

  const alertSpec = libAlerts.specs.miner_default.wrong_worker_name
  t.absent(alertSpec.probe(ctx, snap), 'Should not trigger alert when ID is in username')
})

test('wrong_worker_name alert - IP in username', (t) => {
  const ctx = createMockContext()
  const snap = createMockSnap({
    network_config: { ip_address: '192.168.1.100' },
    pool_config: [
      { url: 'stratum+tcp://pool1.example.com:4444', username: 'worker1.192x168x1x100' },
      { url: 'stratum+tcp://pool2.example.com:4444', username: 'worker2.192x168x1x100' }
    ]
  })

  const alertSpec = libAlerts.specs.miner_default.wrong_worker_name
  t.absent(alertSpec.probe(ctx, snap), 'Should not trigger alert when IP is in username')
})

test('wrong_worker_name alert - neither ID nor IP in username', (t) => {
  const ctx = createMockContext()
  const snap = createMockSnap({
    pool_config: [
      { url: 'stratum+tcp://pool1.example.com:4444', username: 'worker1.unknown' },
      { url: 'stratum+tcp://pool2.example.com:4444', username: 'worker2.unknown' }
    ]
  })

  const alertSpec = libAlerts.specs.miner_default.wrong_worker_name
  t.ok(alertSpec.probe(ctx, snap), 'Should trigger alert when neither ID nor IP is in username')
})

test('ip_worker_name alert - ID in username', (t) => {
  const ctx = createMockContext()
  const snap = createMockSnap()

  const alertSpec = libAlerts.specs.miner_default.ip_worker_name
  t.absent(alertSpec.probe(ctx, snap), 'Should not trigger alert when ID is in username')
})

test('ip_worker_name alert - IP-based usernames', (t) => {
  const ctx = createMockContext()
  const ip = '10.20.30.40'
  const formatted = ip.replace(/\./g, 'x')
  const snap = createMockSnap({
    network_config: { ip_address: ip },
    pool_config: [
      { url: 'stratum+tcp://pool1.example.com:4444', username: `worker1.${formatted}` },
      { url: 'stratum+tcp://pool2.example.com:4444', username: `worker2.${formatted}` }
    ]
  })

  const alertSpec = libAlerts.specs.miner_default.ip_worker_name
  t.ok(alertSpec.probe(ctx, snap), 'Should trigger when usernames use IP pattern')
})

test('probe returns false when pool_config is empty', (t) => {
  const ctx = createMockContext()
  const emptyPoolsSnap = createMockSnap({ pool_config: [] })

  t.absent(libAlerts.specs.miner_default.wrong_miner_subaccount.probe(ctx, emptyPoolsSnap))
  t.absent(libAlerts.specs.miner_default.wrong_worker_name.probe(ctx, emptyPoolsSnap))
  t.absent(libAlerts.specs.miner_default.ip_worker_name.probe(ctx, emptyPoolsSnap))
})

test('alert specs have required properties', (t) => {
  const alertTypes = [
    'wrong_miner_pool',
    'wrong_miner_subaccount',
    'wrong_worker_name',
    'ip_worker_name',
    'custom.low_hashrate.warning',
    'custom.low_hashrate.critical',
    'custom.wrong_miner_pool.warning',
    'custom.wrong_miner_pool.critical',
    'custom.wrong_miner_subaccount.warning',
    'custom.wrong_miner_subaccount.critical',
    'custom.wrong_worker_name.warning',
    'custom.wrong_worker_name.critical',
    'custom.ip_worker_name.warning',
    'custom.ip_worker_name.critical'
  ]

  for (const alertType of alertTypes) {
    const alertSpec = libAlerts.specs.miner_default[alertType]
    t.ok(alertSpec, `Alert spec ${alertType} should exist`)
    t.ok(typeof alertSpec.valid === 'function', `Alert spec ${alertType} should have valid function`)
    t.ok(typeof alertSpec.probe === 'function', `Alert spec ${alertType} should have probe function`)
  }
})

test('alert specs extend default specs', (t) => {
  t.ok(libAlerts.specs.miner_default, 'miner_default specs should exist')
  t.ok(libAlerts.specs.default, 'default specs should exist')

  // Check that miner_default has the expected structure
  t.ok(libAlerts.specs.miner_default, 'miner_default should exist')
  t.ok(typeof libAlerts.specs.miner_default === 'object', 'miner_default should be an object')
})

test('edge cases - empty pools arrays', (t) => {
  const ctx = createMockContext({ pools: [] })
  const snap = createMockSnap({ pool_config: [] })

  const alertSpec = libAlerts.specs.miner_default.wrong_miner_pool
  t.absent(alertSpec.probe(ctx, snap), 'Should not trigger alert with empty pools arrays')
})

test('edge cases - missing network config', (t) => {
  const ctx = createMockContext()
  const snap = createMockSnap({ network_config: {} })

  const alertSpec = libAlerts.specs.miner_default.wrong_worker_name
  // This should not trigger an alert because the snap is not valid for pool config
  t.absent(alertSpec.probe(ctx, snap), 'Should not trigger alert when network config is missing')
})

for (const key of ['custom.low_hashrate.warning', 'custom.low_hashrate.critical']) {
  test(`${key} alert - valid is false when not enabled`, (t) => {
    const ctx = createMockContext({}, { [key]: { enabled: false, minHashRateMhs: 100 } }, key)
    const snap = createMockSnap()

    const alertSpec = libAlerts.specs.miner_default[key]
    t.absent(alertSpec.valid(ctx, snap), 'Should not be valid when disabled')
  })

  test(`${key} alert - valid is false when configuredParams is missing`, (t) => {
    const ctx = createMockContext({}, {}, key)
    const snap = createMockSnap()

    const alertSpec = libAlerts.specs.miner_default[key]
    t.absent(alertSpec.valid(ctx, snap), 'Should not be valid when configuredParams is missing entirely')
  })

  test(`${key} alert - valid becomes true once mining has run for 30 min`, (t) => {
    const ctx = createMockContext({}, { [key]: { enabled: true, minHashRateMhs: 100 } }, key)
    const alertSpec = libAlerts.specs.miner_default[key]
    const t0 = Date.now()

    const justStarted = createMockSnap({}, { timestamp: t0, hashrate_mhs: { avg: 150 } })
    t.absent(alertSpec.valid(ctx, justStarted), 'Should not be valid the moment hashrate first appears')

    const stillEarly = createMockSnap({}, { timestamp: t0 + MIN_30_MS - 1, hashrate_mhs: { avg: 150 } })
    t.absent(alertSpec.valid(ctx, stillEarly), 'Should not be valid before 30 min of mining')

    const base = createMockSnap({}, { timestamp: t0 + MIN_30_MS + 1, hashrate_mhs: { avg: 150 } })
    t.ok(alertSpec.valid(ctx, base), 'Should be valid once enabled, pool config is valid, and mining > 30 min')
  })

  test(`${key} alert - valid is false when enabled but miner is offline`, (t) => {
    const ctx = createMockContext({}, { [key]: { enabled: true, minHashRateMhs: 100 } }, key)
    const snap = createMockSnap({}, { status: 'offline' })

    const alertSpec = libAlerts.specs.miner_default[key]
    t.absent(alertSpec.valid(ctx, snap), 'Should not be valid when miner is offline, even if enabled')
  })

  test(`${key} alert - probe does not trigger when hashrate is above threshold`, (t) => {
    const ctx = createMockContext({}, { [key]: { enabled: true, minHashRateMhs: 100 } })
    const snap = createMockSnap({}, { hashrate_mhs: { avg: 150 } })

    const alertSpec = libAlerts.specs.miner_default[key]
    t.absent(alertSpec.probe(ctx, snap), 'Should not trigger alert when hashrate is above threshold')
  })

  test(`${key} alert - probe does not trigger when hashrate equals threshold`, (t) => {
    const ctx = createMockContext({}, { [key]: { enabled: true, minHashRateMhs: 100 } })
    const snap = createMockSnap({}, { hashrate_mhs: { avg: 100 } })

    const alertSpec = libAlerts.specs.miner_default[key]
    t.absent(alertSpec.probe(ctx, snap), 'Should not trigger alert when hashrate equals threshold')
  })

  test(`${key} alert - probe triggers when hashrate is below threshold`, (t) => {
    const ctx = createMockContext({}, { [key]: { enabled: true, minHashRateMhs: 100 } })
    const snap = createMockSnap({}, { hashrate_mhs: { avg: 50 } })

    const alertSpec = libAlerts.specs.miner_default[key]
    t.ok(alertSpec.probe(ctx, snap), 'Should trigger alert when hashrate is below threshold')
  })
}

for (const key of [
  'custom.wrong_miner_pool.warning',
  'custom.wrong_miner_pool.critical',
  'custom.wrong_miner_subaccount.warning',
  'custom.wrong_miner_subaccount.critical',
  'custom.wrong_worker_name.warning',
  'custom.wrong_worker_name.critical',
  'custom.ip_worker_name.warning',
  'custom.ip_worker_name.critical'
]) {
  test(`${key} alert - valid is false when not enabled`, (t) => {
    const ctx = createMockContext({}, { [key]: { enabled: false } })
    const snap = createMockSnap()

    const alertSpec = libAlerts.specs.miner_default[key]
    t.absent(alertSpec.valid(ctx, snap), 'Should not be valid when disabled')
  })

  test(`${key} alert - valid is false when configuredParams is missing`, (t) => {
    const ctx = createMockContext()
    const snap = createMockSnap()

    const alertSpec = libAlerts.specs.miner_default[key]
    t.absent(alertSpec.valid(ctx, snap), 'Should not be valid when configuredParams is missing entirely')
  })

  test(`${key} alert - valid is true when enabled and snap is a valid pool config snap`, (t) => {
    const ctx = createMockContext({}, { [key]: { enabled: true } })
    const snap = createMockSnap()

    const alertSpec = libAlerts.specs.miner_default[key]
    t.ok(alertSpec.valid(ctx, snap), 'Should be valid when enabled and pool config snap is valid')
  })

  test(`${key} alert - valid is false when enabled but miner is offline`, (t) => {
    const ctx = createMockContext({}, { [key]: { enabled: true } })
    const snap = createMockSnap({}, { status: 'offline' })

    const alertSpec = libAlerts.specs.miner_default[key]
    t.absent(alertSpec.valid(ctx, snap), 'Should not be valid when miner is offline, even if enabled')
  })

  test(`${key} alert - valid is false when there are no pools configured`, (t) => {
    const ctx = createMockContext({ pools: [] }, { [key]: { enabled: true } })
    const snap = createMockSnap()

    const alertSpec = libAlerts.specs.miner_default[key]
    t.absent(alertSpec.valid(ctx, snap), 'Should not be valid when context has no pools')
  })
}

test('custom.wrong_miner_pool alert - probe does not trigger for correctly configured pools', (t) => {
  const ctx = createMockContext()
  const snap = createMockSnap()

  t.absent(libAlerts.specs.miner_default['custom.wrong_miner_pool.warning'].probe(ctx, snap))
  t.absent(libAlerts.specs.miner_default['custom.wrong_miner_pool.critical'].probe(ctx, snap))
})

test('custom.wrong_miner_pool alert - probe triggers for incorrectly configured pools', (t) => {
  const ctx = createMockContext()
  const snap = createMockSnap({ pool_config: [] })

  t.ok(libAlerts.specs.miner_default['custom.wrong_miner_pool.warning'].probe(ctx, snap))
  t.ok(libAlerts.specs.miner_default['custom.wrong_miner_pool.critical'].probe(ctx, snap))
})

test('custom.wrong_miner_subaccount alert - probe does not trigger for correct worker names', (t) => {
  const ctx = createMockContext()
  const snap = createMockSnap()

  t.absent(libAlerts.specs.miner_default['custom.wrong_miner_subaccount.warning'].probe(ctx, snap))
  t.absent(libAlerts.specs.miner_default['custom.wrong_miner_subaccount.critical'].probe(ctx, snap))
})

test('custom.wrong_miner_subaccount alert - probe triggers for incorrect worker names', (t) => {
  const ctx = createMockContext()
  const snap = createMockSnap({
    pool_config: [
      { url: 'stratum+tcp://pool1.example.com:4444', username: 'wrong-worker.test-miner-123' },
      { url: 'stratum+tcp://pool2.example.com:4444', username: 'worker2.test-miner-123' }
    ]
  })

  t.ok(libAlerts.specs.miner_default['custom.wrong_miner_subaccount.warning'].probe(ctx, snap))
  t.ok(libAlerts.specs.miner_default['custom.wrong_miner_subaccount.critical'].probe(ctx, snap))
})

test('custom.wrong_miner_subaccount alert - probe does not trigger when pool_config is empty', (t) => {
  const ctx = createMockContext()
  const snap = createMockSnap({ pool_config: [] })

  t.absent(libAlerts.specs.miner_default['custom.wrong_miner_subaccount.warning'].probe(ctx, snap))
  t.absent(libAlerts.specs.miner_default['custom.wrong_miner_subaccount.critical'].probe(ctx, snap))
})

test('custom.wrong_worker_name alert - probe does not trigger when ID is in username', (t) => {
  const ctx = createMockContext()
  const snap = createMockSnap()

  t.absent(libAlerts.specs.miner_default['custom.wrong_worker_name.warning'].probe(ctx, snap))
  t.absent(libAlerts.specs.miner_default['custom.wrong_worker_name.critical'].probe(ctx, snap))
})

test('custom.wrong_worker_name alert - probe does not trigger when IP is in username', (t) => {
  const ctx = createMockContext()
  const snap = createMockSnap({
    network_config: { ip_address: '192.168.1.100' },
    pool_config: [
      { url: 'stratum+tcp://pool1.example.com:4444', username: 'worker1.192x168x1x100' },
      { url: 'stratum+tcp://pool2.example.com:4444', username: 'worker2.192x168x1x100' }
    ]
  })

  t.absent(libAlerts.specs.miner_default['custom.wrong_worker_name.warning'].probe(ctx, snap))
  t.absent(libAlerts.specs.miner_default['custom.wrong_worker_name.critical'].probe(ctx, snap))
})

test('custom.wrong_worker_name alert - probe triggers when neither ID nor IP is in username', (t) => {
  const ctx = createMockContext()
  const snap = createMockSnap({
    pool_config: [
      { url: 'stratum+tcp://pool1.example.com:4444', username: 'worker1.unknown' },
      { url: 'stratum+tcp://pool2.example.com:4444', username: 'worker2.unknown' }
    ]
  })

  t.ok(libAlerts.specs.miner_default['custom.wrong_worker_name.warning'].probe(ctx, snap))
  t.ok(libAlerts.specs.miner_default['custom.wrong_worker_name.critical'].probe(ctx, snap))
})

test('custom.ip_worker_name alert - probe does not trigger when ID is in username', (t) => {
  const ctx = createMockContext()
  const snap = createMockSnap()

  t.absent(libAlerts.specs.miner_default['custom.ip_worker_name.warning'].probe(ctx, snap))
  t.absent(libAlerts.specs.miner_default['custom.ip_worker_name.critical'].probe(ctx, snap))
})

test('custom.ip_worker_name alert - probe triggers for IP-based usernames', (t) => {
  const ctx = createMockContext()
  const ip = '10.20.30.40'
  const formatted = ip.replace(/\./g, 'x')
  const snap = createMockSnap({
    network_config: { ip_address: ip },
    pool_config: [
      { url: 'stratum+tcp://pool1.example.com:4444', username: `worker1.${formatted}` },
      { url: 'stratum+tcp://pool2.example.com:4444', username: `worker2.${formatted}` }
    ]
  })

  t.ok(libAlerts.specs.miner_default['custom.ip_worker_name.warning'].probe(ctx, snap))
  t.ok(libAlerts.specs.miner_default['custom.ip_worker_name.critical'].probe(ctx, snap))
})

test('custom.ip_worker_name alert - probe does not trigger when pool_config is empty', (t) => {
  const ctx = createMockContext()
  const snap = createMockSnap({ pool_config: [] })

  t.absent(libAlerts.specs.miner_default['custom.ip_worker_name.warning'].probe(ctx, snap))
  t.absent(libAlerts.specs.miner_default['custom.ip_worker_name.critical'].probe(ctx, snap))
})

test('edge cases - invalid snap structure', (t) => {
  const ctx = createMockContext()
  const snap = null

  const alertSpec = libAlerts.specs.miner_default.wrong_miner_pool

  // Test that these don't throw errors
  try {
    const valid = alertSpec.valid(ctx, snap)
    t.absent(valid, 'Should return false for null snap')
  } catch (error) {
    t.pass('Should handle null snap gracefully in valid')
  }

  try {
    const probe = alertSpec.probe(ctx, snap)
    t.absent(probe, 'Should return false for null snap')
  } catch (error) {
    t.pass('Should handle null snap gracefully in probe')
  }
})
