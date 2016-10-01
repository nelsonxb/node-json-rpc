// JSON-RPC for Node
// =================
//
// _[GitHub](https://github.com/NelsonCrosby/node-json-rpc)_
//
// `node-json-rpc` is an RPC library for Node.js. It is designed to have a
// simple API, and be adaptable to multiple transports.
//
// This module implements [JSON-RPC 2.0][spec] (_note: it currently lacks
// support for batch requests_).
//
// See [the core docs](core.html) for the basic API, and the following docs
// for transport specifics.
//
// - [TCP (and Unix Socket)](tcp.html)
//
// [spec]: http://www.jsonrpc.org/specification
module.exports = require('./core')
require('./tcp')
