'use strict'

const path = require('path')
const { getSchema } = require(path.join(process.cwd(), 'tests/utils'))
const { updateFirmwareExecutor } = require('../executors')
const defaults = getSchema()

module.exports = () => ({
  updateFirmware: {
    stages: [
      {
        name: 'updateFirmware',
        ask: true,
        executor: updateFirmwareExecutor(),
        validate: defaults.success_validate
      }
    ]
  }
})
