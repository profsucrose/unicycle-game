const HtmlWebpackPlugin = require('html-webpack-plugin')
const path = require('path')

module.exports = {
    entry: './src/client/client.ts',
    mode: 'development',
    devtool: 'inline-source-map',
    devServer: {
        static: path.join(__dirname, '../../dist/client')
    },
    module: {
        rules: [
            {
                test: /\.css$/i,
                use: ['style-loader', 'css-loader']
            },
            {
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
            {
                test: /\.(png|jpe?g|gif)$/i,
                type: 'asset/resource'
            },
        ],
    },
    resolve: {
        extensions: ['.ts', '.js']
    },
    output: {
        filename: '[name].bundle.js',
        path: path.resolve(__dirname, '..', '..', 'dist', 'client'),
        clean: true
    },
    plugins: [new HtmlWebpackPlugin({
        'title': 'Demo',
        'meta': {
            'viewport': 'width=device-width, initial-scale=1, shrink-to-fit=no',
        },

    })],
    optimization: {
        runtimeChunk: 'single'
    }
}