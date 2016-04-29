'use strict'

const tcp = require('net')
const url = require('url')

const uuid = require('uuid')

// Used to create a request ID, that must be unique until the response
// is recieved. A UUID might be overkill - there might be a better way
// of doing this (which may or may not have a counterpart `retireId()`).
const generateId = () => uuid.v4({ rng: uuid.nodeRNG })

// Each transport currently implements the API itself.
// This could be made more generic (kind of like how 'export.js' does it).
// It could probably be made much tidier by using classes, but I'm trying
// out an "avoid creating prototypes" approach and seeing where it leads.
let transports = {
  // Implements the TCP transport. Written so that the UNIX transport can
  // easily re-use this code (since it's essentially the same, aside from
  // the connection parameters).
  tcp: {
    // Creates the connection, and calls the separate setup function.
    init (uri) {
      let conn = tcp.createConnection({
        host: uri.hostname, port: uri.port
      })
      return transports.tcp.setupConnection(conn)
    },

    // Actually set up the connection.
    setupConnection (conn) {
      conn.setEncoding('utf8')
      conn.on('data', transports.tcp.handleData.bind(conn))
      conn.calls = {}
      return transports.tcp.getFunction.bind(conn)
    },

    // Process incoming data (a response), and resolve or reject the
    // associated local Promise.
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

    // Produce a callable that returns a Promise to the result of a given
    // RPC call.
    getFunction (method) {
      let conn = this
      // The callable packs all arguments as the request params,
      // and returns a Promise to the result.
      // The Promise is actually resolved or rejected by handleData.
      return function () {
        // Generate the request params and id
        let params = Array.from(arguments)
        let id = generateId()
        // Promise resolves to response.result, or rejects with response.error.
        return new Promise((resolve, reject) => {
          // Perform the request
          let request = { jsonrpc: "2.0", method, params, id }
          conn.write(JSON.stringify(request))
          // handleData needs the resolve/reject functions
          // to complete the Promise
          conn.calls[id] = { resolve, reject }
        })
      }
    }
  },

  // Implements the UNIX transport. Since Node actually treats TCP and
  // UNIX sockets nearly identically, we can just hook into the TCP
  // transport implementation.
  unix: {
    // Creates the connection, and calls TCP's setup function
    init (uri) {
      let path = uri.pathname
      // I needed a way to do relative paths, so this was my hack.
      // URIs like "jrpc+unix:/./rpc.sock" are relative to the cwd.
      if (path.startsWith('/./')) {
        path = path.substr(1)
      }
      let conn = tcp.createConnection({ path })
      // Let the TCP implementation do the rest.
      return transports.tcp.setupConnection(conn)
    }
  }
}

// The module itself is a function that selects the
// relevant transport and initializes it.
module.exports = function connect (uri) {
  uri = url.parse(uri)
  let transport = uri.protocol.match(/jrpc\+(.+?):/)[1]
  return transports[transport].init(uri)
}
