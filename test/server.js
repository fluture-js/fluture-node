import * as fl from 'fluture';
import http from 'http';
import {bufferString} from '../index.js';

export const echoHandler = req => res => body => fl.attempt (() => {
  res.writeHead (200, {'Content-Type': 'text/plain', 'Date': 'now'});
  res.end (Buffer.from (`${req.method}/${body}`));
});

export const redirectHandler = req => res => body => fl.attempt (() => {
  res.writeHead (301, {'Location': '/echo'});
  res.end ();
});

export const redirectPostHandler = req => res => body => fl.attempt (() => {
  res.writeHead (305, {'Location': '/echo'});
  res.end ();
});

export const selfRedirectHandler = req => res => body => fl.attempt (() => {
  res.writeHead (301, {'Location': '/self-redirect'});
  res.end ();
});

export const redirectLoopHandler = req => res => body => fl.attempt (() => {
  res.writeHead (301, {'Location': req.url.replace (/[ab]$/, x => x === 'a' ? 'b' : 'a')});
  res.end ();
});

export const routes = Object.assign (Object.create (null), {
  'GET /echo': echoHandler,
  'POST /echo': echoHandler,
  'GET /redirect': redirectHandler,
  'POST /redirect': redirectHandler,
  'POST /redirect-post': redirectPostHandler,
  'GET /self-redirect': selfRedirectHandler,
  'GET /redirect-loop-a': redirectLoopHandler,
  'GET /redirect-loop-b': redirectLoopHandler,
});

export const routeRequest = req => res => body => {
  const route = routes[`${req.method} ${req.url}`];
  if (typeof route === 'function') {
    return route (req) (res) (body);
  } else {
    return fl.attempt (() => {
      res.writeHead (404, {'Content-Type': 'text/plain'});
      res.end (Buffer.from ('Not Found'));
    });
  }
};

export const acquireTestServer = fl.Future ((rej, res) => {
  const server = http.createServer ((req, res) => {
    bufferString ('utf8') (req)
    .pipe (fl.chain (routeRequest (req) (res)))
    .pipe (fl.fork (e => {
      res.writeHead (500, {'Content-Type': 'text/plain'});
      res.end ('Bad request: ' + String (e));
    }) (() => {}));
  });
  server.listen (() => {
    const {port} = server.address ();
    res ({url: `http://localhost:${port}`, server});
  });
  return () => {
    server.close (() => {});
  };
});

export const disposeTestServer = ({server}) => fl.node (server.close.bind (server));

export const withTestServer = fl.hook (acquireTestServer) (disposeTestServer);
