# Fluture Node

Common Node API's wrapped to return [Fluture][] Futures.

## API

#### <a name="once" href="https://github.com/fluture-js/fluture-node/blob/v1.0.0/index.mjs#L9">`once :: String -⁠> EventEmitter -⁠> Future Error a`</a>

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

#### <a name="buffer" href="https://github.com/fluture-js/fluture-node/blob/v1.0.0/index.mjs#L41">`buffer :: ReadableStream a -⁠> Future Error (Array a)`</a>

Buffer all data on a Stream into a Future of an Array.

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

[Fluture]: https://github.com/fluture-js/Fluture
