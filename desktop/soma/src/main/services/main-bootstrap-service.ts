import { electronApp, optimizer } from '@electron-toolkit/utils'
import { app, protocol } from 'electron'
import log from 'electron-log'
import { inject, injectable } from 'inversify'
import { TYPES } from '../tokens'
import type { AppSettingsService } from './app-settings-service'
import type { DaemonSupervisor } from './daemon-supervisor'
import type { DaemonSyncService } from './daemon-sync-service'
import type { DbService } from './db-service'
import { type DocumentsService, LOCAL_BLOB_AUTHORITY, LOCAL_BLOB_SCHEME } from './documents-service'
import type { MainIpcController } from './main-ipc-controller'

@injectable()
export class MainBootstrapService {
  private readonly logger = log.scope('main-bootstrap-service')
  private initialized = false
  private browserWindowCreatedRegistered = false

  constructor(
    @inject(TYPES.dbService) private readonly _dbService: DbService,
    @inject(TYPES.appSettingsService) private readonly appSettings: AppSettingsService,
    @inject(TYPES.documentsService) private readonly documents: DocumentsService,
    @inject(TYPES.daemonSyncService) private readonly daemonSync: DaemonSyncService,
    @inject(TYPES.daemonSupervisor) private readonly daemonSupervisor: DaemonSupervisor,
    @inject(TYPES.mainIpcController) private readonly ipcController: MainIpcController
  ) {}

  async init(): Promise<void> {
    if (this.initialized) return
    this.initialized = true

    electronApp.setAppUserModelId('com.electron')

    try {
      this._dbService.init()
      await this.appSettings.init()
      this.documents.init()
    } catch (error) {
      this.logger.error('Failed to initialize persistence', error)
    }

    // Ensure the daemon is reachable before the renderer starts calling it, but don't block UI startup.
    void this.daemonSupervisor
      .ensureConnected({ startupTimeoutMs: 5_000 })
      .catch((error) => {
        this.logger.warn('Continuing without daemon connectivity', error)
      })
    this.daemonSync.start()

    if (!this.browserWindowCreatedRegistered) {
      this.browserWindowCreatedRegistered = true
      app.on('browser-window-created', (_event, window) => {
        optimizer.watchWindowShortcuts(window)
      })
    }

    this.ipcController.register()
    this.registerBlobProtocol()
    this.startMaintenanceJobs()
  }

  private registerBlobProtocol(): void {
    protocol.handle(LOCAL_BLOB_SCHEME, async (request) => {
      try {
        const url = new URL(request.url)
        if (url.hostname !== LOCAL_BLOB_AUTHORITY) {
          return new Response('not found', { status: 404 })
        }
        const blobId = url.pathname.replace(/^\//, '')
        if (!blobId) return new Response('not found', { status: 404 })

        const blob = this.documents.readStagedBlob(blobId)
        if (!blob) return new Response('not found', { status: 404 })

        return new Response(Buffer.from(blob.bytes), {
          status: 200,
          headers: { 'content-type': blob.mime }
        })
      } catch {
        return new Response('not found', { status: 404 })
      }
    })
  }

  private startMaintenanceJobs(): void {
    // Once per hour, remove staged blobs older than 30 days.
    const ONE_HOUR_MS = 60 * 60 * 1000
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
    setInterval(() => {
      try {
        this.documents.cleanupStagedBlobs(THIRTY_DAYS_MS)
        this.documents.cleanupDaemonOutbox(THIRTY_DAYS_MS)
      } catch (error) {
        this.logger.warn('Failed to cleanup staged blobs', error)
      }
    }, ONE_HOUR_MS)
  }
}
