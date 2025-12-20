import { ElectronAPI } from '@electron-toolkit/preload'

type RendererApi = {
  getLastRoute: () => Promise<string>
  setLastRoute: (route: string) => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: RendererApi
  }
}
