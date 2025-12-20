import log from 'electron-log'
import { inject, injectable } from 'inversify'
import { DbService } from './db-service'
import { TYPES } from '../tokens'

type WindowBounds = { x: number; y: number; width: number; height: number }

@injectable()
export class AppSettingsService {
  private readonly logger = log.scope('AppSettingsService')
  private initialized = false

  constructor(@inject(TYPES.dbService) private readonly db: DbService) {}

  async init(): Promise<void> {
    if (this.initialized) return
    this.db.run(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS kv_store (
        namespace TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY(namespace, key)
      )
    `)
    this.initialized = true
    this.logger.info('App settings tables ready')
  }

  async setWindowBounds(bounds: WindowBounds): Promise<void> {
    await this.set('window:last-bounds', bounds)
  }

  async getWindowBounds(): Promise<WindowBounds | null> {
    return this.get<WindowBounds>('window:last-bounds')
  }

  async setLastPage(route: string): Promise<void> {
    await this.set('router:last-route', route)
  }

  async getLastPage(): Promise<string | null> {
    return this.get<string>('router:last-route')
  }

  async set(namespace: string, value: unknown): Promise<void> {
    try {
      await this.ensureReady()
      const serialized = JSON.stringify(value)
      this.db.run(
        `
          INSERT INTO app_settings (key, value)
          VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value=excluded.value
        `,
        [namespace, serialized]
      )
    } catch (error) {
      this.logger.warn(`Failed to set setting ${namespace}`, error)
    }
  }

  async get<T>(namespace: string): Promise<T | null> {
    try {
      await this.ensureReady()
      const row = this.db.get<{ value: string }>(
        `SELECT value FROM app_settings WHERE key = ?`,
        [namespace]
      )
      if (!row) return null
      try {
        return JSON.parse(row.value) as T
      } catch (error) {
        this.logger.warn(`Failed to parse setting ${namespace}`, error)
        return null
      }
    } catch (error) {
      this.logger.warn(`Failed to read setting ${namespace}`, error)
      return null
    }
  }

  async kvSet(namespace: string, key: string, value: unknown): Promise<void> {
    try {
      await this.ensureReady()
      const serialized = JSON.stringify(value)
      this.db.run(
        `
          INSERT INTO kv_store (namespace, key, value)
          VALUES (?, ?, ?)
          ON CONFLICT(namespace, key) DO UPDATE SET value=excluded.value
        `,
        [namespace, key, serialized]
      )
    } catch (error) {
      this.logger.warn(`Failed to persist kv ${namespace}/${key}`, error)
    }
  }

  async kvGet<T>(namespace: string, key: string): Promise<T | null> {
    try {
      await this.ensureReady()
      const row = this.db.get<{ value: string }>(
        `SELECT value FROM kv_store WHERE namespace = ? AND key = ?`,
        [namespace, key]
      )
      if (!row) return null
      try {
        return JSON.parse(row.value) as T
      } catch (error) {
        this.logger.warn(`Failed to parse kv value ${namespace}/${key}`, error)
        return null
      }
    } catch (error) {
      this.logger.warn(`Failed to read kv ${namespace}/${key}`, error)
      return null
    }
  }

  async kvDelete(namespace: string, key: string): Promise<void> {
    try {
      await this.ensureReady()
      this.db.run(`DELETE FROM kv_store WHERE namespace = ? AND key = ?`, [
        namespace,
        key
      ])
    } catch (error) {
      this.logger.warn(`Failed to delete kv ${namespace}/${key}`, error)
    }
  }

  private async ensureReady(): Promise<void> {
    if (!this.initialized) {
      await this.init()
    }
  }
}
