import { BrowserWindow, ipcMain } from 'electron'
import log from 'electron-log'
import { inject, injectable } from 'inversify'
import { TYPES } from '../tokens'
import { AppSettingsService } from './app-settings-service'
import { readLastRoute, writeLastRoute } from '../route-store'

@injectable()
export class MainIpcController {
  private readonly logger = log.scope('main-ipc-controller')
  private registered = false

  constructor(
    @inject(TYPES.appSettingsService) private readonly appSettings: AppSettingsService
  ) {}

  register(): void {
    if (this.registered) return
    this.registered = true

    ipcMain.on('ping', () => this.logger.silly('ping received'))

    ipcMain.handle('router:get-last-route', () => readLastRoute())

    ipcMain.on('router:set-last-route', async (_event, route: string) => {
      await writeLastRoute(route)
      await this.appSettings.setLastPage(route)
      this.logger.debug(`Persisted last route: ${route}`)
    })

    ipcMain.handle('settings:get', async (_event, key: string) => {
      return this.appSettings.get(key)
    })

    ipcMain.on('window:minimize', (event) => {
      BrowserWindow.fromWebContents(event.sender)?.minimize()
    })

    ipcMain.on('window:toggle-maximize', (event) => {
      const window = BrowserWindow.fromWebContents(event.sender)
      if (!window) return
      if (window.isMaximized()) window.unmaximize()
      else window.maximize()
    })

    ipcMain.on('window:close', (event) => {
      BrowserWindow.fromWebContents(event.sender)?.close()
    })
  }
}
