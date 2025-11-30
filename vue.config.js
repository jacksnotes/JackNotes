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
          less: 'commonjs less',
          ejs: 'commonjs ejs',
        })
        // Ignore warnings for optional native dependencies
        config.resolve.alias.set('cpu-features', path.resolve(__dirname, 'empty-cpu-features.js'))
        config.resolve.alias.set('./crypto/build/Release/sshcrypto.node', path.resolve(__dirname, 'empty-sshcrypto.js'))
      },
      builderOptions: {
        productName: 'JackNotes',
        win: {
          icon: './public/app-icons/JackNotes.ico',
          // target: [
          //   {
          //     target: 'nsis',
          //     arch: [
          //       'ia32',
          //       'x64',
          //     ],
          //   },
          // ],
        },
        mac: {
          icon: './public/app-icons/JackNotes.icns',
        },
        linux: {
          icon: './public/app-icons/JackNotes.png',
          target: [
            {
              target: 'AppImage',
            },
            {
              target: 'deb',
            },
            {
              target: 'snap',
            },
          ],
        },
        asar: false,
        nsis: {
          oneClick: false, // 是否一键安装
          allowElevation: true, // 允许请求提升。 如果为false，则用户必须使用提升的权限重新启动安装程序。
          allowToChangeInstallationDirectory: true, // 允许修改安装目录
          createDesktopShortcut: true, // 创建桌面图标
          createStartMenuShortcut: true, // 创建开始菜单图标
          shortcutName: 'JackNotes', // 图标名称
        },
        publish: ['github'],
      },
      // mainProcessWatch: [
      //   'src/server/**/*',
      // ],
    },
  },
}
