'use strict'

const TCP_DEFAULT_PORT = 55772

const tcp = require('net')
const url = require('url')

const core = require('./core')

// Calls methods over TCP
// Note that the URI _requires_ a protocol,
// since url.parse() breaks otherwise.
class TCPCaller extends core.Caller {
  constructor (arg) {
    super()
    // Set up the connection
    this._conn = this._openConnection(arg)
    this._conn.setEncoding('utf8')
    this._conn.on('data', (data) => {
      data.trim().split('\n').forEach(line => {
        let pl = JSON.parse(line.trim())
        // Handle response
        if (!this._handleResponse(pl)) {
          console.error(pl)
        }
      })
    })
  }

  // Overridable method to create a connection.
  // Exists as its own separate method to make
  // USockCaller trivial to implement.
  _openConnection (uri) {
    uri = url.parse(uri)
    uri.port = uri.port || TCP_DEFAULT_PORT
    return tcp.connect(uri.port, uri.hostname)
  }

  // The required function by Caller to
  // actually perform the request.
  // Must take a request object, and
  // return a promise to the response.
  _makeRequest (request) {
    let data = JSON.stringify(request)
    // Send the data
    this._conn.write(data + '\n')
    // Get ID-linked promise
    return this._createResponsePromise(request.id)
  }
}

// Calls methods over Unix sockets
// Since Node treats Unix sockets extremely
// similarly to TCP connections, it just
// mostly just re-uses functionality from TCPCaller
class USockCaller extends TCPCaller {
  _openConnection (path) {
    return tcp.connect(path)
  }
}

// Listens for requests over TCP
class TCPRunner extends core.Runner {
  constructor (arg, methods) {
    super(methods || arg)
    arg = methods ? arg : null
    // Set up server
    this._srv = tcp.createServer((c) => this._onConnect(c))
    // Start server
    this._startServer(arg)
  }

  // Overridable method to start a server.
  // Exists as its own separate method to make
  // USockRunner trivial to implement.
  _startServer (port) {
    this._srv.listen(port || TCP_DEFAULT_PORT)
  }

  _onConnect (client) {
    // Set up connection
    client.setEncoding('utf8')
    client.on('data', (data) => {
      data.trim().split('\n').forEach(line =>
        this.handleRequest(line) // Delegate all the heavy lifting to Runner
          .then(response => response && // Ensure we actually want to respond
            client.write(JSON.stringify(response) + '\n'))) // Send response
    })
  }
}

// Listens for requests over Unix sockets
// Since Node treats Unix sockets extremely
// similarly to TCP connections, it just
// mostly just re-uses functionality from TCPCaller
class USockRunner extends TCPRunner {
  _startServer (path) {
    this._srv.listen(path)
  }
}

module.exports = core
Object.assign(module.exports, {
  TCPCaller,
  USockCaller,
  TCPRunner,
  USockRunner
})
