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
    } else if (platform === 'linux') {
      // Xử lý Native cho Ubuntu (hỗ trợ cả Wayland và X11)
      const fileUris = validPaths.map(p => `file://${p}`).join('\n')
      const gnomeFormat = `copy\n${fileUris}`

      try {
        // Thử dùng wl-copy cho Wayland trước
        await execAsync(`echo -e "${gnomeFormat}" | wl-copy --type x-special/gnome-copied-files`)
      } catch {
        try {
          // Fallback về xclip cho X11
          await execAsync(`echo -e "${gnomeFormat}" | xclip -i -selection clipboard -t x-special/gnome-copied-files`)
        } catch {
          // Fallback cuối cùng: copy nội dung text nếu không có tool
          clipboard.writeText(validPaths.join('\n'))
          return { success: true, message: `Đã copy đường dẫn (Thiếu wl-clipboard/xclip để copy file).` }
        }
      }
    }

    return { success: true, message: `Đã copy ${validPaths.length} file vào bộ nhớ tạm!` }
  } catch (err: any) {
    return { success: false, message: `Lỗi clipboard: ${err.message || String(err)}` }
  }
}