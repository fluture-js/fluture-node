//. # Fluture Node
//.
//. FP-style HTTP and streaming utils for Node based on [Fluture][].
//.
//. ```console
//. $ npm install fluture fluture-node
//. ```
//.
//. ## API
//.
//. Note: All examples assume that the following code is included:
//.
//. ```js
//. > import {value} from 'fluture/index.js'
//. > const show = m => { value (log ('result')) (m) }
//. ```

import http from 'http';
import https from 'https';
import qs from 'querystring';
import {Readable, pipeline} from 'stream';

import {
  Future,
  attempt,
  chain,
  encase,
  map,
  mapRej,
  reject,
  resolve,
} from 'fluture/index.js';

// When this file is running as a doctest, patch the Buffer prototype to make
// Doctest understand how to show and compare buffers.
if (__doctest) {
  Buffer.prototype['@@show'] = function() {
    return `Buffer.from (${this.toString ('utf8')}, 'utf8')`;
  };
  Buffer.prototype['fantasy-land/equals'] = function(buf) {
    return this.equals (buf);
  };
}

//. ### EventEmitter

//# once :: String -> EventEmitter -> Future Error a
//.
//. Resolve a Future with the first event emitted over
//. the given event emitter under the given event name.
//.
//. When the Future is cancelled, it removes any trace of
//. itself from the event emitter.
//.
//. ```js
//. > import {EventEmitter} from 'events'
//. > const emitter = new EventEmitter ()
//. > setTimeout (() => emitter.emit ('answer', 42), 100)
//. > show (once ('answer') (emitter))
//. undefined
//. [result]: 42
//. ```
export const once = event => emitter => Future ((rej, res) => {
  const removeListeners = () => {
    emitter.removeListener ('error', onError);
    emitter.removeListener (event, onEvent);
  };
  const onError = x => {
    removeListeners ();
    rej (x);
  };
  const onEvent = x => {
    removeListeners ();
    res (x);
  };
  emitter.once ('error', onError);
  emitter.once (event, onEvent);
  return removeListeners;
});

//. ### Buffer

//# encode :: Charset -> Buffer -> Future Error String
//.
//. Given an encoding and a [Buffer][], returns a Future of the result of
//. encoding said buffer using the given encoding. The Future will reject
//. with an Error if the encoding is unknown.
//.
//. ```js
//. > show (encode ('utf8') (Buffer.from ('Hello world!')))
//. [result]: 'Hello world!'
//. undefined
//. ```
export const encode = encoding => buffer => (
  mapRej (e => new Error (e.message))
         (attempt (() => buffer.toString (encoding)))
);

//. ### Stream

//# streamOf :: Buffer -> Future a (Readable Buffer)
//.
//. Given a [Buffer][], returns a Future of a [Readable][] stream which will
//. emit the given Buffer before ending.
//.
//. The stream is wrapped in a Future because creation of a stream causes
//. side-effects if it's not consumed in time, making it safer to pass it
//. around wrapped in a Future.
export const streamOf = encase (buf => new Readable ({
  highWaterMark: buf.byteLength,
  read: function() {
    if (this._pushed || this.push (buf)) { this.push (null); }
    this._pushed = true;
  },
}));

//# emptyStream :: Future a (Readable Buffer)
//.
//. A [Readable][] stream which ends after emiting zero bytes. Can be useful
//. as an empty [`request`](#request) body, for example.
export const emptyStream = streamOf (Buffer.alloc (0));

//# buffer :: Readable a -> Future Error (Array a)
//.
//. Buffer all data on a [Readable][] stream into a Future of an Array.
//.
//. When the Future is cancelled, it removes any trace of
//. itself from the Stream.
//.
//. ```js
//. > const stream = new Readable ({read: () => {}})
//. > setTimeout (() => {
//. .   stream.push ('hello')
//. .   stream.push ('world')
//. .   stream.push (null)
//. . }, 100)
//. > show (buffer (stream))
//. undefined
//. [result]: [Buffer.from ('hello'), Buffer.from ('world')]
//. ```
export const buffer = stream => Future ((rej, res) => {
  const chunks = [];
  const removeListeners = () => {
    stream.removeListener ('data', onData);
    stream.removeListener ('error', rej);
    stream.removeListener ('end', onEnd);
  };
  const onData = d => chunks.push (d);
  const onEnd = () => {
    removeListeners ();
    res (chunks);
  };
  const onError = e => {
    removeListeners ();
    rej (e);
  };
  stream.on ('data', onData);
  stream.once ('error', onError);
  stream.once ('end', onEnd);
  return removeListeners;
});

//# bufferString :: Charset -> Readable Buffer -> Future Error String
//.
//. A version of [`buffer`](#buffer) specialized in Strings.
//.
//. Takes a charset and a [Readable][] stream of [Buffer][]s, and returns
//. a Future containing a String with the fully buffered and encoded result.
export const bufferString = charset => stream => (
  chain (encode (charset)) (map (Buffer.concat) (buffer (stream)))
);

//. ### Event Loop

//# instant :: b -> Future a b
//.
//. Resolves a Future with the given value in the next tick,
//. using [`process.nextTick`][]. The scheduled job cannot be
//. cancelled and will run before any other jobs, effectively
//. blocking the event loop until it's completed.
//.
//. ```js
//. > show (instant ('noodles'))
//. undefined
//. [result]: 'noodles'
//. ```
export const instant = x => Future ((rej, res) => {
  process.nextTick (res, x);
  return () => {};
});

//# immediate :: b -> Future a b
//.
//. Resolves a Future with the given value in the next tick,
//. using [`setImmediate`][]. This job will run as soon as all
//. other jobs are completed. When the Future is cancelled, the
//. job is unscheduled.
//.
//. ```js
//. > show (immediate ('results'))
//. undefined
//. [result]: 'results'
//. ```
export const immediate = x => Future ((rej, res) => {
  const job = setImmediate (res, x);
  return () => { clearImmediate (job); };
});

//. ### Http
//.
//. The functions below are to be used in compositions such as the one shown
//. below, in order to cover a wide variety of HTTP-related use cases.
//.
//. ```js
//. import {map, chain, chainRej, encase, fork} from 'fluture/index.js'
//. import {retrieve,
//.         acceptStatus,
//.         autoBufferResponse,
//.         responseToError} from './index.js'
//.
//. const rejectUnacceptable = res => (
//.   acceptStatus (200) (res)
//.   .pipe (chainRej (responseToError))
//. )
//.
//. retrieve ('https://api.github.com/users/Avaq') ({'User-Agent': 'Avaq'})
//. .pipe (chain (rejectUnacceptable))
//. .pipe (chain (autoBufferResponse))
//. .pipe (chain (encase (JSON.parse)))
//. .pipe (map (avaq => avaq.name))
//. .pipe (fork (console.error) (console.log))
//. ```
//.
//. The example above will either:
//.
//. 1. log `"Aldwin Vlasblom"` to the terminal if nothing weird happens; or
//. 2. log an error to the console if:
//.     * a network error occurs;
//.     * the response code is not 200; or
//.     * the JSON is malformed.
//.
//. Note that we were in control of how an unexpected status was treated,
//. how an erroneous response would be formatted as an error message,
//. whether the response would be parsed as JSON, and how a failure of parsing
//. the JSON would have been treated.
//.
//. The goal of the functions below us to give you as much control over HTTP
//. requests as possible, while still keeping boilerplate low by leveraging
//. function composition.
//.
//. This contrasts with many of the popular HTTP client libraries out there,
//. which often make decisions for you, taking away control in an attempt to
//. provide a smoother usage experience.

//    defaultCharset :: String
const defaultCharset = 'utf8';

//    defaultContentType :: String
const defaultContentType = 'text/plain; charset=' + defaultCharset;

//    charsetRegex :: RegExp
const charsetRegex = /\bcharset=([^;\s]+)/;

//    mimeTypes :: StrMap Mimetype
const mimeTypes = {
  form: 'application/x-www-form-urlencoded; charset=utf8',
  json: 'application/json; charset=utf8',
};

//    getRequestModule :: String -> Future Error Module
const getRequestModule = protocol => {
  switch (protocol) {
  case 'https:': return resolve (https);
  case 'http:': return resolve (http);
  default: return reject (new Error (`Unsupported protocol '${protocol}'`));
  }
};

//# request :: Object -> Url -> Readable Buffer -> Future Error IncomingMessage
//.
//. This is the "lowest level" function for making HTTP requests. It does not
//. handle buffering, encoding, content negotiation, or anything really.
//. For most use cases, you can use one of the more specialized functions:
//.
//. * [`send`](#send): Make a generic HTTP request.
//. * [`retrieve`](#retrieve): Make a GET request.
//.
//. Given an Object of [http options][], a String containing the request URL,
//. and a [Readable][] stream of [Buffer][]s to be sent as the request body,
//. returns a Future which makes an HTTP request and resolves with its
//. [IncomingMessage][]. If the Future is cancelled, the request is aborted.
//.
//. ```js
//. import {attempt, chain} from 'fluture/index.js'
//. import {createReadStream} from 'fs'
//.
//. const sendBinary = request ({
//.   method: 'POST',
//.   headers: {'Transfer-Encoding': 'chunked'},
//. })
//.
//. const eventualBody = attempt (() => createReadStream ('./data.bin'))
//.
//. eventualBody.pipe (chain (sendBinary ('https://example.com')))
//. ```
//.
//. If you want to use this function to transfer a stream of data, don't forget
//. to set the Transfer-Encoding header to "chunked".
export const request = options => url => body => {
  const location = new URL (url);
  const makeRequest = lib => Future ((rej, res) => {
    const req = lib.request (location, options);
    req.once ('response', res);
    pipeline (body, req, e => e && rej (e));
    return () => {
      req.removeListener ('response', res);
      req.abort ();
    };
  });
  return chain (makeRequest) (getRequestModule (location.protocol));
};

//# retrieve :: Url -> StrMap String -> Future Error IncomingMessage
//.
//. A version of [`request`](#request) specialized in the `GET` method.
//.
//. Given a URL and a StrMap of request headers, returns a Future which
//. makes a GET requests to the given resource.
//.
//. ```js
//. retrieve ('https://api.github.com/users/Avaq') ({'User-Agent': 'Avaq'})
//. ```
export const retrieve = url => headers => (
  chain (request ({headers}) (url)) (emptyStream)
);

//# send :: Mimetype -> Method -> Url -> StrMap String -> Buffer -> Future Error IncomingMessage
//.
//. A version of [`request`](#request) for sending arbitrary data to a server.
//. There's also more specific versions for sending common types of data:
//.
//. * [`sendJson`](#sendJson) sends JSON stringified data.
//. * [`sendForm`](#sendForm) sends form encoded data.
//.
//. Given a MIME type, a request method, a URL, a StrMap of headers, and
//. finally a Buffer, returns a Future which will send the Buffer to the
//. server at the given URL using the given request method, telling it the
//. buffer contains data of the given MIME type.
//.
//. This function will always send the Content-Type and Content-Length headers,
//. alongside the provided headers. Manually provoding either of these headers
//. override those generated by this function.
export const send = mime => method => url => extraHeaders => buf => {
  const headers = Object.assign ({
    'Content-Type': mime,
    'Content-Length': buf.byteLength,
  }, extraHeaders);
  return chain (request ({method, headers}) (url)) (streamOf (buf));
};

//# sendJson :: Method -> String -> StrMap String -> JsonValue -> Future Error IncomingMessage
//.
//. A version of [`send`](#send) specialized in sending JSON.
//.
//. Given a request method, a URL, a StrMap of headers and a JavaScript plain
//. object, returns a Future which sends the object to the server at the
//. given URL after JSON-encoding it.
//.
//. ```js
//. sendJson ('PUT')
//.          ('https://example.com/users/bob')
//.          ({Authorization: 'Bearer asd123'})
//.          ({name: 'Bob', email: 'bob@example.com'})
//. ```
export const sendJson = method => url => headers => json => {
  const buf = Buffer.from (JSON.stringify (json));
  return send (mimeTypes.json) (method) (url) (headers) (buf);
};

//# sendForm :: Method -> String -> StrMap String -> JsonValue -> Future Error IncomingMessage
//.
//. A version of [`send`](#send) specialized in sending form data.
//.
//. Given a request method, a URL, a StrMap of headers and a JavaScript plain
//. object, returns a Future which sends the object to the server at the
//. given URL after www-form-urlencoding it.
//.
//. ```js
//. sendForm ('POST')
//.          ('https://example.com/users/create')
//.          ({})
//.          ({name: 'Bob', email: 'bob@example.com'})
//. ```
export const sendForm = method => url => headers => form => {
  const buf = Buffer.from (qs.stringify (form));
  return send (mimeTypes.form) (method) (url) (headers) (buf);
};

//# acceptStatus :: Number -> IncomingMessage -> Future IncomingMessage IncomingMessage
//.
//. This function "tags" an [IncomingMessage][] based on a given status code.
//. If the response status matches the given status code, the returned Future
//. will resolve. If it doesn't, the returned Future will reject.
//.
//. The idea is that you can compose this function with one that returns an
//. IncomingMessage, and reject any responses that don't meet the expected
//. status code. In combination with [`responseToError`](#responseToError),
//. you can then flatten it back into the outer Future.
//.
//. The usage example under the [Http](#http) section shows this.
export const acceptStatus = code => res => (
  code === res.statusCode ? resolve (res) : reject (res)
);

//# bufferResponse :: Charset -> IncomingMessage -> Future Error String
//.
//. A version of [`buffer`](#buffer) specialized in [IncomingMessage][]s.
//.
//. See also [`autoBufferResponse`](#autoBufferResponse).
//.
//. Given a charset and an IncomingMessage, returns a Future with the buffered,
//. encoded, message body.
export const bufferResponse = charset => message => (
  mapRej (e => new Error ('Failed to buffer response: ' + e.message))
         (bufferString (charset) (message))
);

//# autoBufferResponse :: IncomingMessage -> Future Error String
//.
//. Given an IncomingMessage, buffers and decodes the message body using the
//. charset provided in the message headers. Falls back to UTF-8 if the
//. charset was not provided.
//.
//. Returns a Future with the buffered, encoded, message body.
export const autoBufferResponse = message => {
  const contentType = message.headers['content-type'] || defaultContentType;
  const parsed = charsetRegex.exec (contentType);
  const charset = parsed == null ? defaultCharset : parsed[1];
  return bufferResponse (charset) (message);
};

//# responseToError :: IncomingMessage -> Future Error a
//.
//. Given a response, returns a *rejected* Future of an instance of Error
//. with a message based on the content of the response.
export const responseToError = message => (
  autoBufferResponse (message)
  .pipe (chain (body => reject (new Error (
    `Unexpected ${message.statusMessage} (${message.statusCode}) response. ` +
    `Response body:\n\n${body.split ('\n').map (x => `  ${x}`).join ('\n')}`
  ))))
);

//. [`process.nextTick`]: https://nodejs.org/api/process.html#process_process_nexttick_callback_args
//. [`setImmediate`]: https://nodejs.org/api/timers.html#timers_setimmediate_callback_args

//. [Buffer]: https://nodejs.org/api/buffer.html#buffer_class_buffer
//. [Fluture]: https://github.com/fluture-js/Fluture
//. [http options]: https://nodejs.org/api/http.html#http_http_request_url_options_callback
//. [IncomingMessage]: https://nodejs.org/api/http.html#http_class_http_incomingmessage
//. [Readable]: https://nodejs.org/api/stream.html#stream_class_stream_readable
