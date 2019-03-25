//. # Fluture Node
//.
//. Common Node API's wrapped to return [Fluture][] Futures.
//.
//. ## API

import Future from 'fluture';

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

//# buffer :: ReadableStream a -> Future Error (Array a)
//.
//. Buffer all data on a Stream into a Future of an Array.
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

//. [Fluture]: https://github.com/fluture-js/Fluture
