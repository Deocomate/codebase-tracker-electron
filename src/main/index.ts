import { app, shell, BrowserWindow, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpcHandlers, cleanupWindowState } from './ipcHandlers'

// Import icon for window taskbar/titlebar display
import icon from '../../resources/icon.png?asset'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

// Bật cấu hình Wayland tự động cho Linux (tránh XWayland gây mờ UI)
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto')
  app.commandLine.appendSwitch('enable-features', 'WaylandWindowDecorations')
}

// THÊM DÒNG NÀY ĐỂ TẮT GPU CACHE / HARDWARE ACCELERATION
app.disableHardwareAcceleration()

function showMainWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }
  mainWindow.show()
  mainWindow.focus()
}

function createTray(): void {
  const trayIcon = nativeImage.createFromPath(icon).resize({ width: 16, height: 16 })
  tray = new Tray(trayIcon)

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show App', click: showMainWindow },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true
        tray?.destroy()
        tray = null
        app.quit()
      }
    }
  ])

  tray.setToolTip('Codebase Tracker')
  tray.setContextMenu(contextMenu)
  tray.on('click', () => {
    if (!mainWindow) return
    if (mainWindow.isVisible()) {
      mainWindow.hide()
      return
    }
    showMainWindow()
  })
}

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

  mainWindow.on('close', (event) => {
    if (!isQuitting && process.platform === 'win32') {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

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

  if (process.platform === 'win32') {
    createTray()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && process.platform !== 'win32') {
    // Ép tắt ngay lập tức, bỏ qua mọi tiến trình I/O đang treo
    app.exit(0)
  }
})

// Đề phòng trường hợp người dùng MacOS bấm Cmd+Q
app.on('before-quit', () => {
  isQuitting = true
})
