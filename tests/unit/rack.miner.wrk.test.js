'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const test = require('brittle')

const WrkMinerRack = require('../../workers/rack.miner.wrk')

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
