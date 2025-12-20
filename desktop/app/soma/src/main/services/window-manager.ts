import { BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import icon from '../../../resources/icon.png?asset'

export class WindowManager {
  createMainWindow(options?: { initialRoute?: string }): BrowserWindow {
    const mainWindow = new BrowserWindow({
      width: 900,
      height: 670,
      show: false,
      autoHideMenuBar: true,
      ...(process.platform === 'linux' ? { icon } : {}),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })

    mainWindow.on('ready-to-show', () => {
      mainWindow.show()
    })

    mainWindow.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      const baseUrl = process.env['ELECTRON_RENDERER_URL']
      const initialRoute = options?.initialRoute
      const url = initialRoute ? `${baseUrl}#${initialRoute}` : baseUrl
      mainWindow.loadURL(url)
    } else {
      const initialRoute = options?.initialRoute
      mainWindow.loadFile(join(__dirname, '../renderer/index.html'), {
        hash: initialRoute ?? undefined
      })
    }

    return mainWindow
  }
}
