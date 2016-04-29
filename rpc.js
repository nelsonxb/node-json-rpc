'use strict'

const uuid = require('uuid')

// JSON-RPC version
// Can be specified like { jsonrpc }.
const jsonrpc = "2.0"

// Abstract class that calls remote methods.
// Provides the base API for clients.
class Caller {
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
class TCPCaller extends Caller {}

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
      .then(r => this.callMethod(r))
      .then(result => this.createResultResponse(result, request.id),
            error => this.createErrorResponse(error, request.id))
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
class TCPRunner extends Runner {}

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
