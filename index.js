//. # Fluture Node
//.
//. FP-style HTTP and streaming utils for Node based on [Fluture][].
//.
//. Skip to the [Http section](#http) for the main code example.
//.
//. ## Usage
//.
//. ```console
//. $ npm install --save fluture fluture-node
//. ```
//.
//. On Node 12 and up, this module can be loaded directly with `import` or
//. `require`. On Node versions below 12, `require` or the [esm][]-loader can
//. be used.
//.
//. ## API

import http from 'http';
import https from 'https';
import qs from 'querystring';
import {Readable, pipeline} from 'stream';
import {isDeepStrictEqual} from 'util';
import {lookup} from 'dns';

import {
  Future,
  attempt,
  chain,
  encase,
  map,
  mapRej,
  pap,
  reject,
  resolve,
} from 'fluture/index.js';

const hasProp = k => o => Object.prototype.hasOwnProperty.call (o, k);

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
//. > const emitter = new EventEmitter ();
//. > setTimeout (() => emitter.emit ('answer', 42), 100);
//. > once ('answer') (emitter);
//. Future.of (42);
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
//. > encode ('utf8') (Buffer.from ('Hello world!'));
//. 'Hello world!'
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
//. as an empty [`Request`](#Request) body, for example.
export const emptyStream = streamOf (Buffer.alloc (0));

//# buffer :: Readable a -> Future Error (Array a)
//.
//. Buffer all data on a [Readable][] stream into a Future of an Array.
//.
//. When the Future is cancelled, it removes any trace of
//. itself from the Stream.
//.
//. ```js
//. > const stream = new Readable ({read: () => {}});
//. > setTimeout (() => {
//. .   stream.push ('hello');
//. .   stream.push ('world');
//. .   stream.push (null);
//. . }, 100);
//. > buffer (stream);
//. Future.of ([Buffer.from ('hello'), Buffer.from ('world')]);
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
//. > instant ('noodles')
//. Future.of ('noodles')
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
//. > immediate ('results')
//. Future.of ('results')
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
//. import {reject, map, chain, encase, fork} from 'fluture';
//. import {retrieve,
//.         matchStatus,
//.         followRedirects,
//.         autoBufferResponse,
//.         responseToError} from 'fluture-node';
//.
//. const json = res => (
//.   chain (encase (JSON.parse)) (autoBufferResponse (res))
//. );
//.
//. const notFound = res => (
//.   chain (({message}) => reject (new Error (message))) (json (res))
//. );
//.
//. retrieve ('https://api.github.com/users/Avaq') ({'User-Agent': 'Avaq'})
//. .pipe (chain (followRedirects (20)))
//. .pipe (chain (matchStatus (responseToError) ({200: json, 404: notFound})))
//. .pipe (map (avaq => avaq.name))
//. .pipe (fork (console.error) (console.log));
//. ```
//.
//. The example above will either:
//.
//. 1. log `"Aldwin Vlasblom"` to the terminal if nothing weird happens; or
//. 2. Report a 404 error using the message returned from the server; or
//. 3. log an error to the console if:
//.     * a network error occurs;
//.     * the response code is not what we expect; or
//.     * the JSON is malformed.
//.
//. Note that we were in control of the following:
//.
//. - How redirects are followed: We use [`followRedirects`](#followRedirects)
//.   with a maxmum of 20 redirects, but we could have used a different
//.   redirection function using [`followRedirectsWith`](#followRedirectsWith)
//.   with the [`aggressiveRedirectionPolicy`](#aggressiveRedirectionPolicy) or
//.   even a fully custom policy.
//.
//. - How an unexpected status was treated: We passed in a handler to
//.   [`matchStatus`](#matchStatus).
//.   We used [`responseToError`](#responseToError), conviently provided by
//.   this library, but we could have used a custom mechanism.
//.
//. - How responses with expected status codes are treated:
//.   The [`matchStatus`](#matchStatus) function lets us provide a handler
//.   based on the status code of the response. Each handler has full control
//.   over the response.
//.
//. - How the response body is buffered and decoded: Our `json` function uses
//.   [`autoBufferResponse`](#autoBufferResponse) to buffer and decode the
//.   response according to the mime type provided in the headers. However, we
//.   could have used lower level functions, such as
//.   [`bufferResponse`](#bufferResponse) or even just [`buffer`](#buffer).
//.
//. - How the response body is parsed: We used [`Fluture.encase`][] with
//.   [`JSON.parse`][] to parse JSON with a safe failure path. However, we
//.   could have used a more refined approach to parsing the JSON, for
//.   example by using [`S.parseJson`][].
//.
//. The goal is to give you as much control over HTTP requests and responses
//. as possible, while still keeping boilerplate low by leveraging function
//. composition.
//.
//. This contrasts with many of the popular HTTP client libraries out there,
//. which either make decisions for you, taking away control in an attempt to
//. provide a smoother usage experience, or which take complicated structures
//. of interacting options to attempt to cater to as many cases as possible.

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

//# Request :: Object -> Url -> Future Error (Readable Buffer) -> Request
//.
//. Constructs a value of type Request to be used as an argument for
//. functions such as [`sendRequest`](#sendRequest).
//.
//. Takes the following arguments:
//.
//. 1. An Object containing any [http options][] except: `auth`, `host`,
//.    `hostname`, `path`, `port`, and `protocol`; because they are part of
//.    the URL, and `signal`; because Fluture handles the cancellation.
//. 2. A String containing the request URL.
//. 3. A Future of a [Readable][] stream of [Buffer][]s to be used as the
//.    request body. Note that the Future must produce a brand new Stream
//.    every time it is forked, or if it can't, it is expected to reject
//.    with a value of type Error.
//.
//. See [`sendRequest`](#sendRequest) for a usage example.
export const Request = options => url => body => ({options, url, body});

//# Request.options :: Request -> Object
//.
//. Get the options out of a Request.
Request.options = ({options}) => options;

//# Request.url :: Request -> Url
//.
//. Get the url out of a Request.
Request.url = ({url}) => url;

//# Request.body :: Request -> Future Error (Readable Buffer)
//.
//. Get the body out of a Request.
Request.body = ({body}) => body;

//# Response :: Request -> IncomingMessage -> Response
//.
//. Constructs a value of type Response. These values are typically created
//. for you by functions such as [`sendRequest`](#sendRequest).
//. Takes the following arguments:
//.
//. 1. A [Request](#Request).
//. 2. An [IncomingMessage][] assumed to belong to the Request.
export const Response = request => message => ({request, message});

//# Response.request :: Response -> Request
//.
//. Get the request out of a Response.
Response.request = ({request}) => request;

//# Response.message :: Response -> IncomingMessage
//.
//. Get the message out of a Response.
Response.message = ({message}) => message;

// cleanRequestOptions :: Request -> Object
export const cleanRequestOptions = request => {
  const options = Request.options (request);
  return {
    agent: options.agent,
    createConnection: options.createConnection,
    defaultPort: options.defaultPort || (
      options.agent && options.agent.defaultPort
    ),
    family: options.family,
    headers: options.headers || {},
    insecureHTTPParser: options.insecureHTTPParser === true,
    localAddress: options.localAddress,
    lookup: options.lookup || lookup,
    maxHeaderSize: options.maxHeaderSize || 16384,
    method: (options.method || 'GET').toUpperCase (),
    setHost: options.setHost !== false,
    socketPath: options.socketPath,
    timeout: options.timeout,
  };
};

//# sendRequest :: Request -> Future Error Response
//.
//. This is the "lowest level" function for making HTTP requests. It does not
//. handle buffering, encoding, content negotiation, or anything really.
//. For most use cases, you can use one of the more specialized functions:
//.
//. * [`send`](#send): Make a generic HTTP request.
//. * [`retrieve`](#retrieve): Make a GET request.
//.
//. Given a [Request](#Request), returns a Future which makes an HTTP request
//. and resolves with the resulting [Response](#Response).
//. If the Future is cancelled, the request is aborted.
//.
//. ```js
//. import {attempt} from 'fluture';
//. import {createReadStream} from 'fs';
//.
//. const BinaryPostRequest = Request ({
//.   method: 'POST',
//.   headers: {'Transfer-Encoding': 'chunked'},
//. });
//.
//. const eventualBody = attempt (() => createReadStream ('./data.bin'));
//.
//. sendRequest (BinaryPostRequest ('https://example.com') (eventualBody));
//. ```
//.
//. If you want to use this function to transfer a stream of data, don't forget
//. to set the Transfer-Encoding header to "chunked".
export const sendRequest = request => {
  const location = new URL (Request.url (request));
  const makeRequest = lib => stream => Future ((rej, res) => {
    const req = lib.request (location, cleanRequestOptions (request));
    const onResponse = response => res (Response (request) (response));
    req.once ('response', onResponse);
    pipeline (stream, req, e => e && rej (e));
    return () => {
      req.removeListener ('response', onResponse);
      req.abort ();
    };
  });
  return (
    getRequestModule (location.protocol)
    .pipe (map (makeRequest))
    .pipe (pap (Request.body (request)))
    .pipe (chain (x => x))
  );
};

//# retrieve :: Url -> StrMap String -> Future Error Response
//.
//. A version of [`sendRequest`](#sendRequest) specialized in the `GET` method.
//.
//. Given a URL and a StrMap of request headers, returns a Future which
//. makes a GET requests to the given resource.
//.
//. ```js
//. retrieve ('https://api.github.com/users/Avaq') ({'User-Agent': 'Avaq'})
//. ```
export const retrieve = url => headers => (
  sendRequest (Request ({headers}) (url) (emptyStream))
);

//# send :: Mimetype -> Method -> Url -> StrMap String -> Buffer -> Future Error Response
//.
//. A version of [`sendRequest`](#sendRequest) for sending arbitrary data to
//. a server. There's also more specific versions for sending common types of
//. data:
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
  return sendRequest (Request ({method, headers}) (url) (streamOf (buf)));
};

//# sendJson :: Method -> String -> StrMap String -> JsonValue -> Future Error Response
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
//.          ({name: 'Bob', email: 'bob@example.com'});
//. ```
export const sendJson = method => url => headers => json => {
  const buf = Buffer.from (JSON.stringify (json));
  return send (mimeTypes.json) (method) (url) (headers) (buf);
};

//# sendForm :: Method -> String -> StrMap String -> JsonValue -> Future Error Response
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
//.          ({name: 'Bob', email: 'bob@example.com'});
//. ```
export const sendForm = method => url => headers => form => {
  const buf = Buffer.from (qs.stringify (form));
  return send (mimeTypes.form) (method) (url) (headers) (buf);
};

//# matchStatus :: (Response -> a) -> StrMap (Response -> a) -> Response -> a
//.
//. Transform a [`Response`](#Response) based on its status code.
//.
//. ```js
//. import {chain} from 'fluture';
//.
//. const processResponse = matchStatus (responseToError) ({
//.   200: autoBufferResponse,
//. });
//.
//. chain (processResponse) (retreive ('https://example.com'));
//. ```
//.
//. This is kind of like a `switch` statement on the status code of the
//. Response message. Or, if you will, a pattern match against the
//. Response type if you imagine it being tagged via the status code.
//.
//. The first argument is the "default" case, and the second argument is a
//. map of status codes to functions that should have the same type as the
//. first argument.
//.
//. The resulting function `Response -> a` has the same signature as the input
//. functions, meaning you can use `matchStatus` *again* to "extend" the
//. pattern by passing the old pattern as the "default" case for the new one:
//.
//. ```js
//. import {reject} from 'fluture';
//.
//. matchStatus (processResponse) ({
//.   404: () => reject (new Error ('Example not found!')),
//. });
//. ```
export const matchStatus = f => fs => res => {
  const {statusCode} = Response.message (res);
  return (hasProp (statusCode) (fs) ? fs[statusCode] : f) (res);
};

// mergeUrls :: Url -> Any -> String
const mergeUrls = base => input => (
  typeof input === 'string' ?
  new URL (input, base).href :
  base
);

//# redirectAnyRequest :: Response -> Request
//.
//. A redirection strategy that simply reissues the original Request to the
//. Location specified in the given Response.
//.
//. Used in the [`defaultRedirectionPolicy`](#defaultRedirectionPolicy) and
//. the [`aggressiveRedirectionPolicy`](#aggressiveRedirectionPolicy).
export const redirectAnyRequest = response => {
  const {headers: {location}} = Response.message (response);
  const original = Response.request (response);
  const oldUrl = Request.url (original);
  const newUrl = mergeUrls (oldUrl) (location);
  return (Request (Request.options (original))
                  (newUrl)
                  (Request.body (original)));
};

//# redirectIfGetMethod :: Response -> Request
//.
//. A redirection strategy that simply reissues the original Request to the
//. Location specified in the given Response, but only if the original request
//. was using the GET method.
//.
//. Used in [`followRedirectsStrict`](#followRedirectsStrict).
export const redirectIfGetMethod = response => {
  const {method} = cleanRequestOptions (Response.request (response));
  return (
    method === 'GET' ?
    redirectAnyRequest (response) :
    Response.request (response)
  );
};

//# redirectUsingGetMethod :: Response -> Request
//.
//. A redirection strategy that sends a new GET request based on the original
//. request to the Location specified in the given Response. If the response
//. does not contain a valid location, the request is not redirected.
//.
//. The original request method and body are discarded, but all the options
//. are preserved.
//.
//. Used in the [`defaultRedirectionPolicy`](#defaultRedirectionPolicy) and
//. the [`aggressiveRedirectionPolicy`](#aggressiveRedirectionPolicy).
export const redirectUsingGetMethod = response => {
  const original = Response.request (response);
  const options = Object.assign ({}, Request.options (original), {
    method: 'GET',
  });
  const request = Request (options) (Request.url (original)) (emptyStream);
  return redirectAnyRequest (Response (request) (Response.message (response)));
};

// See https://developer.mozilla.org/docs/Web/HTTP/Headers#Conditionals
const conditionHeaders = [
  'if-match',
  'if-modified-since',
  'if-none-match',
  'if-unmodified-since',
];

//# retryWithoutCondition :: Response -> Request
//.
//. A redirection strategy that removes any caching headers if present and
//. retries the request, or does nothing if no caching headers were present
//. on the original request.
//.
//. Used in the [`defaultRedirectionPolicy`](#defaultRedirectionPolicy).
export const retryWithoutCondition = response => {
  const original = Response.request (response);
  const options = Request.options (original);
  const {method} = cleanRequestOptions (original);
  const headers = Object.entries (options.headers || {});
  const filteredHeaders = headers.filter (([name]) => (
    !(conditionHeaders.includes (name.toLowerCase ()))
  ));
  const request = Request (Object.assign ({}, options, {
    headers: Object.fromEntries (filteredHeaders),
  })) (Request.url (original)) (Request.body (original));
  return method === 'GET' ? request : original;
};

//# defaultRedirectionPolicy :: Response -> Request
//.
//. Carefully follows redirects in strict accordance with
//. [RFC2616 Section 10.3][].
//.
//. Redirections with status codes 301, 302, and 307 are only followed if the
//. original request used the GET method, and redirects with status code 304
//. are left alone for a caching layer to deal with.
//.
//. This redirection policy is used by default in the
//. [`followRedirects`](#followRedirects) function. You can extend it, using
//. [`matchStatus`](#matchStatus) to create a custom redirection policy, as
//. shown in the example:
//.
//. See also [`aggressiveRedirectionPolicy`](#aggressiveRedirectionPolicy).
//.
//. ```js
//. const redirectToBestOption = () => {
//.   // Somehow figure out which URL to redirect to.
//. };
//.
//. const myRedirectionPolicy = matchStatus (defaultRedirectionPolicy) ({
//.   300: redirectToBestOption,
//.   301: redirectUsingGetMethod,
//. });
//.
//. retrieve ('https://example.com') ({})
//. .pipe (chain (followRedirectsWith (myRedirectionPolicy) (10)))
//. ```
export const defaultRedirectionPolicy = matchStatus (Response.request) ({
  301: redirectIfGetMethod,
  302: redirectIfGetMethod,
  303: redirectUsingGetMethod,
  305: redirectAnyRequest,
  307: redirectIfGetMethod,
});

//# aggressiveRedirectionPolicy :: Response -> Request
//.
//. Aggressively follows redirects in mild violation of
//. [RFC2616 Section 10.3][]. In particular, anywhere that a redirection
//. should be interrupted for user confirmation or caching, this policy
//. follows the redirection nonetheless.
//.
//. Redirections with status codes 301, 302, and 307 are always followed
//. without user intervention, and redirects with status code 304 are
//. retried without conditions if the original request had any conditional
//. headers.
//.
//. See also [`defaultRedirectionPolicy`](defaultRedirectionPolicy).
//.
//. ```js
//. retrieve ('https://example.com') ({})
//. .pipe (chain (followRedirectsWith (aggressiveRedirectionPolicy) (10)))
//. ```
export const aggressiveRedirectionPolicy = matchStatus (Response.request) ({
  301: redirectAnyRequest,
  302: redirectAnyRequest,
  303: redirectUsingGetMethod,
  304: retryWithoutCondition,
  305: redirectAnyRequest,
  307: redirectAnyRequest,
});

// requestsEquivalent :: Request -> Request -> Boolean
const requestsEquivalent = left => right => (
  isDeepStrictEqual (
    cleanRequestOptions (left),
    cleanRequestOptions (right)
  ) &&
  Request.url (left) === Request.url (right) &&
  Request.body (left) === Request.body (right)
);

//# followRedirectsWith :: (Response -> Request) -> Number -> Response -> Future Error Response
//.
//. Given a function that take a Response and produces a new Request, and a
//. "maximum" number, recursively keeps resolving new requests until a request
//. is encountered that was seen before, or the maximum number is reached.
//.
//. See [`followRedirects`](#followRedirects) for an out-of-the-box redirect-
//. follower. See [`aggressiveRedirectionPolicy`](#aggressiveRedirectionPolicy)
//. and [`defaultRedirectionPolicy`](defaultRedirectionPolicy) for
//. additional usage examples.
export const followRedirectsWith = strategy => _max => _response => {
  const seen = [];
  const followUp = max => response => {
    if (max < 1) {
      return resolve (response);
    }
    seen.push (Response.request (response));
    const nextRequest = strategy (response);
    for (let i = seen.length - 1; i >= 0; i -= 1) {
      if (requestsEquivalent (seen[i]) (nextRequest)) {
        return resolve (response);
      }
    }
    return (
      sendRequest (nextRequest)
      .pipe (mapRej (e => new Error ('After redirect: ' + e.message)))
      .pipe (chain (followUp (max - 1)))
    );
  };
  return followUp (_max) (_response);
};

//# followRedirects :: Number -> Response -> Future Error Response
//.
//. Given the maximum numbers of redirections, follows redirects according to
//. the [default redirection policy](#defaultRedirectionPolicy).
//.
//. See the [Http section](#http) for a usage example.
export const followRedirects = followRedirectsWith (defaultRedirectionPolicy);

//# acceptStatus :: Number -> Response -> Future Response Response
//.
//. This function "tags" a [Response](#Response) based on a given status code.
//. If the response status matches the given status code, the returned Future
//. will resolve. If it doesn't, the returned Future will reject.
//.
//. See also [`matchStatus`](#matchStatus), which will probably be more useful
//. in most cases.
//.
//. The idea is that you can compose this function with one that returns a
//. Response, and reject any responses that don't meet the expected status
//. code.
//.
//. In combination with [`responseToError`](#responseToError), you can then
//. flatten it back into the outer Future. The usage example under the
//. [Http](#http) section shows this.
export const acceptStatus = code => matchStatus (reject) ({[code]: resolve});

//# bufferMessage :: Charset -> IncomingMessage -> Future Error String
//.
//. A version of [`buffer`](#buffer) specialized in [IncomingMessage][]s.
//.
//. See also [`bufferResponse`](#bufferResponse) and
//. [`autoBufferMessage`](#autoBufferMessage).
//.
//. Given a charset and an IncomingMessage, returns a Future with the buffered,
//. encoded, message body.
export const bufferMessage = charset => message => (
  mapRej (e => new Error ('Failed to buffer response: ' + e.message))
         (bufferString (charset) (message))
);

//# bufferResponse :: Charset -> Response -> Future Error String
//.
//. A composition of [`Response.message`](#Response.message) and
//. [`bufferMessage`](#bufferMessage) for your convenience.
//.
//. See also [autoBufferResponse](#autoBufferResponse).
export const bufferResponse = charset => response => (
  bufferMessage (charset) (Response.message (response))
);

//# autoBufferMessage :: IncomingMessage -> Future Error String
//.
//. Given an IncomingMessage, buffers and decodes the message body using the
//. charset provided in the message headers. Falls back to UTF-8 if the
//. charset was not provided.
//.
//. Returns a Future with the buffered, encoded, message body.
//.
//. See also [bufferMessage](#bufferMessage).
export const autoBufferMessage = message => {
  const contentType = message.headers['content-type'] || defaultContentType;
  const parsed = charsetRegex.exec (contentType);
  const charset = parsed == null ? defaultCharset : parsed[1];
  return bufferMessage (charset) (message);
};

//# autoBufferResponse :: Response -> Future Error String
//.
//. A composition of [`Response.message`](#Response.message) and
//. [`autoBufferMessage`](#autoBufferMessage) for your convenience.
//.
//. See also [bufferResponse](#bufferResponse).
export const autoBufferResponse = response => (
  autoBufferMessage (Response.message (response))
);

//# responseToError :: Response -> Future Error a
//.
//. Given a [Response](#Response), returns a *rejected* Future of an instance
//. of Error with a message based on the content of the response.
export const responseToError = response => {
  const message = Response.message (response);
  return autoBufferMessage (message)
  .pipe (chain (body => reject (new Error (
    `Unexpected ${message.statusMessage} (${message.statusCode}) response. ` +
    `Response body:\n\n${body.split ('\n').map (x => `  ${x}`).join ('\n')}`
  ))));
};

//. [`process.nextTick`]: https://nodejs.org/api/process.html#process_process_nexttick_callback_args
//. [`setImmediate`]: https://nodejs.org/api/timers.html#timers_setimmediate_callback_args
//. [`S.parseJson`]: https://sanctuary.js.org/#parseJson
//. [`Fluture.encase`]: https://github.com/fluture-js/Fluture#encase
//. [`JSON.parse`]: https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse

//. [Buffer]: https://nodejs.org/api/buffer.html#buffer_class_buffer
//. [Fluture]: https://github.com/fluture-js/Fluture
//. [http options]: https://nodejs.org/api/http.html#http_http_request_url_options_callback
//. [IncomingMessage]: https://nodejs.org/api/http.html#http_class_http_incomingmessage
//. [Readable]: https://nodejs.org/api/stream.html#stream_class_stream_readable

//. [RFC2616 Section 10.3]: https://tools.ietf.org/html/rfc2616#section-10.3
//. [esm]: https://github.com/standard-things/esm
