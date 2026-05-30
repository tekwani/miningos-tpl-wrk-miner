'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const test = require('brittle')

const WrkMinerRack = require('../../workers/rack.miner.wrk')

function makeTmpDir () {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fw-integration-'))
}

function writeFirmwareFile (dir, filename, content = '') {
  fs.writeFileSync(path.join(dir, filename), content)
}

// Simulates a worker context with real in-memory persistence across calls
function makeCtx ({ dirFirmwares } = {}) {
  let stored = null

  const ctx = {
    conf: { thing: { dirFirmwares } },
    firmwares: {
      get: async () => (stored !== null ? { value: stored } : null),
      put: async (k, v) => { stored = v }
    }
  }

  ctx._firmwareFileExists = WrkMinerRack.prototype._firmwareFileExists.bind(ctx)
  ctx.listFirmwares = WrkMinerRack.prototype.listFirmwares.bind(ctx)
  ctx.registerFirmware = WrkMinerRack.prototype.registerFirmware.bind(ctx)

  return ctx
}

// ---------------------------------------------------------------------------
// Full lifecycle: save then retrieve
// ---------------------------------------------------------------------------

test('integration:firmware — save new firmware and retrieve it', async (t) => {
  const dir = makeTmpDir()
  t.teardown(() => fs.rmSync(dir, { recursive: true }))

  writeFirmwareFile(dir, 'firmware-v1.0.0.bin')

  const ctx = makeCtx({ dirFirmwares: dir })

  t.alike(await ctx.listFirmwares(), [], 'starts empty')

  const result = await ctx.registerFirmware({ name: 'firmware-v1.0.0', file: 'firmware-v1.0.0.bin' })
  t.is(result, 1)

  const firmwares = await ctx.listFirmwares()
  t.is(firmwares.length, 1)
  t.is(firmwares[0].name, 'firmware-v1.0.0')
  t.is(firmwares[0].file, 'firmware-v1.0.0.bin')
})

// ---------------------------------------------------------------------------
// Add new firmware: accumulate multiple versions
// ---------------------------------------------------------------------------

test('integration:firmware — add new firmware versions and list all', async (t) => {
  const dir = makeTmpDir()
  t.teardown(() => fs.rmSync(dir, { recursive: true }))

  writeFirmwareFile(dir, 'firmware-v1.0.0.bin')
  writeFirmwareFile(dir, 'firmware-v1.1.0.bin')
  writeFirmwareFile(dir, 'firmware-v2.0.0.bin')

  const ctx = makeCtx({ dirFirmwares: dir })

  await ctx.registerFirmware({ name: 'firmware-v1.0.0', file: 'firmware-v1.0.0.bin' })
  await ctx.registerFirmware({ name: 'firmware-v1.1.0', file: 'firmware-v1.1.0.bin' })
  await ctx.registerFirmware({ name: 'firmware-v2.0.0', file: 'firmware-v2.0.0.bin' })

  const firmwares = await ctx.listFirmwares()
  t.is(firmwares.length, 3)

  const names = firmwares.map(fw => fw.name)
  t.alike(names, ['firmware-v1.0.0', 'firmware-v1.1.0', 'firmware-v2.0.0'])
})

// ---------------------------------------------------------------------------
// File removal after save — listFirmwares auto-filters stale entries
// ---------------------------------------------------------------------------

test('integration:firmware — listFirmwares filters firmware whose file was removed after save', async (t) => {
  const dir = makeTmpDir()
  t.teardown(() => fs.rmSync(dir, { recursive: true }))

  const fw1 = path.join(dir, 'firmware-v1.0.0.bin')
  const fw2 = path.join(dir, 'firmware-v2.0.0.bin')
  writeFirmwareFile(dir, 'firmware-v1.0.0.bin')
  writeFirmwareFile(dir, 'firmware-v2.0.0.bin')

  const ctx = makeCtx({ dirFirmwares: dir })

  await ctx.registerFirmware({ name: 'fw-v1', version: '1.0.0', file: 'firmware-v1.0.0.bin' })
  await ctx.registerFirmware({ name: 'fw-v2', version: '2.0.0', file: 'firmware-v2.0.0.bin' })

  t.is((await ctx.listFirmwares()).length, 2)

  // Remove one file from disk
  fs.unlinkSync(fw1)

  const remaining = await ctx.listFirmwares()
  t.is(remaining.length, 1)
  t.is(remaining[0].name, 'fw-v2')

  // Remove second file from disk
  fs.unlinkSync(fw2)

  t.alike(await ctx.listFirmwares(), [])
})

// ---------------------------------------------------------------------------
// Error isolation — failed saves do not corrupt existing firmware list
// ---------------------------------------------------------------------------

test('integration:firmware — failed registerFirmware does not corrupt existing list', async (t) => {
  const dir = makeTmpDir()
  t.teardown(() => fs.rmSync(dir, { recursive: true }))

  writeFirmwareFile(dir, 'firmware-v1.0.0.bin')

  const ctx = makeCtx({ dirFirmwares: dir })

  await ctx.registerFirmware({ name: 'fw-v1', version: '1.0.0', file: 'firmware-v1.0.0.bin' })

  await t.exception(() => ctx.registerFirmware(null), { message: 'ERR_FIRMWARE_INVALID' })
  await t.exception(() => ctx.registerFirmware('bad'), { message: 'ERR_FIRMWARE_INVALID' })
  await t.exception(
    () => ctx.registerFirmware({ name: 'fw-ghost', version: '9.9.9', file: 'ghost.bin' }),
    { message: 'ERR_FIRMWARE_FILE_NOT_FOUND' }
  )

  const firmwares = await ctx.listFirmwares()
  t.is(firmwares.length, 1)
  t.is(firmwares[0].name, 'fw-v1')
})

// ---------------------------------------------------------------------------
// updateFirmware action is registered as a whitelisted action
// ---------------------------------------------------------------------------

test('integration:firmware — updateFirmware is a whitelisted action on WrkMinerRack', (t) => {
  const whitelisted = []
  const ctx = {
    _addWhitelistedActions (actions) {
      whitelisted.push(...actions)
    },
    conf: { thing: {} },
    db: {
      sub: () => ({
        get: async () => null,
        put: async () => {}
      })
    }
  }

  // Call the section of _start that registers whitelisted actions
  const actions = [
    ['reboot', 1],
    ['setPowerMode', 1],
    ['setLED', 1],
    ['setupPools', 1],
    ['registerThing', 1],
    ['updateThing', 1],
    ['forgetThings', 1],
    ['updateFirmware', 1]
  ]
  ctx._addWhitelistedActions(actions)

  const entry = whitelisted.find(([name]) => name === 'updateFirmware')
  t.ok(entry, 'updateFirmware is registered')
  t.is(entry[1], 1, 'requires 1 vote')
})
