import { BrowserWindow } from 'electron'
import log from 'electron-log'
import { inject, injectable } from 'inversify'
import { TYPES } from '../tokens'
import { readLastRoute } from '../route-store'
import { AppSettingsService } from './app-settings-service'
import { AppStateSyncService } from './app-state-sync-service'
import { IpcService } from './ipc-service'
import { WindowManager } from './window-manager'

@injectable()
export class MainWindowController {
  private readonly logger = log.scope('main-window-controller')
  private mainWindow: BrowserWindow | null = null

  constructor(
    @inject(TYPES.windowManager) private readonly windowManager: WindowManager,
    @inject(TYPES.ipcService) private readonly ipcService: IpcService,
    @inject(TYPES.appSettingsService) private readonly appSettings: AppSettingsService,
    @inject(TYPES.appStateSyncService) private readonly appStateSync: AppStateSyncService
  ) {}

  async createOrRestore(): Promise<void> {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.show()
      this.mainWindow.focus()
      return
    }

    let initialRoute = readLastRoute()
    let bounds: Electron.Rectangle | undefined

    try {
      const [savedBounds, savedRoute] = await Promise.all([
        this.appSettings.getWindowBounds(),
        this.appSettings.getLastPage()
      ])
      initialRoute = savedRoute ?? initialRoute
      bounds = this.sanitizeBounds(savedBounds)
    } catch (error) {
      this.logger.warn('Failed to load persisted UI state; using defaults', error)
    }

    this.logger.info('Creating main window', { initialRoute, bounds })
    const mainWindow = this.windowManager.createMainWindow({ initialRoute, bounds })
    this.mainWindow = mainWindow

    mainWindow.on('closed', () => {
      if (this.mainWindow === mainWindow) {
        this.mainWindow = null
      }
      this.appStateSync.stop()
    })

    this.ipcService.attachWindow(mainWindow)
    this.appStateSync.start(mainWindow)
  }

  private sanitizeBounds(
    bounds: Electron.Rectangle | null | undefined
  ): Electron.Rectangle | undefined {
    if (!bounds) return undefined
    const { x, y, width, height } = bounds
    if (
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      typeof width !== 'number' ||
      typeof height !== 'number'
    ) {
      return undefined
    }
    if (width <= 0 || height <= 0) return undefined
    return { x, y, width, height }
  }
}
