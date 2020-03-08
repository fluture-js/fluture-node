# Fluture Node

FP-style HTTP and streaming utils for Node based on [Fluture][].

```console
$ npm install fluture fluture-node
```

## API

### EventEmitter

#### <a name="once" href="https://github.com/fluture-js/fluture-node/blob/v2.1.0/index.js#L29">`once :: String -⁠> EventEmitter -⁠> Future Error a`</a>

Resolve a Future with the first event emitted over
the given event emitter under the given event name.

When the Future is cancelled, it removes any trace of
itself from the event emitter.

```js
> const emitter = new EventEmitter ();
> setTimeout (() => emitter.emit ('answer', 42), 100);
> once ('answer') (emitter);
Future.of (42);
```

### Buffer

#### <a name="encode" href="https://github.com/fluture-js/fluture-node/blob/v2.1.0/index.js#L63">`encode :: Charset -⁠> Buffer -⁠> Future Error String`</a>

Given an encoding and a [Buffer][], returns a Future of the result of
encoding said buffer using the given encoding. The Future will reject
with an Error if the encoding is unknown.

```js
> encode ('utf8') (Buffer.from ('Hello world!'));
'Hello world!'
```

### Stream

#### <a name="streamOf" href="https://github.com/fluture-js/fluture-node/blob/v2.1.0/index.js#L80">`streamOf :: Buffer -⁠> Future a (Readable Buffer)`</a>

Given a [Buffer][], returns a Future of a [Readable][] stream which will
emit the given Buffer before ending.

The stream is wrapped in a Future because creation of a stream causes
side-effects if it's not consumed in time, making it safer to pass it
around wrapped in a Future.

#### <a name="emptyStream" href="https://github.com/fluture-js/fluture-node/blob/v2.1.0/index.js#L96">`emptyStream :: Future a (Readable Buffer)`</a>

A [Readable][] stream which ends after emiting zero bytes. Can be useful
as an empty [`request`](#request) body, for example.

#### <a name="buffer" href="https://github.com/fluture-js/fluture-node/blob/v2.1.0/index.js#L102">`buffer :: Readable a -⁠> Future Error (Array a)`</a>

Buffer all data on a [Readable][] stream into a Future of an Array.

When the Future is cancelled, it removes any trace of
itself from the Stream.

```js
> const stream = new Readable ({read: () => {}});
> setTimeout (() => {
.   stream.push ('hello');
.   stream.push ('world');
.   stream.push (null);
. }, 100);
> buffer (stream);
Future.of ([Buffer.from ('hello'), Buffer.from ('world')]);
```

#### <a name="bufferString" href="https://github.com/fluture-js/fluture-node/blob/v2.1.0/index.js#L141">`bufferString :: Charset -⁠> Readable Buffer -⁠> Future Error String`</a>

A version of [`buffer`](#buffer) specialized in Strings.

Takes a charset and a [Readable][] stream of [Buffer][]s, and returns
a Future containing a String with the fully buffered and encoded result.

### Event Loop

#### <a name="instant" href="https://github.com/fluture-js/fluture-node/blob/v2.1.0/index.js#L153">`instant :: b -⁠> Future a b`</a>

Resolves a Future with the given value in the next tick,
using [`process.nextTick`][]. The scheduled job cannot be
cancelled and will run before any other jobs, effectively
blocking the event loop until it's completed.

```js
> instant ('noodles')
Future.of ('noodles')
```

#### <a name="immediate" href="https://github.com/fluture-js/fluture-node/blob/v2.1.0/index.js#L169">`immediate :: b -⁠> Future a b`</a>

Resolves a Future with the given value in the next tick,
using [`setImmediate`][]. This job will run as soon as all
other jobs are completed. When the Future is cancelled, the
job is unscheduled.

```js
> immediate ('results')
Future.of ('results')
```

### Http

The functions below are to be used in compositions such as the one shown
below, in order to cover a wide variety of HTTP-related use cases.

```js
import {map, chain, chainRej, encase, fork} from 'fluture/index.js';
import {retrieve,
        acceptStatus,
        autoBufferResponse,
        responseToError} from './index.js';

const rejectUnacceptable = res => (
  acceptStatus (200) (res)
  .pipe (chainRej (responseToError))
);

retrieve ('https://api.github.com/users/Avaq') ({'User-Agent': 'Avaq'})
.pipe (chain (rejectUnacceptable))
.pipe (chain (autoBufferResponse))
.pipe (chain (encase (JSON.parse)))
.pipe (map (avaq => avaq.name))
.pipe (fork (console.error) (console.log));
```

The example above will either:

1. log `"Aldwin Vlasblom"` to the terminal if nothing weird happens; or
2. log an error to the console if:
    * a network error occurs;
    * the response code is not 200; or
    * the JSON is malformed.

Note that we were in control of how an unexpected status was treated,
how an erroneous response would be formatted as an error message,
whether the response would be parsed as JSON, and how a failure of parsing
the JSON would have been treated.

The goal of the functions below us to give you as much control over HTTP
requests as possible, while still keeping boilerplate low by leveraging
function composition.

This contrasts with many of the popular HTTP client libraries out there,
which often make decisions for you, taking away control in an attempt to
provide a smoother usage experience.

#### <a name="request" href="https://github.com/fluture-js/fluture-node/blob/v2.1.0/index.js#L255">`request :: Object -⁠> Url -⁠> Readable Buffer -⁠> Future Error IncomingMessage`</a>

This is the "lowest level" function for making HTTP requests. It does not
handle buffering, encoding, content negotiation, or anything really.
For most use cases, you can use one of the more specialized functions:

* [`send`](#send): Make a generic HTTP request.
* [`retrieve`](#retrieve): Make a GET request.

Given an Object of [http options][], a String containing the request URL,
and a [Readable][] stream of [Buffer][]s to be sent as the request body,
returns a Future which makes an HTTP request and resolves with its
[IncomingMessage][]. If the Future is cancelled, the request is aborted.

```js
import {attempt, chain} from 'fluture/index.js';
import {createReadStream} from 'fs';

const sendBinary = request ({
  method: 'POST',
  headers: {'Transfer-Encoding': 'chunked'},
});

const eventualBody = attempt (() => createReadStream ('./data.bin'));

eventualBody.pipe (chain (sendBinary ('https://example.com')));
```

If you want to use this function to transfer a stream of data, don't forget
to set the Transfer-Encoding header to "chunked".

#### <a name="retrieve" href="https://github.com/fluture-js/fluture-node/blob/v2.1.0/index.js#L299">`retrieve :: Url -⁠> StrMap String -⁠> Future Error IncomingMessage`</a>

A version of [`request`](#request) specialized in the `GET` method.

Given a URL and a StrMap of request headers, returns a Future which
makes a GET requests to the given resource.

```js
retrieve ('https://api.github.com/users/Avaq') ({'User-Agent': 'Avaq'})
```

#### <a name="send" href="https://github.com/fluture-js/fluture-node/blob/v2.1.0/index.js#L313">`send :: Mimetype -⁠> Method -⁠> Url -⁠> StrMap String -⁠> Buffer -⁠> Future Error IncomingMessage`</a>

A version of [`request`](#request) for sending arbitrary data to a server.
There's also more specific versions for sending common types of data:

* [`sendJson`](#sendJson) sends JSON stringified data.
* [`sendForm`](#sendForm) sends form encoded data.

Given a MIME type, a request method, a URL, a StrMap of headers, and
finally a Buffer, returns a Future which will send the Buffer to the
server at the given URL using the given request method, telling it the
buffer contains data of the given MIME type.

This function will always send the Content-Type and Content-Length headers,
alongside the provided headers. Manually provoding either of these headers
override those generated by this function.

#### <a name="sendJson" href="https://github.com/fluture-js/fluture-node/blob/v2.1.0/index.js#L337">`sendJson :: Method -⁠> String -⁠> StrMap String -⁠> JsonValue -⁠> Future Error IncomingMessage`</a>

A version of [`send`](#send) specialized in sending JSON.

Given a request method, a URL, a StrMap of headers and a JavaScript plain
object, returns a Future which sends the object to the server at the
given URL after JSON-encoding it.

```js
sendJson ('PUT')
         ('https://example.com/users/bob')
         ({Authorization: 'Bearer asd123'})
         ({name: 'Bob', email: 'bob@example.com'});
```

#### <a name="sendForm" href="https://github.com/fluture-js/fluture-node/blob/v2.1.0/index.js#L356">`sendForm :: Method -⁠> String -⁠> StrMap String -⁠> JsonValue -⁠> Future Error IncomingMessage`</a>

A version of [`send`](#send) specialized in sending form data.

Given a request method, a URL, a StrMap of headers and a JavaScript plain
object, returns a Future which sends the object to the server at the
given URL after www-form-urlencoding it.

```js
sendForm ('POST')
         ('https://example.com/users/create')
         ({})
         ({name: 'Bob', email: 'bob@example.com'});
```

#### <a name="acceptStatus" href="https://github.com/fluture-js/fluture-node/blob/v2.1.0/index.js#L375">`acceptStatus :: Number -⁠> IncomingMessage -⁠> Future IncomingMessage IncomingMessage`</a>

This function "tags" an [IncomingMessage][] based on a given status code.
If the response status matches the given status code, the returned Future
will resolve. If it doesn't, the returned Future will reject.

The idea is that you can compose this function with one that returns an
IncomingMessage, and reject any responses that don't meet the expected
status code. In combination with [`responseToError`](#responseToError),
you can then flatten it back into the outer Future.

The usage example under the [Http](#http) section shows this.

#### <a name="bufferResponse" href="https://github.com/fluture-js/fluture-node/blob/v2.1.0/index.js#L391">`bufferResponse :: Charset -⁠> IncomingMessage -⁠> Future Error String`</a>

A version of [`buffer`](#buffer) specialized in [IncomingMessage][]s.

See also [`autoBufferResponse`](#autoBufferResponse).

Given a charset and an IncomingMessage, returns a Future with the buffered,
encoded, message body.

#### <a name="autoBufferResponse" href="https://github.com/fluture-js/fluture-node/blob/v2.1.0/index.js#L404">`autoBufferResponse :: IncomingMessage -⁠> Future Error String`</a>

Given an IncomingMessage, buffers and decodes the message body using the
charset provided in the message headers. Falls back to UTF-8 if the
charset was not provided.

Returns a Future with the buffered, encoded, message body.

#### <a name="responseToError" href="https://github.com/fluture-js/fluture-node/blob/v2.1.0/index.js#L418">`responseToError :: IncomingMessage -⁠> Future Error a`</a>

Given a response, returns a *rejected* Future of an instance of Error
with a message based on the content of the response.

[`process.nextTick`]: https://nodejs.org/api/process.html#process_process_nexttick_callback_args
[`setImmediate`]: https://nodejs.org/api/timers.html#timers_setimmediate_callback_args

[Buffer]: https://nodejs.org/api/buffer.html#buffer_class_buffer
[Fluture]: https://github.com/fluture-js/Fluture
[http options]: https://nodejs.org/api/http.html#http_http_request_url_options_callback
[IncomingMessage]: https://nodejs.org/api/http.html#http_class_http_incomingmessage
[Readable]: https://nodejs.org/api/stream.html#stream_class_stream_readable
