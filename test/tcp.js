'use strict'

const BASE_PORT = 47720
let porti = BASE_PORT

import test from 'ava'

const rpc = require('../tcp')

test("Correct results", async t => {
  let runner = new rpc.TCPRunner(++porti, {
    'add': (a, b) => a + b,
    'sub': (a, b) => a - b,
    'hello': (name) => `Hello, ${name}!`
  })
  let api = rpc(new rpc.TCPCaller('jrpc:localhost:' + porti))

  t.is(await api('add')(1, 2), 3)
})
test("Works with multiple sequential calls", async t => {
  let runner = new rpc.TCPRunner(++porti, {
    'add': (a, b) => a + b,
    'sub': (a, b) => a - b,
    'hello': (name) => `Hello, ${name}!`
  })
  let api = rpc(new rpc.TCPCaller('jrpc:localhost:' + porti))

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
  let runner = new rpc.TCPRunner(++porti, {
    'check': () => { throw new Error('foo') }
  })
  let api = rpc(new rpc.TCPCaller('jrpc:localhost:' + porti))

  t.throws(api('check')(),
    e => typeof e.code === 'number' && e.message == 'foo')
})
