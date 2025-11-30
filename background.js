const {
  app, BrowserWindow, Menu, shell,
} = require('electron')

let win

function createWindow() {
  const path = require('path')
  const winOption = {
    width: 1200,
    height: 800,
    minHeight: 642,
    minWidth: 1000,
    webPreferences: {
      webSecurity: false,
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, 'src/preload-dev.js'),
      enableRemoteModule: true,
    },
    titleBarStyle: 'hiddenInset',
  }

  win = new BrowserWindow(winOption)
  win.setTitle('Gridea (dev)')

  const url = process.env.WEBPACK_DEV_SERVER_URL || `file://${__dirname}/index.html`
  win.loadURL(url)
  win.on('closed', () => { win = null })

  const template = []
  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

app.on('ready', () => {
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => { if (win === null) createWindow() })

// Allow parent process to ask for graceful exit in dev
if (process.env.NODE_ENV !== 'production') {
  if (process.platform === 'win32') {
    process.on('message', (data) => { if (data === 'graceful-exit') app.quit() })
  } else {
    process.on('SIGTERM', () => { app.quit() })
  }
}
