import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpcHandlers, cleanupWindowState } from './ipcHandlers'

// Import icon for window taskbar/titlebar display
import icon from '../../resources/icon.png?asset'

let mainWindow: BrowserWindow | null = null

// Bật cấu hình Wayland tự động cho Linux (tránh XWayland gây mờ UI)
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto')
  app.commandLine.appendSwitch('enable-features', 'WaylandWindowDecorations')
}

// THÊM DÒNG NÀY ĐỂ TẮT GPU CACHE / HARDWARE ACCELERATION
app.disableHardwareAcceleration()

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 750,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'Codebase Tracker',
    icon: icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Lấy sẵn ID lưu vào một biến số nguyên để dành
  const windowId = mainWindow.webContents.id

  // DỌN DẸP STATE KHI WINDOW ĐÓNG
  mainWindow.on('closed', () => {
    cleanupWindowState(windowId) // Dùng biến đã lưu, không chọc vào mainWindow nữa
    mainWindow = null
  })

  // Load renderer
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.codebasetracker')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Đảm bảo app tắt hoàn toàn trên mọi hệ điều hành khi đóng tất cả cửa sổ
app.on('window-all-closed', () => {
  app.quit()
})
