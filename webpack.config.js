const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');
require('dotenv').config();

const isDev = process.env.NODE_ENV === 'development';
const FRONTEND_PORT = parseInt(process.env.FRONTEND_PORT || '8080', 10);
const BACKEND_PORT = parseInt(process.env.BACKEND_PORT || process.env.PORT || '3001', 10);

// Web app configuration (formerly renderer config)
const webConfig = {
  mode: isDev ? 'development' : 'production',
  entry: './src/renderer/index.tsx',
  target: 'web',
  devtool: isDev ? 'source-map' : false,
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.(png|jpe?g|gif|svg)$/,
        type: 'asset/resource',
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.jsx'],
  },
  output: {
    filename: 'app.js',
    path: path.resolve(__dirname, 'dist/web'),
    clean: true,
    publicPath: '/',
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './public/index.html',
      filename: 'index.html',
      title: 'Discogs to Last.fm Scrobbler',
    }),
    new webpack.DefinePlugin({
      'process.env.REACT_APP_BACKEND_PORT': JSON.stringify(BACKEND_PORT),
    }),
  ],
  devServer: {
    port: FRONTEND_PORT,
    hot: true,
    static: {
      directory: path.join(__dirname, 'public'),
    },
    historyApiFallback: true,
    open: true,
  },
};

module.exports = webConfig;