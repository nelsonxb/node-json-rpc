'use strict'

const TCP_DEFAULT_PORT = 55772

const tcp = require('net')
const url = require('url')
const uuid = require('uuid')

// JSON-RPC version
// Can be specified like { jsonrpc }.
const jsonrpc = "2.0"

// Abstract class that calls remote methods.
// Provides the base API for clients.
class Caller {
  constructor () {
    this._requests = {}
  }

  // Generates an ID that will be unique until
  // a corresponding response is recieved.
  // Currently just generates a UUID. This
  // might be overkill - there might be a better
  // way of doing it (which may involve a
  // counterpart `releaseId()`).
  generateId () {
    return uuid.v4()
  }

  // Creates a request object from the given
  // method, params and id. If an id isn't
  // provided, one is generated (using `.generateId()`).
  createRequest (method, params, id) {
    if (id == null)
      id = this.generateId()
    return { jsonrpc, id, method, params }
  }

  // Calls a remote method, and returns a Promise to the
  // result. As expected, this promise also rejects on
  // an error. Generates an ID if one isn't provided
  // (as per `.createRequest()`).
  callMethod (method, params, id) {
    let request
    if (params == null) {
      // If we only get one argument, assume
      // the request is already created.
      request = method
    } else {
      // Create a request object.
      request = this.createRequest(method, params, id)
    }

    // Send the request.
    let p = this._makeRequest(request)

    if (request.id != null) {
      // We will recieve the result.

      // Wait for the result, then extract
      // the result or the error.
      return p.then(response => response.error
          ? Promise.reject(response.error)
          : Promise.resolve(response.result))
    }
  }

  // Creates a promise that can be returned
  // from `_makeRequest()`. Along with
  // `_handleResponse()`, implements linking
  // responses to requests through IDs.
  _createResponsePromise (id) {
    if (id == null) {
      return null
    }

    return new Promise((resolve, reject) => {
      this._requests[id] = { resolve }
    })
  }

  // Resolves response promises. Should be
  // called by subclasses to indicate that a
  // response has been recieved. Returns
  // `true` if the response could be linked
  // to a request (so implementations can
  // build in some kind of handler). Along with
  // `_createResponsePromise()`, implements
  // linking responses to requests through IDs.
  _handleResponse (response) {
    if (response.id != null && this._requests[response.id]) {
      this._requests[response.id].resolve(response)
      delete this._requests[response.id]
      return true
    }
  }

  // Gets a function that maps to a remote method.
  // The mapping function simply calls `.callMethod()`
  // (so it returns the same as `.callMethod()`).
  getMethod (method) {
    // We need `arguments` (Node doesn't have `...` yet),
    // so we can't use an arrow function.
    return function () {
      let params = Array.from(arguments)
      return this.callMethod(method, params)
    }.bind(this) // Give the correct `this`, since we aren't using arrows.
  }
}

// Allows the Caller API to be used for
// a local Runner
class LocalCaller extends Caller {
  constructor (runner) {
    super()
    this._runner = runner
  }

  // Since we're staying local, we don't
  // actually need ids, so there's no
  // point spending the extra resources
  // to do so.
  generateId () { return 0 }

  // The required function by Caller to
  // actually perform the request.
  // Must take a request object, and
  // return a promise to the response.
  _makeRequest (request) {
    // The `.handleRequest()` function just
    // so happens to do everything we need.
    return this._runner.handleRequest(request)
  }
}

// Calls methods over TCP
// Note that the URI _requires_ a protocol,
// since url.parse() breaks otherwise.
class TCPCaller extends Caller {
  constructor (uri) {
    super()
    uri = url.parse(uri)
    uri.port = uri.port || TCP_DEFAULT_PORT
    // Set up the connection
    this._conn = tcp.connect(uri.port, uri.hostname)
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
class USockCaller extends TCPCaller {}

// Abstract class that runs local methods.
// Provides the base API for servers.
class Runner {
  // We need to store the methods we'll be calling
  constructor (methods) {
    this._methods = methods
    this.localCaller = new LocalCaller(this)
  }

  // Returns the result of JSON-parsing the data.
  // Throws an object appropriate for the "error"
  // response property if the JSON is invalid.
  verifyJSON (data) {
    try {
      return JSON.parse(data)
    } catch (e) {
      throw { code: -32700, message: 'Parse error: ' + e.message }
    }
  }

  // Returns the request.
  // Throws an object appropriate for the "error"
  // response property if the request is invalid.
  verifyRequest (request) {
    if (typeof request !== 'object' || request instanceof Array)
      throw { code: -32600, message: 'Invalid request: Not a JSON Object' }
    if (request.jsonrpc !== '2.0')
      throw { code: -32600, message: 'Invalid request: Incorrect jsonrpc version' }
    if (!request.method)
      throw { code: -32600, message: 'Invalid request: Missing method name' }
    if (!request.params)
      throw { code: -32600, message: 'Invalid request: Missing params' }

    return request
  }

  // Returns a Promise to the method result.
  // Rejects the Promise with an object appropriate
  // for the "error" response property if the method
  // can't be found, or if an error occured in the
  // method.
  callMethod (request) {
    return new Promise((resolve, reject) => {
      let method = this._methods[request.method]
      if (!method)
        return reject({ code: -32601, message: 'Method not found' })

      resolve(method)
    }).then(method => method.apply(null, request.params))
      .catch(error => Promise.reject({
        code: error.code || -1,
        message: typeof error === 'string' ? error : error.message
      }))
  }

  // Takes a request and returns a Promise to the
  // appropriate response. If the request is a
  // notification, the Promise resolves to `null`
  // and no response should be sent.
  handleRequest (request) {
    let p = Promise.resolve(request)
    if (typeof request === 'string') {
      p = p.then(r => this.verifyJSON(r))
    }
    return p.then(r => this.verifyRequest(r))
      .then(r => this.callMethod(r)
        .then(result => this.createResultResponse(result, r.id),
              error => this.createErrorResponse(error, r.id)))
  }

  // Creates a response from a result.
  createResultResponse (result, id) {
    if (id == null) {
      // They don't care about the response :(
      return null
    }
    return { jsonrpc, result, id }
  }

  // Creates a response from an error.
  createErrorResponse (error, id) {
    if (id == null && error.code != -32700) {
      // They don't care about the error.
      // Note that error code -32700 skips
      // this - although it's not explicitly
      // specified in the standard, there's no
      // good way to know the request id if
      // the request was malformed, so we'll
      // just try to send the error back anyway.
      return null
    }
    return { jsonrpc, error, id }
  }
}

// Listens for requests over TCP
class TCPRunner extends Runner {
  constructor (port, methods) {
    super(methods || port)
    port = methods ? port : TCP_DEFAULT_PORT

    // Set up server
    this._srv = tcp.createServer((c) => {
      // Set up connection
      c.setEncoding('utf8')
      c.on('data', (data) => {
        data.trim().split('\n').forEach(line =>
          this.handleRequest(line) // Delegate all the heavy lifting to Runner
            .then(response => response && // Ensure we actually want to respond
              c.write(JSON.stringify(response) + '\n'))) // OK, send response
      })
    })
    // Start server
    this._srv.listen(port)
  }
}

// Listens for requests over Unix sockets
// Since Node treats Unix sockets extremely
// similarly to TCP connections, it just
// mostly just re-uses functionality from TCPCaller
class USockRunner extends TCPRunner {}

module.exports = {
  Caller,
  LocalCaller,
  TCPCaller,
  USockCaller,
  Runner,
  TCPRunner,
  USockRunner
}
