import { app, BrowserWindow } from 'electron'
import log from 'electron-log'
import { inject, injectable } from 'inversify'
import { fromEvent, map, merge, of, Subject, takeUntil, tap } from 'rxjs'
import type { MainBootstrapService } from './services/main-bootstrap-service'
import type { MainWindowController } from './services/main-window-controller'
import { TYPES } from './tokens'

type AppLifecycleEvent = 'ready' | 'activate' | 'window-all-closed'

@injectable()
export class SomaElectronApp {
  private readonly destroy$ = new Subject<void>()
  private readonly logger = log.scope('soma-app')
  private signalsRegistered = false

  constructor(
    @inject(TYPES.mainBootstrapService) private readonly bootstrap: MainBootstrapService,
    @inject(TYPES.mainWindowController) private readonly windowController: MainWindowController
  ) {}

  start(): void {
    this.configureLogging()
    this.registerProcessSignals()
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
          void this.handleReady()
          break
        case 'activate':
          void this.handleActivate()
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

  private async handleReady(): Promise<void> {
    await this.bootstrap.init()
    await this.windowController.createOrRestore()
  }

  private async handleActivate(): Promise<void> {
    if (BrowserWindow.getAllWindows().length === 0) {
      this.logger.info('Activating without windows, creating main window')
      await this.bootstrap.init()
      await this.windowController.createOrRestore()
    }
  }

  private handleWindowAllClosed(): void {
    if (process.platform !== 'darwin') {
      this.logger.info('Quitting after all windows closed')
      app.quit()
    }
  }

  /**
   * Ensure we exit cleanly when the dev process is stopped (Ctrl+C).
   */
  private registerProcessSignals(): void {
    if (this.signalsRegistered) return
    this.signalsRegistered = true
    const quit = () => {
      this.logger.info('Received shutdown signal, quitting app')
      app.quit()
    }
    process.once('SIGINT', quit)
    process.once('SIGTERM', quit)
  }
}
