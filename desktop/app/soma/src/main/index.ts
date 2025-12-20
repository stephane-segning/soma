import 'reflect-metadata'
import { resolve } from './container'
import { TYPES } from './tokens'

const somaApp = resolve(TYPES.somaElectronApp)
somaApp.start()
