'use strict'

const rpc = require('./rpc')

function iseq (e, a) {
  // TODO: Add deepEqual support
  return e === a
}

let ntotal = 0
let nactual = 0

function ensure (promise, expected, expectError) {
  ntotal += 1
  promise
    .then((result) => {
      if (expectError) {
        console.log('TEST FAILED expected error got result', result,
          '(', nactual, '/', ntotal, ')')
      } else if (iseq(expected, result)) {
        nactual += 1
        console.log('TEST PASSED got expected result',
          '(', nactual, '/', ntotal, ')')
      } else {
        console.log('TEST FAILED expected', expected, 'got', result,
          '(', nactual, '/', ntotal, ')')
      }
    })
    .catch((error) => {
      if (expectError) {
        if (error instanceof expected) {
          nactual += 1
          console.log('TEST PASSED got expected error',
            '(', nactual, '/', ntotal, ')')
        } else {
          console.log('TEST FAILED expected', expected.name, 'got', error,
            '(', nactual, '/', ntotal, ')')
        }
      } else {
        console.log('TEST FAILED expected result got error', error,
          '(', nactual, '/', ntotal, ')')
      }
    })
}

let runner = new rpc.TCPRunner(12345, {
  'add': (a, b) => a + b,
  'sub': (a, b) => a - b
})

let caller = new rpc.TCPCaller('jrpc://localhost:12345')
let add = caller.getMethod('add')
let sub = caller.getMethod('sub')

ensure(add(1, 2), 3)
ensure(sub(5, 3), 2)

console.log('STARTING')
