import pkg from './package.json';

const dependencyNames = Array.prototype.concat.call (
  Object.keys (pkg.dependencies),
  Object.keys (pkg.peerDependencies),
  ['fluture/index.js', 'http', 'https', 'querystring', 'stream', 'util', 'dns']
);

export default {
  input: 'index.js',
  external: dependencyNames,
  output: {
    format: 'cjs',
    file: 'dist/cjs.js',
    interop: false,
    exports: 'named',
    globals: {},
    paths: {
      'fluture/index.js': 'fluture',
    },
  },
};
