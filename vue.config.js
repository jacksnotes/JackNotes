const path = require('path')

function resolve(dir) {
  return path.join(__dirname, dir)
}

module.exports = {
  lintOnSave: false,
  parallel: false, // Disable parallel processing to avoid neo-async issues
  css: {
    loaderOptions: {
      less: {
        import: [
          resolve('src/assets/styles/var.less'),
        ],
        modifyVars: {
          'btn-height-base': '30px',
          'input-height-base': '30px',
        },
        javascriptEnabled: true,
      },
    },
  },
  pluginOptions: {
    electronBuilder: {
      nodeIntegration: true,
      chainWebpackMainProcess: (config) => {
        config.externals({
          express: 'commonjs express',
        })
        // Ignore warnings for optional native dependencies
        // config.resolve.alias.set('cpu-features', path.resolve(__dirname, 'empty-cpu-features.js'))
        // config.resolve.alias.set('./crypto/build/Release/sshcrypto.node', path.resolve(__dirname, 'empty-sshcrypto.js'))
      },
      // mainProcessWatch: [
      //   'src/server/**/*',
      // ],
    },
  },
}
