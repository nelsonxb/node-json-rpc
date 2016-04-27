'use strict'

const tcp = require('net')
const url = require('url')

const uuid = require('uuid')

const generateId = () => uuid.v4({ rng: uuid.nodeRNG })

let transports = {
  tcp: {
    init (uri) {
      let conn = tcp.createConnection({
        host: uri.hostname, port: uri.port
      })
      return transports.tcp.setupConnection(conn)
    },

    setupConnection (conn) {
      conn.setEncoding('utf8')
      conn.on('data', transports.tcp.handleData.bind(conn))
      conn.calls = {}
      return transports.tcp.getFunction.bind(conn)
    },

    handleData (data) {
      let response = JSON.parse(data)
      if (response.id) {
        if (response.error) {
          this.calls[response.id].reject(response.error)
        } else {
          this.calls[response.id].resolve(response.result)
        }
        delete this.calls[response.id]
      }
    },

    getFunction (method) {
      let conn = this
      return function () {
        let params = Array.from(arguments)
        let id = generateId()
        return new Promise((resolve, reject) => {
          let request = { jsonrpc: "2.0", method, params, id }
          conn.write(JSON.stringify(request))
          conn.calls[id] = { resolve, reject }
        })
      }
    }
  },

  unix: {
    init (uri) {
      let path = uri.pathname
      if (path.startsWith('/./')) {
        path = path.substr(1)
      }
      let conn = tcp.createConnection({ path })
      return transports.tcp.setupConnection(conn)
    }
  }
}

module.exports = function connect (uri) {
  uri = url.parse(uri)
  let transport = uri.protocol.match(/jrpc\+(.+?):/)[1]
  return transports[transport].init(uri)
}
