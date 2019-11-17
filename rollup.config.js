export default {
  input: 'index.js',
  external: ['fluture/index.js'],
  output: {
    format: 'cjs',
    file: 'index.cjs',
    interop: false,
    paths: {
      'fluture/index.js': 'fluture',
    },
  },
};
