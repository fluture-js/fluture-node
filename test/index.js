import {EventEmitter} from 'events';
import * as fl from 'fluture';
import test from 'oletus';
import {Readable} from 'stream';
import {equivalence, equality as eq} from 'fluture/test/assertions.js';
import {withTestServer} from './server.js';

import * as fn from '../index.js';

const assertResolves = a => b => equivalence (a) (fl.resolve (b));
const assertRejects = a => b => equivalence (a) (fl.reject (b));

const noop = () => {};

const mockRequest = eventualBody => withTestServer (({url}) => (
  fn.sendRequest (fn.Request ({headers: {
    'Connection': 'close',
    'Transfer-Encoding': 'chunked',
  }}) (`${url}/echo`) (eventualBody))
));

const responseHeaders = {
  'connection': 'close',
  'content-type': 'text/plain',
  'date': 'now',
  'transfer-encoding': 'chunked',
};

const dudRequest = fn.Request ({}) ('https://example.com') (fn.emptyStream);

const mockResponse = ({code = 200, message = 'OK', headers = responseHeaders, request = dudRequest}) => body => fl.map (stream => {
  stream.headers = headers;
  stream.statusCode = code;
  stream.statusMessage = message;
  return fn.Response (request) (stream);
}) (fn.streamOf (body));

test ('once', () => {
  const ee1 = new EventEmitter ();

  const cancel = fl.value (noop) (fn.once ('test') (ee1));
  eq (ee1.listenerCount ('test')) (1);
  eq (ee1.listenerCount ('error')) (1);

  cancel ();
  eq (ee1.listenerCount ('test')) (0);
  eq (ee1.listenerCount ('error')) (0);

  const ee2 = new EventEmitter ();
  const ee3 = new EventEmitter ();

  setTimeout (() => {
    ee2.emit ('test', 42);
    ee3.emit ('error', 42);
  }, 10);

  return Promise.all ([
    assertResolves (fn.once ('test') (ee2)) (42),
    assertRejects (fn.once ('test') (ee3)) (42),
  ]);
});

test ('encode', () => Promise.all ([
  assertRejects (fn.encode ('lalalala') (Buffer.from ('hello')))
                (new Error ('Unknown encoding: lalalala')),
  assertResolves (fn.encode ('utf8') (Buffer.from ('hello'))) ('hello'),
  assertResolves (fn.encode ('hex') (Buffer.from ('hello'))) ('68656c6c6f'),
]));

test ('streamOf', () => {
  const eventualStream = fn.streamOf (Buffer.from ('hello'));
  return new Promise ((res, rej) => {
    fl.fork (e => rej (new Error ('The future rejected: ' + String (e))))
            (stream => {
              stream.on ('end', res);
              stream.on ('data', data => {
                try {
                  eq (data) (Buffer.from ('hello'));
                } catch (e) {
                  rej (e);
                }
              });
            })
            (eventualStream);
    setTimeout (rej, 20, new Error ('No data on the stream'));
  });
});

test ('emptyStream', () => new Promise ((res, rej) => {
  fl.fork (e => rej (new Error ('The Future rejected: ' + String (e))))
          (stream => {
            stream.on ('data', data => {
              rej (new Error ('The stream emitted data: ' + String (data)));
            });
            stream.on ('end', res);
          })
          (fn.emptyStream);
}));

test ('buffer', () => {
  const s1 = new Readable ({read: noop});
  const s2 = new Readable ({read: noop});

  const b1 = Buffer.from ('hello');
  const b2 = Buffer.from ('world');

  s1.push (b1);

  setTimeout (() => {
    s1.push (b2);
    s1.push (null);
    s2.emit ('error', 42);
  }, 10);

  return Promise.all ([
    assertResolves (fn.buffer (s1)) ([b1, b2]),
    assertRejects (fn.buffer (s2)) (42),
  ]);
});

test ('bufferString', () => Promise.all ([
  assertResolves (fl.chain (fn.bufferString ('utf8')) (fn.streamOf (Buffer.from ('hello'))))
                 ('hello'),
  assertResolves (fl.chain (fn.bufferString ('hex')) (fn.streamOf (Buffer.from ('hello'))))
                 ('68656c6c6f'),
]));

test ('instant', () => (
  assertResolves (fn.instant ('noodles')) ('noodles')
));

test ('immediate', () => {
  fl.value (eq ('should not run')) (fn.immediate ('did run')) ();
  return assertResolves (fn.immediate ('results')) ('results');
});

test ('Request', () => {
  const options = {};
  const url = 'https://example.com';
  const body = fn.emptyStream;
  const request = fn.Request (options) (url) (body);
  eq (fn.Request.options (request)) (options);
  eq (fn.Request.url (request)) (url);
  eq (fn.Request.body (request)) (body);
});

test ('Response', () => {
  const request = fn.Request ({}) ('https://example.com') (fn.emptyStream);
  const message = fn.emptyStream;
  const response = fn.Response (request) (message);
  eq (fn.Response.request (response)) (request);
  eq (fn.Response.message (response)) (message);
});

test ('bufferResponse', () => Promise.all ([
  assertResolves (fl.chain (fn.bufferResponse ('utf8')) (mockRequest (fn.emptyStream)))
                 ('GET/'),
  assertResolves (fl.chain (fn.bufferResponse ('utf8')) (mockRequest (fn.streamOf (Buffer.from ('hello')))))
                 ('GET/hello'),
]));

const thenBuffer = fl.bichain (res => fl.swap (fn.bufferResponse ('utf8') (res)))
                              (fn.bufferResponse ('utf8'));

test ('sendRequest', () => Promise.all ([
  assertRejects (fn.sendRequest (fn.Request ({}) ('https://localhost') (fn.emptyStream)))
                (Object.assign (new Error ('connect ECONNREFUSED 127.0.0.1:443'), {
                  address: '127.0.0.1',
                  code: 'ECONNREFUSED',
                  errno: -111,
                  port: 443,
                  syscall: 'connect',
                })),
  assertRejects (fn.sendRequest (fn.Request ({}) ('ftp://localhost') (fn.emptyStream)))
                (new Error ("Unsupported protocol 'ftp:'")),
  assertResolves (thenBuffer (mockRequest (fn.emptyStream)))
                 ('GET/'),
  assertResolves (thenBuffer (mockRequest (fn.streamOf (Buffer.from ('hello')))))
                 ('GET/hello'),
]));

test ('request cancellation', () => new Promise ((res, rej) => {
  const cancel = fl.fork (rej)
                         (rej)
                         (fn.sendRequest (fn.Request ({}) ('https://localhost') (fn.emptyStream)));
  cancel ();
  setTimeout (res, 1000);
}));

test ('retrieve', () => Promise.all ([
  assertResolves (withTestServer (({url}) => thenBuffer (fn.retrieve (`${url}/echo`) ({}))))
                 ('GET/'),
]));

test ('send', () => Promise.all ([
  assertResolves (withTestServer (({url}) => thenBuffer (fn.send ('text/plain') ('POST') (`${url}/echo`) ({}) (Buffer.from ('hello')))))
                 ('POST/hello'),
]));

test ('sendJson', () => Promise.all ([
  assertResolves (withTestServer (({url}) => thenBuffer (fn.sendJson ('POST') (`${url}/echo`) ({}) ({message: 'hello'}))))
                 ('POST/{"message":"hello"}'),
]));

test ('sendForm', () => Promise.all ([
  assertResolves (withTestServer (({url}) => thenBuffer (fn.sendForm ('POST') (`${url}/echo`) ({}) ({message: 'hello'}))))
                 ('POST/message=hello'),
]));

test ('autoBufferResponse', () => Promise.all ([
  assertRejects (fl.chain (fn.autoBufferResponse) (mockResponse ({headers: {'content-type': 'text/plain; charset=lalalala'}}) (Buffer.from ('hello'))))
                (new Error ('Failed to buffer response: Unknown encoding: lalalala')),
  assertResolves (fl.chain (fn.autoBufferResponse) (mockRequest (fn.emptyStream)))
                 ('GET/'),
  assertResolves (fl.chain (fn.autoBufferResponse) (mockRequest (fn.streamOf (Buffer.from ('hello')))))
                 ('GET/hello'),
  assertResolves (fl.chain (fn.autoBufferResponse) (mockResponse ({}) (Buffer.from ('hello'))))
                 ('hello'),
  assertResolves (fl.chain (fn.autoBufferResponse) (mockResponse ({headers: {}}) (Buffer.from ('hello'))))
                 ('hello'),
  assertResolves (fl.chain (fn.autoBufferResponse) (mockResponse ({headers: {'content-type': 'text/plain; charset=hex'}}) (Buffer.from ('hello'))))
                 ('68656c6c6f'),
]));

const respond200 = mockResponse ({}) (Buffer.from ('hello'));

test ('matchStatus', () => Promise.all ([
  assertResolves (fl.map (fn.matchStatus (() => 'else') ({200: () => '200', 201: () => '201'})) (mockResponse ({code: 400}) (Buffer.from ('hello')))) ('else'),
  assertResolves (fl.map (fn.matchStatus (() => 'else') ({200: () => '200', 201: () => '201'})) (mockResponse ({code: 200}) (Buffer.from ('hello')))) ('200'),
  assertResolves (fl.map (fn.matchStatus (() => 'else') ({200: () => '200', 201: () => '201'})) (mockResponse ({code: 201}) (Buffer.from ('hello')))) ('201'),
]));

test ('acceptStatus', () => Promise.all ([
  assertResolves (fl.map (thenBuffer) (fl.map (fn.acceptStatus (200)) (respond200)))
                 (fl.resolve ('hello')),
  assertResolves (fl.map (thenBuffer) (fl.map (fn.acceptStatus (201)) (respond200)))
                 (fl.reject ('hello')),
]));

test ('responseToError', () => (
  assertRejects (fl.chain (fn.responseToError) (mockResponse ({code: 500, message: 'Internal Server Error', headers: responseHeaders})
                                                             (Buffer.from ('Dear user,\n\nEverything broke down.\nWe are sorry.'))))
                (new Error (
                  'Unexpected Internal Server Error (500) response. Response body:\n' +
                  '\n' +
                  '  Dear user,\n' +
                  '  \n' +
                  '  Everything broke down.\n' +
                  '  We are sorry.'
                ))
));
