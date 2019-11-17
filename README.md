# Fluture Node

Common Node API's wrapped to return [Fluture][] Futures.

## API

#### <a name="once" href="https://github.com/fluture-js/fluture-node/blob/v2.0.0/index.js#L9">`once :: String -⁠> EventEmitter -⁠> Future Error a`</a>

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

#### <a name="buffer" href="https://github.com/fluture-js/fluture-node/blob/v2.0.0/index.js#L41">`buffer :: ReadableStream a -⁠> Future Error (Array a)`</a>

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

#### <a name="instant" href="https://github.com/fluture-js/fluture-node/blob/v2.0.0/index.js#L80">`instant :: b -⁠> Future a b`</a>

Resolves a Future with the given value in the next tick,
using [`process.nextTick`][]. The scheduled job cannot be
cancelled and will run before any other jobs, effectively
blocking the event loop until it's completed.

```js
> instant ('noodles')
Future.of ('noodles')
```

#### <a name="immediate" href="https://github.com/fluture-js/fluture-node/blob/v2.0.0/index.js#L96">`immediate :: b -⁠> Future a b`</a>

Resolves a Future with the given value in the next tick,
using [`setImmediate`][]. This job will run as soon as all
other jobs are completed. When the Future is cancelled, the
job is unscheduled.

```js
> immediate ('results')
Future.of ('results')
```

[Fluture]: https://github.com/fluture-js/Fluture
[`process.nextTick`]: https://nodejs.org/api/process.html#process_process_nexttick_callback_args
[`setImmediate`]: https://nodejs.org/api/timers.html#timers_setimmediate_callback_args
