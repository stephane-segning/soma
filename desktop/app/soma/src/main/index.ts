import 'reflect-metadata'
import { container } from './container'
import { SomaElectronApp } from './app'

const somaApp = container.get(SomaElectronApp)
somaApp.start()
