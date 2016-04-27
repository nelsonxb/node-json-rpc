'use strict'

const tcp = require('net')
const url = require('url')

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
    }

    handleData (data) {
      let response = JSON.stringify(data)
      if (response.id) {
        if (response.error) {
          this.calls[response.id].reject(response.error)
        } else {
          this.calls[response.id].resolve(response.result)
        }
      }
    },

    getFunction (method) {
      return () => {
        let params = Array.from(arguments)
        let id = generateId()
        return new Promise((resolve, reject) => {
          this.write(JSON.stringify({
            jsonrpc: "2.0",
            method, params, id
          }))
          this.calls[id] = { resolve, reject }
        })
      }
    }
  },

  unix: {
    init (uri) {
      let conn = tcp.createConnection({
        path: uri.pathname
      })
      return transports.tcp.setupConnection(conn)
    }
  }
}

module.exports = function connect (uri) {
  uri = url.parse(uri)
  let transport = uri.protocol.match(/rpc+(.+?):/)
  return transports[transport].init(uri)
}
