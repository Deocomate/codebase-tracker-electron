// scripts/kill-electron.cjs
const { execSync } = require('child_process');

// Danh sách các tiến trình cần tiêu diệt
const targetProcesses = ['electron.exe', 'codebase-tracker.exe'];

try {
  if (process.platform === 'win32') {
    for (const proc of targetProcesses) {
      try {
        // /F: Force, /T: Kill child tree, /IM: Image name
        execSync(`taskkill /F /T /IM ${proc}`, { stdio: 'ignore' });
      } catch (e) {
        // Bỏ qua nếu không tìm thấy tiến trình (không in ra lỗi rác)
      }
    }
  } else {
    // Cho MacOS / Linux
    try { execSync('pkill -9 -f electron', { stdio: 'ignore' }); } catch(e){}
    try { execSync('pkill -9 -f codebase-tracker', { stdio: 'ignore' }); } catch(e){}
  }
  console.log('✅ Đã dọn dẹp các tiến trình Electron & Codebase Tracker chạy ngầm.');
} catch (e) {
  console.log('Không có tiến trình nào cần dọn dẹp.');
}
