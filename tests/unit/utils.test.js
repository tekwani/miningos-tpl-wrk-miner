'use strict'

const test = require('brittle')
const { getRandomString, hasErrorAndPositiveHashrate, sumPoolsShares } = require('../../workers/lib/utils')
const { STATUS } = require('../../workers/lib/constants')

test('getRandomString generates correct length', (t) => {
  const length = 15
  const result = getRandomString(length)
  t.is(result.length, length, 'Should generate string of correct length')
  t.ok(typeof result === 'string', 'Should return a string')
})

test('getRandomString generates different strings', (t) => {
  const str1 = getRandomString(10)
  const str2 = getRandomString(10)
  t.not(str1, str2, 'Should generate different strings')
})

test('getRandomString with zero length', (t) => {
  const result = getRandomString(0)
  t.is(result, '', 'Should return empty string for zero length')
})

test('hasErrorAndPositiveHashrate with error status and positive hashrate', (t) => {
  const entry = {
    last: {
      snap: {
        stats: {
          status: STATUS.ERROR,
          errors: ['err'],
          hashrate_mhs: { t_5m: 100 }
        }
      }
    }
  }
  t.ok(hasErrorAndPositiveHashrate(entry), 'Should return true for error status with positive hashrate')
})

test('hasErrorAndPositiveHashrate with error status and zero hashrate', (t) => {
  const entry = {
    last: {
      snap: {
        stats: {
          status: STATUS.ERROR,
          hashrate_mhs: { t_5m: 0 }
        }
      }
    }
  }
  t.absent(hasErrorAndPositiveHashrate(entry), 'Should return false for error status with zero hashrate')
})

test('hasErrorAndPositiveHashrate with mining status and positive hashrate', (t) => {
  const entry = {
    last: {
      snap: {
        stats: {
          status: STATUS.MINING,
          hashrate_mhs: { t_5m: 100 }
        }
      }
    }
  }
  t.absent(hasErrorAndPositiveHashrate(entry), 'Should return false for mining status')
})

test('hasErrorAndPositiveHashrate with missing stats', (t) => {
  const entry = { last: { snap: {} } }
  t.absent(hasErrorAndPositiveHashrate(entry), 'Should return false for missing stats')
})

test('hasErrorAndPositiveHashrate with missing entry', (t) => {
  t.absent(hasErrorAndPositiveHashrate(null), 'Should return false for null entry')
  t.absent(hasErrorAndPositiveHashrate(undefined), 'Should return false for undefined entry')
})

test('sumPoolsShares with valid pools', (t) => {
  const pools = [
    { accepted: '10', rejected: '2', stale: '1' },
    { accepted: '5', rejected: '1', stale: '0' }
  ]
  t.is(sumPoolsShares(pools, 'accepted'), 15, 'Should sum accepted shares correctly')
  t.is(sumPoolsShares(pools, 'rejected'), 3, 'Should sum rejected shares correctly')
  t.is(sumPoolsShares(pools, 'stale'), 1, 'Should sum stale shares correctly')
})

test('sumPoolsShares with invalid values', (t) => {
  const pools = [
    { accepted: 'invalid', rejected: '5', stale: '2' },
    { accepted: '10', rejected: 'not-a-number', stale: '3' }
  ]
  t.is(sumPoolsShares(pools, 'accepted'), 10, 'Should handle invalid numbers as 0')
  t.is(sumPoolsShares(pools, 'rejected'), 5, 'Should handle invalid numbers as 0')
  t.is(sumPoolsShares(pools, 'stale'), 5, 'Should handle invalid numbers as 0')
})

test('sumPoolsShares with empty array', (t) => {
  t.is(sumPoolsShares([], 'accepted'), 0, 'Should return 0 for empty array')
})

test('sumPoolsShares with null/undefined', (t) => {
  t.is(sumPoolsShares(null, 'accepted'), 0, 'Should return 0 for null')
  t.is(sumPoolsShares(undefined, 'accepted'), 0, 'Should return 0 for undefined')
})

test('sumPoolsShares with non-array', (t) => {
  t.is(sumPoolsShares({}, 'accepted'), 0, 'Should return 0 for non-array')
  t.is(sumPoolsShares('string', 'accepted'), 0, 'Should return 0 for string')
})
