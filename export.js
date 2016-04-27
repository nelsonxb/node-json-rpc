'use strict'

const DEFAULT_PORT = 55772

const tcp = require('net')
const url = require('url')

function callMethod (request, fns) {
  return new Promise((resolve, reject) => {
    if (typeof request !== 'object' || request instanceof Array)
      return reject({code: -32600, message: 'Invalid request: Not a JSON Object'})
    if (request.jsonrpc !== '2.0')
      return reject({code: -32600, message: 'Invalid request: Incorrect jsonrpc version'})
    if (!request.method)
      return reject({code: -32600, message: 'Invalid request: Missing method name'})
    if (!request.params)
      return reject({code: -32600, message: 'Invalid request: Missing params'})

    let method = fns[request.method]
    if (!method)
      return reject({code: -32601, message: 'Method not found'})

    resolve(method)
  }).then(method => method.apply(null, request.params))
    .then(result => ({ jsonrpc: "2.0", id: request.id, result }),
          error => {
            error.code = error.code || -1
            let response = { jsonrpc: "2.0", error }
            if (request.id) response.id = request.id
            return response
          })
}

function getLocalFunction (fns, method) {
  return function () {
    let params = Array.from(arguments)
    console.dir(params)
    let request = { jsonrpc: "2.0", id: 0, method, params }
    return callMethod(request, fns)
      .then(response => response.error
          ? Promise.reject(response.error)
          : Promise.resolve(response.result))
  }
}

let transports = {
  tcp: {
    init (listenUri, fns) {
      let server = transports.tcp.createServer(fns)
      server.listen(listenUri.port || DEFAULT_PORT, listenUri.hostname)
      return (method) => getLocalFunction(fns, method)
    },

    createServer (fns) {
      return tcp.createServer((c) => {
        c.setEncoding('utf8')
        c.on('data', transports.tcp.handleData.bind(c))
        c.fns = fns
      })
    },

    handleData (data) {
      let request
      try {
        request = JSON.parse(data)
      } catch (e) {
        this.write(JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32700,
            message: 'Parse error: ' + e.message
          }
        }))
        return
      }

      callMethod(request, this.fns)
        .then((response) => { this.write(JSON.stringify(response)) })
    }
  },

  unix: {
    init (listenUri, fns) {
      let server = transports.tcp.createServer(fns)
      let path = listenUri.pathname
      if (path.startsWith('/./')) {
        path = path.substr(1)
      }
      server.listen(path)
      return (method) => getLocalFunction(fns, method)
    }
  }
}

module.exports = function startServer (listenUri, fns) {
  listenUri = url.parse(listenUri)
  let transport = listenUri.protocol.match(/jrpc\+(.+?):/)[1]
  return transports[transport].init(listenUri, fns)
}
