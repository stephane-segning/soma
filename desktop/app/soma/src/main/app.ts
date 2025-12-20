import { app, BrowserWindow, ipcMain } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import log from 'electron-log'
import { inject, injectable } from 'inversify'
import { fromEvent, merge, of, Subject, map, takeUntil, tap } from 'rxjs'
import { readLastRoute, writeLastRoute } from './route-store'
import { WindowManager } from './services/window-manager'

type AppLifecycleEvent = 'ready' | 'activate' | 'window-all-closed'

@injectable()
export class SomaElectronApp {
  private readonly destroy$ = new Subject<void>()
  private readonly logger = log.scope('SomaElectronApp')

  constructor(@inject(WindowManager) private readonly windowManager: WindowManager) {}

  start(): void {
    this.configureLogging()
    this.observeLifecycle()
  }

  private configureLogging(): void {
    log.initialize()
    log.transports.file.level = 'debug'
    log.transports.console.level = 'info'
    this.logger.info('Starting Soma main process')
  }

  private observeLifecycle(): void {
    const lifecycle$ = merge(
      app.isReady()
        ? of<AppLifecycleEvent>('ready')
        : fromEvent(app, 'ready').pipe(map(() => 'ready' as const)),
      fromEvent(app, 'activate').pipe(map(() => 'activate' as const)),
      fromEvent(app, 'window-all-closed').pipe(map(() => 'window-all-closed' as const))
    ).pipe(
      tap((event) => this.logger.debug(`App event: ${event}`)),
      takeUntil(this.destroy$)
    )

    lifecycle$.subscribe((event) => {
      switch (event) {
        case 'ready':
          this.handleReady()
          break
        case 'activate':
          this.handleActivate()
          break
        case 'window-all-closed':
          this.handleWindowAllClosed()
          break
      }
    })

    fromEvent(app, 'quit')
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.destroy$.next()
        this.destroy$.complete()
      })
  }

  private handleReady(): void {
    electronApp.setAppUserModelId('com.electron')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    this.registerIpcHandlers()

    const initialRoute = readLastRoute()
    this.logger.info('Creating main window', { initialRoute })
    this.windowManager.createMainWindow({ initialRoute })
  }

  private handleActivate(): void {
    if (BrowserWindow.getAllWindows().length === 0) {
      this.logger.info('Activating without windows, creating main window')
      this.windowManager.createMainWindow({ initialRoute: readLastRoute() })
    }
  }

  private handleWindowAllClosed(): void {
    if (process.platform !== 'darwin') {
      this.logger.info('Quitting after all windows closed')
      app.quit()
    }
  }

  private registerIpcHandlers(): void {
    ipcMain.on('ping', () => this.logger.silly('ping received'))

    ipcMain.handle('router:get-last-route', () => readLastRoute())

    ipcMain.on('router:set-last-route', async (_, route: string) => {
      await writeLastRoute(route)
      this.logger.debug(`Persisted last route: ${route}`)
    })
  }
}
