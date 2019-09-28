'use strict';

module.exports = {
  input: 'index.mjs',
  external: ['fluture'],
  output: {
    format: 'cjs',
    file: 'index.js',
    interop: false,
  },
};
