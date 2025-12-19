import { Container } from 'inversify'
import { WindowManager } from './services/window-manager'

const container = new Container({ defaultScope: 'Singleton' })

container.bind(WindowManager).toSelf()

export { container }
