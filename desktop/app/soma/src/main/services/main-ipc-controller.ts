import { BrowserWindow, ipcMain } from 'electron'
import log from 'electron-log'
import { inject, injectable } from 'inversify'
import { TYPES } from '../tokens'
import { AppSettingsService } from './app-settings-service'
import { DbService } from './db-service'
import { readLastRoute, writeLastRoute } from '../route-store'

@injectable()
export class MainIpcController {
  private readonly logger = log.scope('main-ipc-controller')
  private registered = false

  constructor(
    @inject(TYPES.appSettingsService) private readonly appSettings: AppSettingsService,
    @inject(TYPES.dbService) private readonly db: DbService
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

    ipcMain.handle('search:query', async (_event, rawQuery: string) => {
      const query = typeof rawQuery === 'string' ? rawQuery.trim() : ''
      if (query.length < 2) return []

      const tableNames = this.db.all<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' LIMIT 50"
      )

      const results: Array<{ id: string; title: string; subtitle?: string }> = []

      for (const { name } of tableNames) {
        if (results.length >= 25) break
        const safeTable = `"${name.replaceAll('"', '""')}"`
        const columns = this.db.all<{ name: string; type: string }>(
          `PRAGMA table_info(${safeTable})`
        )

        for (const column of columns) {
          if (results.length >= 25) break
          const type = String(column.type ?? '').toUpperCase()
          const isText = type.includes('CHAR') || type.includes('CLOB') || type.includes('TEXT')
          if (!isText) continue

          const safeColumn = `"${String(column.name).replaceAll('"', '""')}"`
          const rows = this.db.all<{ rowid: number; value: string }>(
            `SELECT rowid as rowid, ${safeColumn} as value FROM ${safeTable} WHERE ${safeColumn} LIKE ? LIMIT 3`,
            [`%${query}%`]
          )

          for (const row of rows) {
            if (results.length >= 25) break
            const value = typeof row.value === 'string' ? row.value : String(row.value ?? '')
            const title = value.length > 120 ? `${value.slice(0, 117)}...` : value
            results.push({
              id: `${name}:${column.name}:${row.rowid}`,
              title,
              subtitle: `${name}.${column.name}`
            })
          }
        }
      }

      return results
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
