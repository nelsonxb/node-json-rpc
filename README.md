# node-json-rpc - an implementation of JSON-RPC 2.0

Implements version 2.0 of the JSON-RPC protocol.

Currently supports transport over TCP and UNIX domain sockets. Others may
come later (PRs welcome).

Note that bulk requests aren't yet supported, as the current transports allow
for sending multiple requests in rapid succession. This may change later.


## API

```js
// Server
function add (a, b) {
  return a + b
}

function promisedAdd (a, b) {
  return Promise.resolve(add(a, b))
}

// NOTE: this package name will change if/when I publish to NPM
const rpc = require('rpc')
let rpcRunner = new rpc.TCPRunner({
  'add': add,
  'add.promised': promisedAdd
})
let adder = rpc(rpcRunner.localCaller)
adder('add')(1, 2).then(v => assert.equal(v, 3))

// Client
const rpc = require('rpc')
let adder = rpc(new rpc.TCPCaller('jrpc:localhost'))
adder('add.promised')(5, 4).then(v => assert.equal(v, 9))
```


## Installing

Right now, I'm not planning on publishing to NPM. Instead, install like so:

    npm install NelsonCrosby/node-json-rpc

The latest version is always on master (which is what you'll get by default).
You can specify a specific version like so:

    npm install NelsonCrosby/node-json-rpc#v1.0.0

Assuming, of course, that v1.0.0 is a version.


## Transport details

### LocalCaller

This transport is passed a Runner, and simply invokes methods on that
runner directly. It overrides the ID generator to produce a relatively
useless ID (always `0`), since one is not needed in this case.


### TCP and UNIX sockets

Apart from the class name, TCP and UNIX transports are identical. From here
on, when I say that the TCP transport behaves a certain way, unless otherwise
stated, UNIX also behaves this way.

In the TCP transport, connections are persistent. They terminate once Node
exits. They can also be manually terminated by `api.transport.end()`.

Each JSON payload (a request or response) is delimited by line-feeds.
Additionally, it is expected that each flushed message contains full
JSON payloads.

Note that Node internally buffers data, so a message may contain
more than one payload. This package accounts for this. Note that
multiple payloads in a single message _is different_ than a JSON-RPC
Batch - while a batch requires every response to be sent back
all-at-once as a single payload (and is currently unsupported),
payloads in a single message are not necessarily related to each
other. For example, two requests may be sent in one payload, but
one response may be sent back much earlier than the other if it is
completed quicker. As another example, two requests may be made
in separate messages, but the responses may be sent back in one
message if they complete about the same time.
