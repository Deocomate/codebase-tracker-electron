// scripts/kill-electron.js
import { exec } from 'child_process'
import os from 'os'

const platform = os.platform()
// Dùng taskkill cho Windows, pkill cho Linux/macOS
const command = platform === 'win32' ? 'taskkill /F /IM electron.exe /T' : 'pkill -f electron'

exec(command, () => {
  // Bỏ qua callback error vì lệnh sẽ trả về lỗi nếu không có tiến trình nào đang chạy
  process.exit(0)
})
