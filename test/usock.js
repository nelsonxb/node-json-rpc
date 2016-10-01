'use strict'

let socki = 0

import test from 'ava'

const fs = require('fs')
const rpc = require('../tcp')

const fsp = {
  exists (path) {
    return fsp.stat(path)
      .then(() => true)
      .catch(() => false)
  },

  stat (path) {
    return new Promise((resolve, reject) => {
      fs.stat(path, (err, stats) => {
        if (err) reject(err)
        else resolve(stats)
      })
    })
  },

  unlink (path) {
    return new Promise((resolve, reject) => {
      fs.unlink(path, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }
}

// NOTE: Once test.afterEach.always makes it into
// an AVA release, this will become an afterEach,
// since that would be tidier.
test.beforeEach('remove socket nodes', async t => {
  t.context.path = `test.${++socki}.sock`
  if (await fsp.exists(t.context.path))
    await fsp.unlink(t.context.path)
})

test("Correct results", async t => {
  let runner = new rpc.USockRunner(t.context.path, {
    'add': (a, b) => a + b,
    'sub': (a, b) => a - b,
    'hello': (name) => `Hello, ${name}!`
  })
  let api = rpc(new rpc.USockCaller(t.context.path))

  t.is(await api('add')(1, 2), 3)
})
test("Works with multiple sequential calls", async t => {
  let runner = new rpc.USockRunner(t.context.path, {
    'add': (a, b) => a + b,
    'sub': (a, b) => a - b,
    'hello': (name) => `Hello, ${name}!`
  })
  let api = rpc(new rpc.USockCaller(t.context.path))

  let arr = [
    [api('add')(1, 2), 3],
    [api('add')(2, 3), 5],
    [api('sub')(1, 2), -1],
    [api('hello')('World'), 'Hello, World!'],
    [api('hello')('RPC'), 'Hello, RPC!']
  ]

  t.plan(arr.length)
  await Promise.all(arr.map(a => a[0].then(r => t.is(r, a[1]))))
})
test("Errors handled correctly", async t => {
  let runner = new rpc.USockRunner(t.context.path, {
    'check': () => { throw new Error('foo') }
  })
  let api = rpc(new rpc.USockCaller(t.context.path))

  t.throws(api('check')(),
    e => typeof e.code === 'number' && e.message == 'foo')
})
