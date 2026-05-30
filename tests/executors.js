'use strict'

async function getSnapExecutor ({ dev }) {
  return await dev.getSnap()
}

async function rebootExecutor ({ dev }) {
  return await dev.reboot()
}

function setLEDExecutor (value) {
  return async ({ dev }) => { return await dev.setLED(value) }
}

function setPowerModeExecutor (value) {
  return async ({ dev }) => { return await dev.setPowerMode(value) }
}

function updateFirmwareExecutor (firmware) {
  return async ({ dev }) => { return await dev.updateFirmware(firmware) }
}

module.exports = {
  getSnapExecutor,
  rebootExecutor,
  setLEDExecutor,
  setPowerModeExecutor,
  updateFirmwareExecutor
}
