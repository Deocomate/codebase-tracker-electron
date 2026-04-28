import { IpcApi } from './index'

declare global {
  interface Window {
    api: IpcApi
  }
}
