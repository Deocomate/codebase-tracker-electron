import { clipboard } from 'electron'
import fs from 'fs'
import { exec } from 'child_process'
import util from 'util'

const execAsync = util.promisify(exec)

export async function copyFilesToClipboard(filePaths: string[]): Promise<{ success: boolean; message: string }> {
  const validPaths = filePaths.filter(p => fs.existsSync(p))
  
  if (validPaths.length === 0) {
    return { success: false, message: 'Không tìm thấy file thực tế nào để copy!' }
  }

  try {
    clipboard.clear()
    const platform = process.platform

    if (platform === 'win32') {
      // Dùng PowerShell Set-Clipboard
      const pathsStr = validPaths.map(p => `'${p.replace(/'/g, "''")}'`).join(',')
      await execAsync(`powershell.exe -NoProfile -Command "Set-Clipboard -Path ${pathsStr}"`)
    } else if (platform === 'darwin') {
      // Dùng osascript (AppleScript)
      const macPaths = validPaths.map(p => `POSIX file "${p.replace(/"/g, '\\"')}"`).join(', ')
      await execAsync(`osascript -e 'set the clipboard to { ${macPaths} }'`)
    } else {
      // Linux fallback
      clipboard.writeText(validPaths.join('\n'))
    }

    return { success: true, message: `Đã copy ${validPaths.length} file vào bộ nhớ tạm!` }
  } catch (err: any) {
    return { success: false, message: `Lỗi clipboard: ${err.message || String(err)}` }
  }
}