import {deepStrictEqual} from 'assert';
import {EventEmitter} from 'events';
import fluture from 'fluture';
import test from 'oletus';
import {Readable} from 'stream';
import {isDeepStrictEqual} from 'util';
import {once, buffer, instant, immediate} from '../index.mjs';

const noop = () => {};

const eq = actual => expected => {
  deepStrictEqual (actual, expected);
};

const assertResolves = m => x => new Promise ((res, rej) => {
  m.fork (y => {
    rej (new Error ('Rejected with ' + y));
  }, y => {
    if (isDeepStrictEqual (y, x)) {
      res ();
    } else {
      rej (new Error ('Resolved with ' + JSON.stringify (y)));
    }
  });
});

const assertRejects = m => x => new Promise ((res, rej) => {
  m.fork (y => {
    if (isDeepStrictEqual (y, x)) {
      res ();
    } else {
      rej (new Error ('Rejected with ' + JSON.stringify (y)));
    }
  }, y => {
    rej (new Error ('Resolved with ' + y));
  });
});

test ('once', () => {
  eq (typeof once) ('function');

  const ee1 = new EventEmitter ();

  const cancel = fluture.value (noop) (once ('test') (ee1));
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
    assertResolves (once ('test') (ee2)) (42),
    assertRejects (once ('test') (ee3)) (42),
  ]);
});

test ('buffer', () => {
  eq (typeof buffer) ('function');

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
    assertResolves (buffer (s1)) ([b1, b2]),
    assertRejects (buffer (s2)) (42),
  ]);
});

test ('instant', () => (
  assertResolves (instant ('noodles')) ('noodles')
));

test ('immediate', () => {
  fluture.value (eq ('should not run')) (immediate ('did run')) ();
  return assertResolves (immediate ('results')) ('results');
});
