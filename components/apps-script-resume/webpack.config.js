const path = require('path');
const GasPlugin = require('gas-webpack-plugin');

module.exports = {
  mode: 'production',
  entry: './src/index.ts',
  output: {
    filename: 'Code.js',
    path: path.resolve(__dirname, 'dist'),
    iife: false,
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      '@config': path.resolve(__dirname, 'src/config'),
      '@utils': path.resolve(__dirname, 'src/utils'),
      '@data': path.resolve(__dirname, 'src/data'),
      '@ai': path.resolve(__dirname, 'src/ai'),
      '@document': path.resolve(__dirname, 'src/document'),
      '@business': path.resolve(__dirname, 'src/business'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@entry-points': path.resolve(__dirname, 'src/entry-points'),
    },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: false,
            compilerOptions: {
              noEmit: false,
            },
          },
        },
        exclude: /node_modules/,
      },
    ],
  },
  plugins: [new GasPlugin()],
  optimization: {
    minimize: false, // Google Apps Script doesn't work well with minification
    concatenateModules: true,
  },
  devtool: false, // No source maps in production (GAS doesn't support them)
};
