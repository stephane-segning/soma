import { ElectronAPI } from '@electron-toolkit/preload'
import { Observable } from 'rxjs'

type RendererApi = {
  getLastRoute: () => Promise<string>
  setLastRoute: (route: string) => void
}

type IpcBridge = {
  sendToMain: (channel: string, payload?: unknown) => void
  onMainEvent: <T = unknown>(channel: string) => Observable<T>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: RendererApi
    ipc: IpcBridge
  }
}
