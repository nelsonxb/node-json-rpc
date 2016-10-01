'use strict'

import test from 'ava'

const rpc = require('../core')

test("Caller: #createRequest() creates valid request", t => {
  let caller = new rpc.Caller()
  let request = caller.createRequest('foo', [1, 2, 3], 0)
  t.is(request.jsonrpc, '2.0')
  t.is(request.id, 0)
  t.is(request.method, 'foo')
  t.deepEqual(request.params, [1, 2, 3])

  request = caller.createRequest('bar', [{ x: 1, y: 0.9 }], 'some-id')
  t.is(request.jsonrpc, '2.0')
  t.is(request.id, 'some-id')
  t.is(request.method, 'bar')
  t.deepEqual(request.params, [{ x: 1, y: 0.9 }])

  request = caller.createRequest('baz', [], '*#')
  t.is(request.jsonrpc, '2.0')
  t.is(request.id, '*#')
  t.is(request.method, 'baz')
  t.deepEqual(request.params, [])
})
test("Caller: #createRequest() gets IDs automatically", t => {
  let caller = new rpc.Caller()
  let request = caller.createRequest('a', [])
  t.true(request.id != null)
})

test("Caller: #generateId() produces unique enough IDs", t => {
  let caller = new rpc.Caller()
  let prev = []

  for (let i = 0; i < 64; i += 1) {
    let id = caller.generateId()
    prev.forEach(jd => t.not(id, jd))
    prev.push(id)
  }
})

test("Caller: #callMethod() invokes #_makeRequest()", async t => {
  t.plan(1)

  let caller = new rpc.Caller()
  caller._makeRequest = function (request) {
    t.pass()
  }

  caller.callMethod({ jsonrpc: '2.0', method: 'foo', params: [] })
})
test("Caller: #callMethod() uses passed request object", async t => {
  let request
  let caller = new rpc.Caller()
  caller._makeRequest = function (passedReq) {
    t.deepEqual(passedReq, request)
  }

  request = { jsonrpc: '2.0', method: 'foo', params: [1, 2, 3] }
  caller.callMethod(request)
})
test("Caller: #callMethod() generates request object from args", async t => {
  let caller = new rpc.Caller()
  caller._makeRequest = function (request) {
    t.is(request.id, 'some-id')
    t.is(request.method, 'foo')
    t.deepEqual(request.params, [1, 2, 3])
    return Promise.resolve({ jsonrpc: '2.0', id: 'some-id', result: 6 })
  }

  await caller.callMethod('foo', [1, 2, 3], 'some-id')
})
test("Caller: #callMethod() returns promise", async t => {
  let caller = new rpc.Caller()
  caller._makeRequest = function (request) {
    return Promise.resolve({
      jsonrpc: '2.0', id: request.id, result: request.method
    })
  }

  let p = caller.callMethod('foo', [], 0)
  t.is(typeof p.then, 'function')
  t.is(typeof p.catch, 'function')
})
test("Caller: #callMethod() extracts result", async t => {
  let caller = new rpc.Caller()
  caller._makeRequest = function (request) {
    return Promise.resolve({
      jsonrpc: '2.0', id: request.id, result: request.method
    })
  }

  t.is(await caller.callMethod('foo', [], 0), 'foo')
})
test("Caller: #callMethod() doesn't return promise for notification", t => {
  let caller = new rpc.Caller()
  caller._makeRequest = function (request) {
    return null
  }

  let p = caller.callMethod({
    jsonrpc: '2.0', method: 'foo', params: []
  })
  t.true(p == null)
})
test("Caller: #callMethod() rejects when given an error response", async t => {
  let caller = new rpc.Caller()
  caller._makeRequest = function (request) {
    return Promise.resolve({ jsonrpc: '2.0', id: request.id, error: {
      code: 1, message: 'foo'
    } })
  }

  let p = caller.callMethod('foo', [], 0)
  t.is(typeof p.catch, 'function')
  t.throws(p)
})
test("Caller: #callMethod() extracts error when given an error response", async t => {
  let caller = new rpc.Caller()
  caller._makeRequest = function (request) {
    return Promise.resolve({ jsonrpc: '2.0', id: request.id, error: {
      code: 1, message: 'foo'
    } })
  }

  t.throws(caller.callMethod('foo', [], 0),
    e => e.code === 1 && e.message === 'foo')
})

test("Caller: #getMethod() returns a function", async t => {
  let caller = new rpc.Caller()
  caller._makeRequest = function (request) {}
  t.is(typeof caller.getMethod('foo'), 'function')
})
test("Caller: #getMethod()() calls correct method", async t => {
  t.plan(1)

  let caller = new rpc.Caller()
  caller._makeRequest = function (request) {
    t.is(request.method, 'foo')
    return Promise.resolve({ jsonrpc: '2.0', id: request.id, result: true })
  }
  await caller.getMethod('foo')()
})
test("Caller: #getMethod()() packs arguments correctly", async t => {
  t.plan(1)

  let caller = new rpc.Caller()
  caller._makeRequest = function (request) {
    t.deepEqual(request.params, [1, 2, 3])
    return Promise.resolve({ jsonrpc: '2.0', id: request.id, result: true })
  }
  await caller.getMethod('foo')(1, 2, 3)
})
test("Caller: #getMethod()() returns promise to result", async t => {
  let caller = new rpc.Caller()
  caller._makeRequest = function (request) {
    return Promise.resolve({ jsonrpc: '2.0', id: request.id, result: true })
  }
  let p = caller.getMethod('foo')(1, 2, 3)
  t.is(typeof p.then, 'function')
  t.is(typeof p.catch, 'function')
  t.is(await p, true)
})

test("Runner: Auto-creates #localCaller", t => {
  let runner = new rpc.Runner({})
  t.true(runner.localCaller instanceof rpc.LocalCaller)
})

test("Runner: #verifyJSON() returns parsed JSON", t => {
  let runner = new rpc.Runner({})
  let o = runner.verifyJSON('{"jsonrpc":"2.0", "method":"foo", "params":[]}')
  t.is(o.jsonrpc, '2.0')
  t.is(o.method, 'foo')
  t.deepEqual(o.params, [])
})
test("Runner: #verifyJSON() throws error usable in response", t => {
  t.plan(2)
  let runner = new rpc.Runner({})
  try {
    runner.verifyJSON('{')
  } catch (e) {
    t.is(e.code, -32700)
    t.true(e.message != null)
  }
})

test("Runner: #verifyRequest() returns passed valid request", t => {
  let runner = new rpc.Runner({})
  let request

  request = { jsonrpc: '2.0', method: 'foo', params: [] }
  t.is(runner.verifyRequest(request), request)

  request = { jsonrpc: '2.0', id: 0, method: 'foo', params: {} }
  t.is(runner.verifyRequest(request), request)

  request = { jsonrpc: '2.0', id: 'some-id', method: 'foo', params: [1, 5, 2] }
  t.is(runner.verifyRequest(request), request)
})
test("Runner: #verifyRequest() throws on not object", t => {
  t.plan(2 * 4)
  let runner = new rpc.Runner({})
  let request

  request = []
  try { runner.verifyRequest(request) }
  catch (e) {
    t.is(e.code, -32600)
    t.true(e.message != null)
  }

  request = ''
  try { runner.verifyRequest(request) }
  catch (e) {
    t.is(e.code, -32600)
    t.true(e.message != null)
  }

  request = 0
  try { runner.verifyRequest(request) }
  catch (e) {
    t.is(e.code, -32600)
    t.true(e.message != null)
  }

  request = null
  try { runner.verifyRequest(request) }
  catch (e) {
    t.is(e.code, -32600)
    t.true(e.message != null)
  }
})
test("Runner: #verifyRequest() throws on invalid jsonrpc version", t => {
  t.plan(2 * 4)
  let runner = new rpc.Runner({})
  let request

  request = { jsonrpc: '1.9', method: 'foo', params: [] }
  try { runner.verifyRequest(request) }
  catch (e) {
    t.is(e.code, -32600)
    t.true(e.message != null)
  }

  request = { jsonrpc: '2.1', method: 'foo', params: [] }
  try { runner.verifyRequest(request) }
  catch (e) {
    t.is(e.code, -32600)
    t.true(e.message != null)
  }

  request = { jsonrpc: '2', method: 'foo', params: [] }
  try { runner.verifyRequest(request) }
  catch (e) {
    t.is(e.code, -32600)
    t.true(e.message != null)
  }

  request = { jsonrpc: 2, method: 'foo', params: [] }
  try { runner.verifyRequest(request) }
  catch (e) {
    t.is(e.code, -32600)
    t.true(e.message != null)
  }
})
test("Runner: #verifyRequest() throws on missing method name", t => {
  t.plan(2 * 1)
  let runner = new rpc.Runner({})
  let request

  request = { jsonrpc: '2.0', params: [] }
  try { runner.verifyRequest(request) }
  catch (e) {
    t.is(e.code, -32600)
    t.true(e.message != null)
  }
})
test("Runner: #verifyRequest() throws on missing params", t => {
  t.plan(2 * 1)
  let runner = new rpc.Runner({})
  let request

  request = { jsonrpc: '2.0', method: 'foo' }
  try { runner.verifyRequest(request) }
  catch (e) {
    t.is(e.code, -32600)
    t.true(e.message != null)
  }
})

test("Runner: #callMethod() calls correct method", async t => {
  t.plan(1)
  let runner = new rpc.Runner({
    'check': () => t.pass()
  })
  await runner.callMethod({
    jsonrpc: '2.0', method: 'check', params: []
  })
})
test("Runner: #callMethod() passes params", async t => {
  let runner = new rpc.Runner({
    'check': (a, b, c, d) => {
      t.is(a, 1)
      t.is(b, 2)
      t.is(c, 3)
      t.is(d, 4)
    }
  })
  await runner.callMethod({
    jsonrpc: '2.0', method: 'check', params: [1, 2, 3, 4]
  })
})
test("Runner: #callMethod() returns a promise", async t => {
  let runner = new rpc.Runner({
    'check': () => {}
  })

  let p = runner.callMethod({
    jsonrpc: '2.0', method: 'check', params: [1, 2, 3, 4]
  })
  t.is(typeof p.then, 'function')
  t.is(typeof p.catch, 'function')
})
test("Runner: #callMethod() resolves to result", async t => {
  let runner = new rpc.Runner({
    'check': () => 'foo'
  })

  t.is(await runner.callMethod({
    jsonrpc: '2.0', method: 'check', params: []
  }), 'foo')
})
test("Runner: #callMethod() rejects on error", async t => {
  let runner = new rpc.Runner({
    'check': () => { throw {} }
  })

  t.throws(runner.callMethod({
    jsonrpc: '2.0', method: 'check', params: []
  }))
})
test("Runner: #callMethod() rejects on invalid method name", async t => {
  let runner = new rpc.Runner({
    'check': () => {}
  })

  t.throws(runner.callMethod({
    jsonrpc: '2.0', method: 'none', params: []
  }), e => e.code === -32601)
})
test("Runner: #callMethod() rejects to error valid for response", async t => {
  let runner = new rpc.Runner({
    'check': () => { throw {} }
  })

  t.throws(runner.callMethod({
    jsonrpc: '2.0', method: 'check', params: []
  }), e => typeof e.code === 'number')
})

test("Runner: #handleRequest() returns a promise", async t => {
  let runner = new rpc.Runner({
    'check': () => {}
  })

  let p = runner.handleRequest({
    jsonrpc: '2.0', id: 0, method: 'check', params: []
  })
  t.is(typeof p.then, 'function')
  t.is(typeof p.catch, 'function')
})
test("Runner: #handleRequest() resolves to valid response", async t => {
  let runner = new rpc.Runner({
    'check': () => {}
  })

  let response = await runner.handleRequest({
    jsonrpc: '2.0', id: 0, method: 'check', params: []
  })
  t.is(response.jsonrpc, '2.0')
  t.is(response.id, 0)
  t.true(response.hasOwnProperty('result'))
})
test("Runner: #handleRequest() calls correct method", async t => {
  t.plan(1)
  let runner = new rpc.Runner({
    'check': () => t.pass(),
    'foo': () => t.fail()
  })
  await runner.handleRequest({
    jsonrpc: '2.0', id: 0, method: 'check', params: []
  })
})
test("Runner: #handleRequest() passes params", async t => {
  let runner = new rpc.Runner({
    'check': (a, b, c, d) => {
      t.is(a, 1)
      t.is(b, 2)
      t.is(c, 3)
      t.is(d, 4)
    }
  })
  await runner.handleRequest({
    jsonrpc: '2.0', method: 'check', params: [1, 2, 3, 4]
  })
})
test("Runner: #handleRequest() response is correct", async t => {
  let runner = new rpc.Runner({
    'check': () => 'foo'
  })

  let response = await runner.handleRequest({
    jsonrpc: '2.0', id: 0, method: 'check', params: []
  })
  t.is(response.jsonrpc, '2.0')
  t.is(response.id, 0)
  t.is(response.result, 'foo')

  response = await runner.handleRequest({
    jsonrpc: '2.0', method: 'check', params: []
  })
  t.true(response == null)
})
test("Runner: #handleRequest() resolves on error", async t => {
  let runner = new rpc.Runner({
    'check': () => { throw {} }
  })

  let response = await runner.handleRequest({
    jsonrpc: '2.0', id: 0, method: 'check', params: []
  })
  t.is(response.jsonrpc, '2.0')
  t.is(response.id, 0)
  t.is(typeof response.error, 'object')

  response = await runner.handleRequest({
    jsonrpc: '2.0', method: 'check', params: []
  })
  t.true(response == null)
})
test("Runner: #handleRequest() produces error on invalid request", async t => {
  let runner = new rpc.Runner({
    'check': () => {}
  })

  let response = await runner.handleRequest({
    jsonrpc: '2.0', id: 0, params: []
  })
  t.is(typeof response.error, 'object')
  t.is(response.error.code, -32600)

  response = await runner.handleRequest({
    jsonrpc: '2.0', id: 0, method: 'check'
  })
  t.is(typeof response.error, 'object')
  t.is(response.error.code, -32600)

  response = await runner.handleRequest({
    jsonrpc: '2', id: 0, method: 'check', params: []
  })
  t.is(typeof response.error, 'object')
  t.is(response.error.code, -32600)

  response = await runner.handleRequest({
    jsonrpc: '2.0', params: []
  })
  t.true(response == null)
})

test("Runner: #createResultResponse() produces correct response", async t => {
  let runner = new rpc.Runner({})
  let response

  response = runner.createResultResponse('foo', 0)
  t.is(response.jsonrpc, '2.0')
  t.is(response.id, 0)
  t.is(response.result, 'foo')

  response = runner.createResultResponse('foo')
  t.true(response == null)
})
test("Runner: #createErrorResponse() produces correct response", async t => {
  let runner = new rpc.Runner({})
  let response

  response = runner.createErrorResponse({ code: 1 }, 0)
  t.is(response.jsonrpc, '2.0')
  t.is(response.id, 0)
  t.true(response.hasOwnProperty('error'))
  t.is(response.error.code, 1)

  response = runner.createErrorResponse({ code: 1 })
  t.true(response == null)

  response = runner.createErrorResponse({ code: -32700 })
  t.is(response.jsonrpc, '2.0')
  t.true(response.id == null)
  t.true(response.hasOwnProperty('error'))
  t.is(response.error.code, -32700)
})

test("LocalCaller: Correct results", async t => {
  let runner = new rpc.Runner({
    'add': (a, b) => a + b,
    'sub': (a, b) => a - b,
    'hello': (name) => `Hello, ${name}!`
  })
  let api = rpc(runner.localCaller)

  t.is(await api('add')(1, 2), 3)
  t.is(await api('add')(2, 3), 5)
  t.is(await api('sub')(1, 2), -1)
  t.is(await api('hello')('World'), 'Hello, World!')
  t.is(await api('hello')('RPC'), 'Hello, RPC!')
})
test("LocalCaller: Errors handled correctly", async t => {
  let runner = new rpc.Runner({
    'check': () => { throw new Error('foo') }
  })
  let api = rpc(runner.localCaller)

  t.throws(api('check')(),
    e => typeof e.code === 'number' && e.message == 'foo')
})
