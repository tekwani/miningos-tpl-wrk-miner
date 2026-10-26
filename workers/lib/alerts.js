'use strict'

const libAlerts = require('@tetherto/miningos-tpl-wrk-thing/workers/lib/alerts')
const libUtils = require('@tetherto/miningos-tpl-wrk-thing/workers/lib/utils')

const MIN_30_MS = 30 * 60 * 1000

// Tracks, per miner id, the wall-clock time at which hashrate_mhs.avg was last
// seen to go from 0/absent to > 0. Reset to untracked whenever hashrate drops
// back to 0/absent, so a dip restarts the warm-up clock. Keyed by ctx.id
// (not a bare module-level scalar) because a single worker process evaluates
// alerts for many miners concurrently, and ctx itself is rebuilt fresh every
// poll cycle so it can't hold state across calls. Shared here (rather than
// duplicated per vendor) so any miner_default spec, and any vendor layering on
// top of it, can gate on the same clock.
const miningStartedAt = new Map()

const timeSinceMiningMs = (ctx, snap) => {
  const now = snap?.stats?.timestamp ?? Date.now()
  const hashrate = snap?.stats?.hashrate_mhs?.avg
  if (!(hashrate > 0)) {
    miningStartedAt.delete(ctx.id)
    return 0
  }
  if (!miningStartedAt.has(ctx.id)) {
    miningStartedAt.set(ctx.id, now)
  }
  return now - miningStartedAt.get(ctx.id)
}

function isValidPoolConfigSnap (ctx, snap) {
  return (
    libUtils.isValidSnap(snap) &&
    !libUtils.isOffline(snap) &&
    ctx.thingConf.pools &&
    ctx.thingConf.pools.length > 0 &&
    snap.config.pool_config &&
    snap.config.pool_config.length > 0
  )
}

// Pool usernames are written as `<worker_name>.<suffix>` (see preProcessPoolData),
// where the pool credits <worker_name> as the account and <suffix> labels the
// device. Returns the suffix, or null when the username has none.
function poolUsernameSuffix (username, workerName) {
  const prefix = `${workerName}.`
  if (workerName && username.startsWith(prefix)) return username.slice(prefix.length)
  const dot = username.indexOf('.')
  return dot === -1 ? null : username.slice(dot + 1)
}

function isIpPoolUsername (ip, minerPools, confPools) {
  const formattedIP = ip.replace(/\./g, 'x')
  for (let i = 0; i < confPools.length; i++) {
    const username = minerPools[i]?.username ?? ''
    if (poolUsernameSuffix(username, confPools[i].worker_name) !== formattedIP) {
      return false
    }
  }
  return true
}

function isCorrectPoolUsername (id, minerPools, confPools) {
  for (let i = 0; i < confPools.length; i++) {
    const username = minerPools[i]?.username ?? ''
    if (poolUsernameSuffix(username, confPools[i].worker_name) !== id) {
      return false
    }
  }
  return true
}

function isConfigWorkerNameInPoolUsername (minerPools, confPools) {
  for (let i = 0; i < confPools.length; i++) {
    const workerName = confPools[i].worker_name
    const username = minerPools[i]?.username ?? ''

    if (username !== workerName && !username.startsWith(`${workerName}.`)) {
      return false
    }
  }
  return true
}

// Firmware may echo a pool url back with different case, a trailing slash or
// without the default scheme, none of which change where the hashrate goes.
function normalizePoolUrl (url) {
  if (typeof url !== 'string') return url
  const trimmed = url.trim().toLowerCase().replace(/\/+$/, '')
  return trimmed.includes('://') ? trimmed : `stratum+tcp://${trimmed}`
}

function areMinerPoolsUrlsCorrectlySetup (minerPools, urls) {
  return urls.every((url, i) => normalizePoolUrl(minerPools[i]?.url) === normalizePoolUrl(url))
}

function wrongMinerPoolProbe (ctx, snap) {
  const urls = ctx.info?.poolUrls ?? (ctx.info?.poolConfig ? null : ctx.thingConf.pools.map(p => p.url))
  return !!urls && !areMinerPoolsUrlsCorrectlySetup(snap.config.pool_config, urls)
}

function wrongMinerSubaccountProbe (ctx, snap) {
  const configPools = ctx.thingConf.pools
  const minerPools = snap.config.pool_config
  if (configPools.length > 0 && minerPools.length > 0) {
    return !isConfigWorkerNameInPoolUsername(minerPools, configPools)
  }
  return false
}

function wrongWorkerNameProbe (ctx, snap) {
  const configPools = ctx.thingConf.pools
  const minerPools = snap.config.pool_config
  const id = ctx.id
  const ip = snap.config.network_config.ip_address
  if (configPools.length > 0 && minerPools.length > 0) {
    return (
      !isCorrectPoolUsername(id, minerPools, configPools) &&
      !isIpPoolUsername(ip, minerPools, configPools)
    )
  }
  return false
}

function ipWorkerNameProbe (ctx, snap) {
  const configPools = ctx.thingConf.pools
  const minerPools = snap.config.pool_config
  const ip = snap.config.network_config.ip_address

  if (configPools.length > 0 && minerPools.length > 0) {
    return isIpPoolUsername(ip, minerPools, configPools)
  }
  return false
}

libAlerts.specs.miner_default = {
  ...libAlerts.specs.default,
  wrong_miner_pool: {
    valid: (ctx, snap) => {
      return isValidPoolConfigSnap(ctx, snap)
    },
    probe: wrongMinerPoolProbe
  },
  wrong_miner_subaccount: {
    valid: (ctx, snap) => {
      return isValidPoolConfigSnap(ctx, snap)
    },
    probe: wrongMinerSubaccountProbe
  },
  wrong_worker_name: {
    valid: (ctx, snap) => {
      return isValidPoolConfigSnap(ctx, snap)
    },
    probe: wrongWorkerNameProbe
  },
  ip_worker_name: {
    valid: (ctx, snap) => {
      return isValidPoolConfigSnap(ctx, snap)
    },
    probe: ipWorkerNameProbe
  },
  'custom.low_hashrate.warning': {
    valid: (ctx, snap) => {
      const configuredParams = ctx.configuredParams['custom.low_hashrate.warning']
      const enabled = configuredParams?.enabled
      const miningMs = timeSinceMiningMs(ctx, snap)

      return enabled && isValidPoolConfigSnap(ctx, snap) && miningMs > MIN_30_MS
    },
    probe: (ctx, snap) => {
      const configuredParams = ctx.configuredParams['custom.low_hashrate.warning']
      const threshold = configuredParams.minHashRateMhs
      return snap.stats.hashrate_mhs.avg < threshold
    }
  },
  'custom.low_hashrate.critical': {
    valid: (ctx, snap) => {
      const configuredParams = ctx.configuredParams['custom.low_hashrate.critical']
      const enabled = configuredParams?.enabled
      const miningMs = timeSinceMiningMs(ctx, snap)

      return enabled && isValidPoolConfigSnap(ctx, snap) && miningMs > MIN_30_MS
    },
    probe: (ctx, snap) => {
      const configuredParams = ctx.configuredParams['custom.low_hashrate.critical']
      const threshold = configuredParams.minHashRateMhs
      return snap.stats.hashrate_mhs.avg < threshold
    }
  },
  'custom.wrong_miner_pool.warning': {
    valid: (ctx, snap) => {
      const configuredParams = ctx.configuredParams['custom.wrong_miner_pool.warning']
      const enabled = configuredParams?.enabled

      return enabled && isValidPoolConfigSnap(ctx, snap)
    },
    probe: wrongMinerPoolProbe
  },
  'custom.wrong_miner_pool.critical': {
    valid: (ctx, snap) => {
      const configuredParams = ctx.configuredParams['custom.wrong_miner_pool.critical']
      const enabled = configuredParams?.enabled

      return enabled && isValidPoolConfigSnap(ctx, snap)
    },
    probe: wrongMinerPoolProbe
  },
  'custom.wrong_miner_subaccount.warning': {
    valid: (ctx, snap) => {
      const configuredParams = ctx.configuredParams['custom.wrong_miner_subaccount.warning']
      const enabled = configuredParams?.enabled

      return enabled && isValidPoolConfigSnap(ctx, snap)
    },
    probe: wrongMinerSubaccountProbe
  },
  'custom.wrong_miner_subaccount.critical': {
    valid: (ctx, snap) => {
      const configuredParams = ctx.configuredParams['custom.wrong_miner_subaccount.critical']
      const enabled = configuredParams?.enabled

      return enabled && isValidPoolConfigSnap(ctx, snap)
    },
    probe: wrongMinerSubaccountProbe
  },
  'custom.wrong_worker_name.warning': {
    valid: (ctx, snap) => {
      const configuredParams = ctx.configuredParams['custom.wrong_worker_name.warning']
      const enabled = configuredParams?.enabled

      return enabled && isValidPoolConfigSnap(ctx, snap)
    },
    probe: wrongWorkerNameProbe
  },
  'custom.wrong_worker_name.critical': {
    valid: (ctx, snap) => {
      const configuredParams = ctx.configuredParams['custom.wrong_worker_name.critical']
      const enabled = configuredParams?.enabled

      return enabled && isValidPoolConfigSnap(ctx, snap)
    },
    probe: wrongWorkerNameProbe
  },
  'custom.ip_worker_name.warning': {
    valid: (ctx, snap) => {
      const configuredParams = ctx.configuredParams['custom.ip_worker_name.warning']
      const enabled = configuredParams?.enabled

      return enabled && isValidPoolConfigSnap(ctx, snap)
    },
    probe: ipWorkerNameProbe
  },
  'custom.ip_worker_name.critical': {
    valid: (ctx, snap) => {
      const configuredParams = ctx.configuredParams['custom.ip_worker_name.critical']
      const enabled = configuredParams?.enabled

      return enabled && isValidPoolConfigSnap(ctx, snap)
    },
    probe: ipWorkerNameProbe
  }
}

libAlerts.timeSinceMiningMs = timeSinceMiningMs

module.exports = libAlerts
