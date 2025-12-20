import { Container } from 'inversify'
import { SomaElectronApp } from './app'
import { DaemonClient } from './services/daemon-client'
import { WindowManager } from './services/window-manager'

const container = new Container({ defaultScope: 'Singleton' })

container.bind(DaemonClient).toSelf()
container.bind(WindowManager).toSelf()
container.bind(SomaElectronApp).toSelf()

export { container }
