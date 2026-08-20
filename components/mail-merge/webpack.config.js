const path = require('path');
const webpack = require('webpack');
const GasPlugin = require('gas-webpack-plugin');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

module.exports = {
  entry: './src/index.ts',
  output: {
    filename: 'Code.js',
    path: path.resolve(__dirname, 'dist'),
    iife: false,
  },
  module: {
    rules: [{
      test: /\.ts$/,
      use: [{ loader: 'ts-loader', options: { configFile: 'tsconfig.webpack.json' } }],
      exclude: /node_modules/,
    }],
  },
  resolve: { extensions: ['.ts', '.js'] },
  plugins: [
    new GasPlugin(),
    new webpack.DefinePlugin({
      __NGROK_TUNNEL_URL__: JSON.stringify(process.env.NGROK_TUNNEL_URL ?? ''),
    }),
  ],
  optimization: {
    minimize: false,
    concatenateModules: true,
  },
  devtool: false,
};
