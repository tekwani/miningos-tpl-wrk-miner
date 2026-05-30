'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const test = require('brittle')

const WrkMinerRack = require('../../workers/rack.miner.wrk')
const { MAINTENANCE } = require('../../workers/lib/constants')
const lWrkFunLogs = require('@tetherto/miningos-tpl-wrk-thing/workers/lib/wrk-fun-logs')

function makeTmpDir () {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'firmwares-'))
}

function makeCtx ({ dirFirmwares, firmwaresGet, firmwaresPut } = {}) {
  const puts = []
  const ctx = {
    conf: { thing: { dirFirmwares: dirFirmwares || '/nonexistent' } },
    firmwares: {
      get: firmwaresGet || (async () => null),
      put: firmwaresPut || (async (k, v) => { puts.push({ k, v }) })
    },
    _puts: puts
  }
  ctx._firmwareFileExists = WrkMinerRack.prototype._firmwareFileExists.bind(ctx)
  ctx.listFirmwares = WrkMinerRack.prototype.listFirmwares.bind(ctx)
  return ctx
}

// ---------------------------------------------------------------------------
// _firmwareFileExists
// ---------------------------------------------------------------------------

test('_firmwareFileExists returns false when file is falsy', (t) => {
  const ctx = makeCtx()
  t.is(WrkMinerRack.prototype._firmwareFileExists.call(ctx, undefined), false)
  t.is(WrkMinerRack.prototype._firmwareFileExists.call(ctx, ''), false)
  t.is(WrkMinerRack.prototype._firmwareFileExists.call(ctx, null), false)
})

test('_firmwareFileExists returns false when file does not exist on disk', (t) => {
  const dir = makeTmpDir()
  t.teardown(() => fs.rmSync(dir, { recursive: true }))

  const ctx = makeCtx({ dirFirmwares: dir })
  t.is(WrkMinerRack.prototype._firmwareFileExists.call(ctx, 'missing.bin'), false)
})

test('_firmwareFileExists returns true when file exists on disk', (t) => {
  const dir = makeTmpDir()
  t.teardown(() => fs.rmSync(dir, { recursive: true }))

  fs.writeFileSync(path.join(dir, 'v1.0.bin'), '')
  const ctx = makeCtx({ dirFirmwares: dir })
  t.is(WrkMinerRack.prototype._firmwareFileExists.call(ctx, 'v1.0.bin'), true)
})

// ---------------------------------------------------------------------------
// listFirmwares
// ---------------------------------------------------------------------------

test('listFirmwares returns empty array when db has no entry', async (t) => {
  const ctx = makeCtx({ firmwaresGet: async () => null })
  const result = await WrkMinerRack.prototype.listFirmwares.call(ctx)
  t.alike(result, [])
})

test('listFirmwares filters out entries whose files are missing', async (t) => {
  const dir = makeTmpDir()
  t.teardown(() => fs.rmSync(dir, { recursive: true }))

  fs.writeFileSync(path.join(dir, 'present.bin'), '')

  const stored = [
    { name: 'fw-present', file: 'present.bin' },
    { name: 'fw-missing', file: 'missing.bin' }
  ]
  const ctx = makeCtx({
    dirFirmwares: dir,
    firmwaresGet: async () => ({ value: JSON.stringify(stored) })
  })

  const result = await WrkMinerRack.prototype.listFirmwares.call(ctx)
  t.is(result.length, 1)
  t.is(result[0].name, 'fw-present')
})

test('listFirmwares returns all entries when all files exist', async (t) => {
  const dir = makeTmpDir()
  t.teardown(() => fs.rmSync(dir, { recursive: true }))

  fs.writeFileSync(path.join(dir, 'a.bin'), '')
  fs.writeFileSync(path.join(dir, 'b.bin'), '')

  const stored = [
    { name: 'fw-a', file: 'a.bin' },
    { name: 'fw-b', file: 'b.bin' }
  ]
  const ctx = makeCtx({
    dirFirmwares: dir,
    firmwaresGet: async () => ({ value: JSON.stringify(stored) })
  })

  const result = await WrkMinerRack.prototype.listFirmwares.call(ctx)
  t.is(result.length, 2)
})

test('listFirmwares returns empty array when no files exist on disk', async (t) => {
  const dir = makeTmpDir()
  t.teardown(() => fs.rmSync(dir, { recursive: true }))

  const stored = [{ name: 'fw-gone', file: 'gone.bin' }]
  const ctx = makeCtx({
    dirFirmwares: dir,
    firmwaresGet: async () => ({ value: JSON.stringify(stored) })
  })

  const result = await WrkMinerRack.prototype.listFirmwares.call(ctx)
  t.alike(result, [])
})

// ---------------------------------------------------------------------------
// registerFirmware
// ---------------------------------------------------------------------------

test('registerFirmware throws ERR_FIRMWARE_INVALID for non-object data', async (t) => {
  const ctx = makeCtx()
  await t.exception(() => WrkMinerRack.prototype.registerFirmware.call(ctx, null), { message: 'ERR_FIRMWARE_INVALID' })
  await t.exception(() => WrkMinerRack.prototype.registerFirmware.call(ctx, 'string'), { message: 'ERR_FIRMWARE_INVALID' })
  await t.exception(() => WrkMinerRack.prototype.registerFirmware.call(ctx, 42), { message: 'ERR_FIRMWARE_INVALID' })
})

test('registerFirmware throws ERR_FIRMWARE_FILE_NOT_FOUND when file is absent', async (t) => {
  const dir = makeTmpDir()
  t.teardown(() => fs.rmSync(dir, { recursive: true }))

  const ctx = makeCtx({ dirFirmwares: dir, firmwaresGet: async () => null })
  await t.exception(
    () => WrkMinerRack.prototype.registerFirmware.call(ctx, { name: 'missing', file: 'missing.bin' }),
    { message: 'ERR_FIRMWARE_FILE_NOT_FOUND' }
  )
})

test('registerFirmware persists firmware and returns 1 when file exists', async (t) => {
  const dir = makeTmpDir()
  t.teardown(() => fs.rmSync(dir, { recursive: true }))

  fs.writeFileSync(path.join(dir, 'v2.bin'), '')

  const puts = []
  const ctx = makeCtx({
    dirFirmwares: dir,
    firmwaresGet: async () => null,
    firmwaresPut: async (k, v) => puts.push({ k, v })
  })

  const result = await WrkMinerRack.prototype.registerFirmware.call(ctx, { name: 'fw-v2', file: 'v2.bin' })
  t.is(result, 1)
  t.is(puts.length, 1)
  t.is(puts[0].k, 'firmwares_meta')

  const saved = JSON.parse(puts[0].v)
  t.is(saved.length, 1)
  t.is(saved[0].name, 'fw-v2')
  t.is(saved[0].file, 'v2.bin')
})

test('registerFirmware appends to existing firmwares', async (t) => {
  const dir = makeTmpDir()
  t.teardown(() => fs.rmSync(dir, { recursive: true }))

  fs.writeFileSync(path.join(dir, 'existing.bin'), '')
  fs.writeFileSync(path.join(dir, 'new.bin'), '')

  const existing = [{ name: 'fw-existing', file: 'existing.bin' }]
  const puts = []
  const ctx = makeCtx({
    dirFirmwares: dir,
    firmwaresGet: async () => ({ value: JSON.stringify(existing) }),
    firmwaresPut: async (k, v) => puts.push({ k, v })
  })

  await WrkMinerRack.prototype.registerFirmware.call(ctx, { name: 'fw-new', file: 'new.bin' })

  const saved = JSON.parse(puts[0].v)
  t.is(saved.length, 2)
  t.is(saved[1].name, 'fw-new')
})

// ---------------------------------------------------------------------------
// Helper for full-context tests
// ---------------------------------------------------------------------------

function makeWrkCtx ({ things = {}, conf = {}, dirFirmwares = '/nonexistent' } = {}) {
  const ctx = {
    conf: { thing: { dirFirmwares, miner: {}, ...conf } },
    mem: { things },
    firmwares: { get: async () => null, put: async () => {} },
    debugError: () => {}
  }
  const proto = WrkMinerRack.prototype
  ctx._firmwareFileExists = proto._firmwareFileExists.bind(ctx)
  ctx.listFirmwares = proto.listFirmwares.bind(ctx)
  ctx._generateThingId = proto._generateThingId.bind(ctx)
  ctx.getThingType = proto.getThingType.bind(ctx)
  ctx._getThingBaseType = proto._getThingBaseType.bind(ctx)
  ctx.selectThingInfo = proto.selectThingInfo.bind(ctx)
  ctx._getDefaultStaticMinerIp = proto._getDefaultStaticMinerIp.bind(ctx)
  ctx._releaseStaticIpThing = proto._releaseStaticIpThing.bind(ctx)
  ctx.getMinerDefaultPort = proto.getMinerDefaultPort.bind(ctx)
  ctx.getNominalEficiencyWThs = proto.getNominalEficiencyWThs.bind(ctx)
  ctx._setUpPortBasedOnMinerType = proto._setUpPortBasedOnMinerType.bind(ctx)
  ctx._isMinerOutsideContainerLocation = proto._isMinerOutsideContainerLocation.bind(ctx)
  ctx._validateMinerDataChange = proto._validateMinerDataChange.bind(ctx)
  ctx._validateUpdateThing = proto._validateUpdateThing.bind(ctx)
  ctx._setStaticIpThing = proto._setStaticIpThing.bind(ctx)
  ctx.getThingConf = proto.getThingConf.bind(ctx)
  ctx._queryThingHook = proto._queryThingHook.bind(ctx)
  ctx.collectSnapsHook0 = proto.collectSnapsHook0.bind(ctx)
  ctx.saveSharesData = proto.saveSharesData.bind(ctx)
  ctx.saveAggrShares = proto.saveAggrShares.bind(ctx)
  ctx._saveMiningStartupStatus = proto._saveMiningStartupStatus.bind(ctx)
  return ctx
}

// ---------------------------------------------------------------------------
// _generateThingId
// ---------------------------------------------------------------------------

test('_generateThingId returns a 15-character string', (t) => {
  const ctx = makeWrkCtx()
  const id = ctx._generateThingId()
  t.is(typeof id, 'string')
  t.is(id.length, 15)
})

// ---------------------------------------------------------------------------
// getThingType / _getThingBaseType
// ---------------------------------------------------------------------------

test('getThingType returns miner', (t) => {
  t.is(WrkMinerRack.prototype.getThingType.call({}), 'miner')
})

test('_getThingBaseType returns miner', (t) => {
  t.is(WrkMinerRack.prototype._getThingBaseType.call({}), 'miner')
})

// ---------------------------------------------------------------------------
// selectThingInfo
// ---------------------------------------------------------------------------

test('selectThingInfo returns address and port from opts', (t) => {
  const thg = { opts: { address: '192.168.1.1', port: 4028 } }
  const result = WrkMinerRack.prototype.selectThingInfo.call({}, thg)
  t.is(result.address, '192.168.1.1')
  t.is(result.port, 4028)
})

test('selectThingInfo returns undefined fields when opts is empty', (t) => {
  const result = WrkMinerRack.prototype.selectThingInfo.call({}, { opts: {} })
  t.is(result.address, undefined)
  t.is(result.port, undefined)
})

// ---------------------------------------------------------------------------
// _getDefaultStaticMinerIp
// ---------------------------------------------------------------------------

test('_getDefaultStaticMinerIp is a no-op and returns undefined', (t) => {
  const ctx = makeWrkCtx()
  t.is(ctx._getDefaultStaticMinerIp({}), undefined)
})

// ---------------------------------------------------------------------------
// _releaseStaticIpThing
// ---------------------------------------------------------------------------

test('_releaseStaticIpThing clears opts.address and returns 1', (t) => {
  const ctx = makeWrkCtx()
  const thg = { opts: { address: '10.0.0.1' } }
  t.is(ctx._releaseStaticIpThing(thg), 1)
  t.is(thg.opts.address, '')
})

// ---------------------------------------------------------------------------
// getMinerDefaultPort
// ---------------------------------------------------------------------------

test('getMinerDefaultPort returns configured port', (t) => {
  const ctx = makeWrkCtx({ conf: { minerDefaultPort: 4028 } })
  t.is(ctx.getMinerDefaultPort(), 4028)
})

test('getMinerDefaultPort returns undefined when not configured', (t) => {
  const ctx = makeWrkCtx()
  t.is(ctx.getMinerDefaultPort(), undefined)
})

// ---------------------------------------------------------------------------
// getNominalEficiencyWThs
// ---------------------------------------------------------------------------

test('getNominalEficiencyWThs returns value from conf for miner type', (t) => {
  const ctx = makeWrkCtx({ conf: { miner: { nominalEfficiencyWThs: { miner: 42 } } } })
  t.is(ctx.getNominalEficiencyWThs(), 42)
})

test('getNominalEficiencyWThs falls back to default when not in conf', (t) => {
  const ctx = makeWrkCtx()
  t.is(ctx.getNominalEficiencyWThs({ miner: 99 }), 99)
})

// ---------------------------------------------------------------------------
// _setUpPortBasedOnMinerType
// ---------------------------------------------------------------------------

test('_setUpPortBasedOnMinerType sets port when container is set and port is missing', (t) => {
  const ctx = makeWrkCtx({ conf: { minerDefaultPort: 4028 } })
  const thg = { opts: { port: null }, info: { container: 'c1' } }
  ctx._setUpPortBasedOnMinerType(thg)
  t.is(thg.opts.port, 4028)
})

test('_setUpPortBasedOnMinerType does not overwrite an existing port', (t) => {
  const ctx = makeWrkCtx({ conf: { minerDefaultPort: 4028 } })
  const thg = { opts: { port: 1234 }, info: { container: 'c1' } }
  ctx._setUpPortBasedOnMinerType(thg)
  t.is(thg.opts.port, 1234)
})

test('_setUpPortBasedOnMinerType does not set port for maintenance container', (t) => {
  const ctx = makeWrkCtx({ conf: { minerDefaultPort: 4028 } })
  const thg = { opts: { port: null }, info: { container: MAINTENANCE } }
  ctx._setUpPortBasedOnMinerType(thg)
  t.is(thg.opts.port, null)
})

// ---------------------------------------------------------------------------
// _isMinerOutsideContainerLocation
// ---------------------------------------------------------------------------

test('_isMinerOutsideContainerLocation returns true for non-container site location', (t) => {
  const ctx = makeWrkCtx()
  t.is(ctx._isMinerOutsideContainerLocation({ info: { location: 'site1.warehouse' } }), true)
})

test('_isMinerOutsideContainerLocation returns false for container site location', (t) => {
  const ctx = makeWrkCtx()
  t.is(ctx._isMinerOutsideContainerLocation({ info: { location: 'site1.container' } }), false)
})

test('_isMinerOutsideContainerLocation returns false when no location', (t) => {
  const ctx = makeWrkCtx()
  t.is(ctx._isMinerOutsideContainerLocation({ info: {} }), false)
})

// ---------------------------------------------------------------------------
// _validateMinerDataChange
// ---------------------------------------------------------------------------

test('_validateMinerDataChange passes when no existing things', (t) => {
  const ctx = makeWrkCtx()
  ctx._validateMinerDataChange({ id: 'new', info: {}, opts: {} })
  t.pass()
})

test('_validateMinerDataChange throws ERR_THING_SERIALNUM_EXISTS on duplicate serial', async (t) => {
  const ctx = makeWrkCtx({
    things: { t1: { id: 't1', info: { serialNum: 'SN123' }, opts: {} } }
  })
  await t.exception(
    () => ctx._validateMinerDataChange({ id: 'new', info: { serialNum: 'SN123' }, opts: {} }),
    { message: 'ERR_THING_SERIALNUM_EXISTS' }
  )
})

test('_validateMinerDataChange throws ERR_THING_MACADDRESS_EXISTS on duplicate MAC (case-insensitive)', async (t) => {
  const ctx = makeWrkCtx({
    things: { t1: { id: 't1', info: { macAddress: 'AA:BB:CC:DD:EE:FF' }, opts: {} } }
  })
  await t.exception(
    () => ctx._validateMinerDataChange({ id: 'new', info: { macAddress: 'aa:bb:cc:dd:ee:ff' }, opts: {} }),
    { message: 'ERR_THING_MACADDRESS_EXISTS' }
  )
})

test('_validateMinerDataChange throws ERR_THING_POS_EXISTS on duplicate pos+container', async (t) => {
  const ctx = makeWrkCtx({
    things: { t1: { id: 't1', info: { pos: '1-1_1', container: 'c1' }, opts: {} } }
  })
  await t.exception(
    () => ctx._validateMinerDataChange({ id: 'new', info: { pos: '1-1_1', container: 'c1' }, opts: {} }),
    { message: 'ERR_THING_POS_EXISTS' }
  )
})

test('_validateMinerDataChange throws ERR_THING_IP_ADDRESS_EXISTS on duplicate IP', async (t) => {
  const ctx = makeWrkCtx({
    things: { t1: { id: 't1', info: {}, opts: { address: '10.0.0.1' } } }
  })
  await t.exception(
    () => ctx._validateMinerDataChange({ id: 'new', info: {}, opts: { address: '10.0.0.1' } }),
    { message: 'ERR_THING_IP_ADDRESS_EXISTS' }
  )
})

test('_validateMinerDataChange skips duplicate check for same thing id', (t) => {
  const ctx = makeWrkCtx({
    things: { t1: { id: 't1', info: { serialNum: 'SN123' }, opts: {} } }
  })
  ctx._validateMinerDataChange({ id: 't1', info: { serialNum: 'SN123' }, opts: {} })
  t.pass()
})

// ---------------------------------------------------------------------------
// _validateUpdateThing
// ---------------------------------------------------------------------------

test('_validateUpdateThing throws ERR_THING_VALIDATE_CONTAINER_INVALID when container location but no container', async (t) => {
  const ctx = makeWrkCtx({ things: {} })
  await t.exception(
    () => ctx._validateUpdateThing({ id: 'new', info: { location: 'site1.container' }, opts: {} }),
    { message: 'ERR_THING_VALIDATE_CONTAINER_INVALID' }
  )
})

test('_validateUpdateThing passes when location is outside container', (t) => {
  const ctx = makeWrkCtx({ things: {} })
  ctx._validateUpdateThing({ id: 'new', info: { location: 'site1.warehouse' }, opts: {} })
  t.pass()
})

// ---------------------------------------------------------------------------
// _setStaticIpThing
// ---------------------------------------------------------------------------

test('_setStaticIpThing returns 1 immediately when forceSetIp is true', (t) => {
  const ctx = makeWrkCtx()
  t.is(ctx._setStaticIpThing({ info: {}, opts: {} }, true), 1)
})

test('_setStaticIpThing throws ERR_THG_INFO_INVALID when container is missing', async (t) => {
  const ctx = makeWrkCtx()
  await t.exception(() => ctx._setStaticIpThing({ info: {}, opts: {} }, false), { message: 'ERR_THG_INFO_INVALID' })
})

test('_setStaticIpThing throws ERR_THG_DEFAULT_STATIC_IP_INVALID when no default IP for non-maintenance', async (t) => {
  const ctx = makeWrkCtx()
  await t.exception(
    () => ctx._setStaticIpThing({ info: { container: 'c1', pos: '1-1_1' }, opts: {} }, false),
    { message: 'ERR_THG_DEFAULT_STATIC_IP_INVALID' }
  )
})

test('_setStaticIpThing succeeds and returns 1 for maintenance container', (t) => {
  const ctx = makeWrkCtx()
  const thg = { info: { container: MAINTENANCE, pos: '1-1_1' }, opts: {} }
  t.is(ctx._setStaticIpThing(thg, false), 1)
})

// ---------------------------------------------------------------------------
// getThingConf
// ---------------------------------------------------------------------------

test('getThingConf returns pools for poolConfig requestType', async (t) => {
  const ctx = makeWrkCtx({ conf: { miner: { pools: [{ url: 'stratum+tcp://pool.example.com' }] } } })
  const result = await ctx.getThingConf({ requestType: 'poolConfig' })
  t.alike(result, [{ url: 'stratum+tcp://pool.example.com' }])
})

test('getThingConf delegates to super for nextAvailableCode requestType', async (t) => {
  const ctx = makeWrkCtx()
  ctx.mem.nextAvailableCode = 99
  const result = await ctx.getThingConf({ requestType: 'nextAvailableCode' })
  t.is(result, 99)
})

// ---------------------------------------------------------------------------
// _queryThingHook
// ---------------------------------------------------------------------------

test('_queryThingHook does nothing for non-setupPools methods', async (t) => {
  const ctx = makeWrkCtx({ things: {} })
  ctx.saveThingData = async () => t.fail('should not be called')
  await ctx._queryThingHook({ method: 'reboot', id: 'x' }, { success: true })
  t.pass()
})

test('_queryThingHook does nothing when res.success is false', async (t) => {
  const ctx = makeWrkCtx({ things: {} })
  ctx.saveThingData = async () => t.fail('should not be called')
  await ctx._queryThingHook({ method: 'setupPools', id: 'x' }, { success: false })
  t.pass()
})

test('_queryThingHook updates poolConfig and saves when it changes', async (t) => {
  let saved = null
  const thg = { id: 'thg1', ctrl: { poolConfig: 'cfg-new' }, info: { poolConfig: 'cfg-old' } }
  const ctx = makeWrkCtx({ things: { thg1: thg } })
  ctx.saveThingData = async (d) => { saved = d }
  await ctx._queryThingHook({ method: 'setupPools', id: 'thg1' }, { success: true })
  t.is(thg.info.poolConfig, 'cfg-new')
  t.ok(saved, 'saveThingData was called')
})

test('_queryThingHook does not save when poolConfig is unchanged', async (t) => {
  let saved = false
  const thg = { id: 'thg1', ctrl: { poolConfig: 'cfg-same' }, info: { poolConfig: 'cfg-same' } }
  const ctx = makeWrkCtx({ things: { thg1: thg } })
  ctx.saveThingData = async () => { saved = true }
  await ctx._queryThingHook({ method: 'setupPools', id: 'thg1' }, { success: true })
  t.is(saved, false)
})

// ---------------------------------------------------------------------------
// collectSnapsHook0
// ---------------------------------------------------------------------------

test('collectSnapsHook0 calls saveSharesData', async (t) => {
  let called = false
  const ctx = makeWrkCtx()
  ctx.saveSharesData = async () => { called = true }
  await WrkMinerRack.prototype.collectSnapsHook0.call(ctx)
  t.is(called, true)
})

test('collectSnapsHook0 swallows errors from saveSharesData', async (t) => {
  const ctx = makeWrkCtx()
  ctx.saveSharesData = async () => { throw new Error('ERR_SHARES_FAIL') }
  await WrkMinerRack.prototype.collectSnapsHook0.call(ctx)
  t.pass('error was swallowed')
})

// ---------------------------------------------------------------------------
// saveSharesData
// ---------------------------------------------------------------------------

test('saveSharesData completes with no things', async (t) => {
  const ctx = makeWrkCtx({ things: {} })
  await ctx.saveSharesData()
  t.pass()
})

test('saveSharesData aggregates shares per container and calls saveLogData', async (t) => {
  const calls = []
  const orig = lWrkFunLogs.saveLogData
  lWrkFunLogs.saveLogData = async function (key, ts, data) { calls.push({ key, data }) }
  t.teardown(() => { lWrkFunLogs.saveLogData = orig })

  const ctx = makeWrkCtx({
    things: {
      m1: { info: { container: 'c1' }, last: { snap: { stats: { all_pools_shares: { accepted: 5, rejected: 1, stale: 0 } } } } },
      m2: { info: { container: 'c1' }, last: { snap: { stats: { all_pools_shares: { accepted: 3, rejected: 0, stale: 1 } } } } }
    }
  })

  await ctx.saveSharesData()
  t.is(calls.length, 1)
  t.is(calls[0].data.pools_accepted_shares_total, 8)
  t.is(calls[0].data.pools_rejected_shares_total, 1)
  t.is(calls[0].data.pools_stale_shares_total, 1)
})

test('saveSharesData handles things without snap data (zero shares)', async (t) => {
  const calls = []
  const orig = lWrkFunLogs.saveLogData
  lWrkFunLogs.saveLogData = async function (key, ts, data) { calls.push({ key, data }) }
  t.teardown(() => { lWrkFunLogs.saveLogData = orig })

  const ctx = makeWrkCtx({
    things: { m1: { info: { container: 'c1' }, last: null } }
  })

  await ctx.saveSharesData()
  t.is(calls.length, 1)
  t.is(calls[0].data.pools_accepted_shares_total, 0)
})

// ---------------------------------------------------------------------------
// saveAggrShares
// ---------------------------------------------------------------------------

test('saveAggrShares completes with no things', async (t) => {
  const ctx = makeWrkCtx({ things: {} })
  await ctx.saveAggrShares(new Date())
  t.pass()
})

test('saveAggrShares calls tailLog and saveLogData for each container', async (t) => {
  const logCalls = []
  const orig = lWrkFunLogs.saveLogData
  lWrkFunLogs.saveLogData = async function (key, ts, data) { logCalls.push({ key, data }) }
  t.teardown(() => { lWrkFunLogs.saveLogData = orig })

  const ctx = makeWrkCtx({ things: { m1: { info: { container: 'c1' } } } })
  ctx.tailLog = async () => [
    { pools_accepted_shares_total: 10, pools_rejected_shares_total: 2, pools_stale_shares_total: 1 }
  ]

  await ctx.saveAggrShares(new Date())
  t.is(logCalls.length, 1)
  t.is(logCalls[0].data.pools_accepted_shares_total, 10)
  t.is(logCalls[0].data.pools_rejected_shares_total, 2)
  t.is(logCalls[0].data.pools_stale_shares_total, 1)
})

// ---------------------------------------------------------------------------
// _saveMiningStartupStatus
// ---------------------------------------------------------------------------

test('_saveMiningStartupStatus returns 0 when tailLog throws', async (t) => {
  const ctx = makeWrkCtx()
  ctx.tailLog = async () => { throw new Error('ERR_TAIL_LOG') }
  t.is(await ctx._saveMiningStartupStatus(new Date()), 0)
})

test('_saveMiningStartupStatus covers onlinePct computation when tailLog returns data', async (t) => {
  const ctx = makeWrkCtx()
  ctx.tailLog = async () => [{
    offline_or_sleeping_miners_cnt: 2,
    error_miners_cnt: 1,
    online_or_minor_error_miners_cnt: 8
  }]
  const result = await ctx._saveMiningStartupStatus(new Date())
  t.ok(result === 0 || result === 1, 'returns 0 or 1')
})
