import {
  app, protocol, BrowserWindow, Menu, shell, ipcMain,
} from 'electron'
import * as http from 'http'
import * as https from 'https'
import fs from 'fs'
import path from 'path'
import {
  createProtocol,
} from 'vue-cli-plugin-electron-builder/lib'
import { autoUpdater } from 'electron-updater'
import * as Sentry from '@sentry/electron'
import App from './server/app'
import messages from './assets/locales-menu'
import initServer from './server'

Sentry.init({ dsn: 'https://6a6dacc57a6a4e27a88eb31596c152f8@sentry.io/1887150' })

const isDevelopment = process.env.NODE_ENV !== 'production'

function waitForUrl(url: string, timeoutMs = 30000, interval = 500): Promise<boolean> {
  return new Promise((resolve) => {
    let finished = false
    const parsed = new URL(url)
    const lib = parsed.protocol === 'https:' ? https : http
    const deadline = Date.now() + timeoutMs

    const check = () => {
      if (finished) return
      const options: any = {
        method: 'HEAD',
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + (parsed.search || ''),
        timeout: 2000,
      }
      const req = lib.request(options, (res: any) => {
        finished = true
        res.resume()
        resolve(true)
      })
      req.on('error', () => {
        if (Date.now() < deadline) {
          setTimeout(check, interval)
        } else {
          finished = true
          resolve(false)
        }
      })
      req.on('timeout', () => {
        req.abort()
        if (Date.now() < deadline) setTimeout(check, interval)
        else { finished = true; resolve(false) }
      })
      req.end()
    }

    check()
  })
}

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win: any
let menu: Menu
let httpServer: any
let previewWin: any = null

// Standard scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { secure: true, standard: true } }])
async function createWindow() {
  // Create the browser window.
  const winOption: any = {
    width: 1200,
    height: 800,
    minHeight: 642,
    minWidth: 1000,
    webPreferences: ((): any => {
      const pre: any = {}
      pre.webSecurity = false // FIXED: Not allowed to load local resource
      pre.nodeIntegration = true
      pre.contextIsolation = false // force false in dev to ensure renderer can access require
      pre.enableRemoteModule = true
      if (isDevelopment) {
        const devPreload = path.join(__dirname, 'preload-dev.js')
        if (fs.existsSync(devPreload)) {
          pre.preload = devPreload
        } else {
          console.warn('preload-dev.js not found, skipping preload setting: ', devPreload)
        }
      }
      return pre
    })(),
    // frame: false, // 去除默认窗口栏
    titleBarStyle: 'hiddenInset' as ('hidden' | 'default' | 'hiddenInset' | 'customButtonsOnHover' | undefined),
  }

  // Set icon for all platforms
  let iconPath: string
  if (process.platform === 'darwin') {
    iconPath = process.env.NODE_ENV === 'development' 
      ? path.join(__dirname, '../public/app-icons/JackNotes.icns')
      : path.join(process.resourcesPath, 'public/app-icons/JackNotes.icns')
  } else {
    // Use app-icons/jacknotes.ico
    iconPath = process.env.NODE_ENV === 'development'
      ? path.join(__dirname, '../public/app-icons/jacknotes.ico')
      : path.join(process.resourcesPath, 'public/app-icons/jacknotes.ico')
  }
  console.log('Icon path:', iconPath)
  console.log('Icon exists:', require('fs').existsSync(iconPath))
  winOption.icon = iconPath

  win = new BrowserWindow(winOption)
  win.setTitle('JackNotes')
  console.log('Electron window created:', win.id)

  if (process.env.WEBPACK_DEV_SERVER_URL) {
    // Load the url of the dev server if in development mode
    const devUrl = process.env.WEBPACK_DEV_SERVER_URL as string
    console.log('Loading dev URL:', devUrl)
    try {
      const ready = await waitForUrl(devUrl, 30000)
      if (!ready) console.warn(`Dev server not responding at ${devUrl} after timeout, attempting to load anyway.`)
    } catch (e) {
      console.warn('Error while waiting for dev server:', e)
    }
    win.loadURL(devUrl)
    console.log('URL loaded, opening dev tools')
    if (!process.env.IS_TEST) {
      win.webContents.openDevTools()
      console.log('Dev tools opened')
    }
    // Force show window after loading
    setTimeout(() => {
      console.log('Force showing window')
      win.show()
      win.focus()
      console.log('Window visible:', win.isVisible())
      console.log('Window bounds:', win.getBounds())
    }, 2000)
  } else {
    createProtocol('app')
    // Load the index.html when not in development
    win.loadURL('app://./index.html')
    autoUpdater.checkForUpdatesAndNotify()
  }

  win.on('ready-to-show', () => {
    console.log('Window ready to show')
    win.show()
    win.focus()
    console.log('Window shown and focused')
  })

  win.on('closed', () => {
    console.log('Window closed')
    win = null
  })

  const locale: string = app.getLocale() || 'zh-CN'
  const menuLabels = messages[locale] || messages['zh-CN']
  // menu
  const template: any = [
    {
      label: menuLabels.edit,
      submenu: [
        {
          label: menuLabels.save,
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            win.webContents.send('click-menu-save')
          },
        },
        { type: 'separator' },
        { role: 'undo', label: menuLabels.undo },
        { role: 'redo', label: menuLabels.redo },
        { type: 'separator' },
        { role: 'cut', label: menuLabels.cut },
        { role: 'copy', label: menuLabels.copy },
        { role: 'paste', label: menuLabels.paste },
        { role: 'delete', label: menuLabels.delete },
        { role: 'selectall', label: menuLabels.selectall },
        { role: 'toggledevtools', label: menuLabels.toggledevtools },
        { type: 'separator' },
        { role: 'close', label: menuLabels.close },
        { role: 'quit', label: menuLabels.quit },
      ],
    },
    {
      role: 'windowMenu',
    },
    {
      role: menuLabels.help,
      submenu: [
        {
          label: 'Learn More',
          click() { shell.openExternal('https://github.com/jacksnotes/JackNotes') },
        },
      ],
    },
  ]

  menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)

  const s = initServer()
  httpServer = s.server

  const setting = {
    mainWindow: win,
    app,
    baseDir: __dirname,
    previewServer: s.app,
  }

  // Init app
  const appInstance = new App(setting)
  console.log('Main process runing...', appInstance.appDir) // DELETE ME
}

// Open preview modal in a native BrowserWindow
ipcMain.on('app-preview-open', (event, url: string) => {
  try {
    if (!win) return
    // Reuse existing preview window if present
    if (previewWin && !previewWin.isDestroyed()) {
      try { previewWin.focus(); previewWin.loadURL(url) } catch (e) { /* ignore */ }
      return
    }

    const previewOpts: any = {
      width: 1000,
      height: 700,
      parent: win,
      modal: true,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
      },
    }
    
    // Set icon for preview window
    let previewIconPath: string
    if (process.platform === 'darwin') {
      previewIconPath = process.env.NODE_ENV === 'development' 
        ? path.join(__dirname, '../public/app-icons/JackNotes.icns')
        : path.join(process.resourcesPath, 'public/app-icons/JackNotes.icns')
    } else {
      previewIconPath = process.env.NODE_ENV === 'development'
        ? path.join(__dirname, '../public/app-icons/jacknotes.ico')
        : path.join(process.resourcesPath, 'public/app-icons/jacknotes.ico')
    }
    if (fs.existsSync(previewIconPath)) {
      previewOpts.icon = previewIconPath
    }
    
    previewWin = new BrowserWindow(previewOpts)
    previewWin.once('ready-to-show', () => { previewWin.show() })
    previewWin.on('closed', () => { previewWin = null })
    previewWin.loadURL(url)
  } catch (e) {
    console.warn('Failed to open preview window', e)
  }
})

ipcMain.on('app-preview-close', () => {
  if (previewWin && !previewWin.isDestroyed()) previewWin.close()
})

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  httpServer && httpServer.close()
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (win === null) {
    createWindow()
  }
})

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', async () => {
  // if (isDevelopment && !process.env.IS_TEST) {
  //   // Install Vue Devtools
  //   await installVueDevtools()
  // }
  await createWindow()
})

// Exit cleanly on request from parent process in development mode.
if (isDevelopment) {
  if (process.platform === 'win32') {
    process.on('message', (data) => {
      if (data === 'graceful-exit') {
        app.quit()
      }
    })
  } else {
    process.on('SIGTERM', () => {
      app.quit()
    })
  }
}

// ipcMain.on('min-window', () => {
//   if (win) {
//     win.minimize()
//   }
// })

// ipcMain.on('max-window', () => {
//   if (win) {
//     if (win.isMaximized()) {
//       win.unmaximize()
//     } else {
//       win.maximize()
//     }
//   }
// })

// ipcMain.on('close-window', () => {
//   if (win) {
//     win.close()
//   }
// })

/**
 * Auto Updater
 *
 * Uncomment the following code below and install `electron-updater` to
 * support auto updating. Code Signing with a valid certificate is required.
 * https://simulatedgreg.gitbooks.io/electron-vue/content/en/using-electron-builder.html#auto-updating
 */

/*
import { autoUpdater } from 'electron-updater'

autoUpdater.on('update-downloaded', () => {
  autoUpdater.quitAndInstall()
})

app.on('ready', () => {
  if (process.env.NODE_ENV === 'production') autoUpdater.checkForUpdates()
})
 */
