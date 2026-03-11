const path = require('path');
const GasPlugin = require('gas-webpack-plugin');

module.exports = {
  entry: './src/index.ts',
  output: {
    filename: 'Code.js',
    path: path.resolve(__dirname, 'dist'),
  },
  module: {
    rules: [{
      test: /\.ts$/,
      use: [{ loader: 'ts-loader', options: { configFile: 'tsconfig.webpack.json' } }],
      exclude: /node_modules/,
    }],
  },
  resolve: { extensions: ['.ts', '.js'] },
  plugins: [new GasPlugin()],
  optimization: {
    minimize: false,
    concatenateModules: true,
  },
  devtool: false,
};
