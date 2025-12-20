const DAEMON_CLIENT = Symbol('DaemonClient')
const IPC_SERVICE = Symbol('IpcService')
const WINDOW_MANAGER = Symbol('WindowManager')
const SOMA_ELECTRON_APP = Symbol('SomaElectronApp')
const DB_SERVICE = Symbol('DbService')
const APP_SETTINGS_SERVICE = Symbol('AppSettingsService')
const APP_STATE_SYNC_SERVICE = Symbol('AppStateSyncService')
const MAIN_IPC_CONTROLLER = Symbol('MainIpcController')
const MAIN_BOOTSTRAP_SERVICE = Symbol('MainBootstrapService')
const MAIN_WINDOW_CONTROLLER = Symbol('MainWindowController')

const TYPES = {
  daemonClient: DAEMON_CLIENT,
  ipcService: IPC_SERVICE,
  windowManager: WINDOW_MANAGER,
  somaElectronApp: SOMA_ELECTRON_APP,
  dbService: DB_SERVICE,
  appSettingsService: APP_SETTINGS_SERVICE,
  appStateSyncService: APP_STATE_SYNC_SERVICE,
  mainIpcController: MAIN_IPC_CONTROLLER,
  mainBootstrapService: MAIN_BOOTSTRAP_SERVICE,
  mainWindowController: MAIN_WINDOW_CONTROLLER
} as const

type Token = (typeof TYPES)[keyof typeof TYPES]

export { TYPES }
export type { Token }
