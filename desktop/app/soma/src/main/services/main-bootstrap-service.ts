import { app } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import log from 'electron-log'
import { inject, injectable } from 'inversify'
import { TYPES } from '../tokens'
import { AppSettingsService } from './app-settings-service'
import { DbService } from './db-service'
import { MainIpcController } from './main-ipc-controller'

@injectable()
export class MainBootstrapService {
  private readonly logger = log.scope('main-bootstrap-service')
  private initialized = false
  private browserWindowCreatedRegistered = false

  constructor(
    @inject(TYPES.dbService) private readonly dbService: DbService,
    @inject(TYPES.appSettingsService) private readonly appSettings: AppSettingsService,
    @inject(TYPES.mainIpcController) private readonly ipcController: MainIpcController
  ) {}

  async init(): Promise<void> {
    if (this.initialized) return
    this.initialized = true

    electronApp.setAppUserModelId('com.electron')

    try {
      this.dbService.init()
      await this.appSettings.init()
    } catch (error) {
      this.logger.error('Failed to initialize persistence', error)
    }

    if (!this.browserWindowCreatedRegistered) {
      this.browserWindowCreatedRegistered = true
      app.on('browser-window-created', (_event, window) => {
        optimizer.watchWindowShortcuts(window)
      })
    }

    this.ipcController.register()
  }
}

