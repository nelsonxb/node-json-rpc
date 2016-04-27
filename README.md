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
let api = require('rpc/export')({
    'add': add
    'add.promised': promisedAdd
})
api('add')(1, 2).then(r => assert.equal(r, 3))

// Client
let api = require('rpc')('jrpc+tcp:localhost')

api('add.promised')(1, 2).then(r => assert.equal(r, 3))
```


## Installing

Right now, I'm not planning on publishing to NPM. Instead, install like so:

    npm install NelsonCrosby/node-json-rpc

The latest version is always on master (which is what you'll get by default).
You can specify a specific version like so:

    npm install NelsonCrosby/node-json-rpc#v1.0.0

Assuming, of course, that v1.0.0 is a version.


## Transport details

The scheme is important in a URI, as it indicates the transport. TCP URIs
use `jrpc+tcp:`, UNIX sockets use `jrpc+unix`.


### TCP and UNIX sockets

Apart from the URI, TCP and UNIX transports are identical. From here on, when
I say that the TCP transport behaves a certain way, unless otherwise stated,
UNIX also behaves this way.

In the TCP transport, connections are persistent. They terminate once Node
exits. They can also be manually terminated by `api.transport.end()`.

Each JSON payload (a request or response) is written all-at-once, so each
payload is flushed individually. Also, each palyoad is terminated by `LF`
(this is not enforced, and is there for no particular reason other than
"it's nicer when using netcat").
