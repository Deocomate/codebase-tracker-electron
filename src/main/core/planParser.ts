// src/main/core/planParser.ts

const KNOWN_EXTENSIONLESS = new Set([
  'dockerfile', 'makefile', 'procfile', 'gemfile', 'package', 'readme', 'license'
])

// Danh sách các đuôi file phổ biến hợp lệ khi không có dấu "/" đi kèm
const KNOWN_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'cc', 'cxx', 'h', 'hpp', 'cs', 'php',
  'html', 'css', 'scss', 'less', 'json', 'md', 'mdx', 'yml', 'yaml', 'xml', 'toml',
  'sh', 'bash', 'zsh', 'sql', 'vue', 'svelte', 'astro', 'ini', 'env', 'config'
])

// Regex trích xuất tất cả các "từ" có thể là đường dẫn.
// Bao gồm chữ, số, dấu chấm, gạch ngang, gạch dưới, gạch chéo, và @.
const TOKEN_REGEX = /[a-zA-Z0-9_.\-@/]+/g

function cleanToken(token: string): string {
  // 1. Loại bỏ các dấu câu ở 2 đầu (do dính dấu phẩy, chấm, ngoặc kép trong câu văn)
  let cleaned = token.replace(/^[.,;:!?'"()[\]{}<>`=]+|[.,;:!?'"()[\]{}<>`=]+$/g, '')
  // 2. Bỏ ./ ở đầu nếu có
  cleaned = cleaned.replace(/^\.\//, '')
  return cleaned
}

function looksLikePath(candidate: string): boolean {
  if (!candidate || candidate.length < 3) return false

  // Loại bỏ các cú pháp code rác
  if (
    candidate.includes('://') ||
    candidate.startsWith('//') ||
    candidate.includes('?.') ||   // optional chaining
    candidate.includes('*/') ||
    candidate.includes('/*') ||
    candidate.includes('=>') ||
    candidate === '...'
  ) {
    return false
  }

  if (candidate === '.' || candidate === '..') return false
  if (candidate.startsWith('_codebase') || candidate.includes('/_codebase/')) return false

  // Không nhận dạng thư mục (từ chối đường dẫn kết thúc bằng /)
  if (candidate.endsWith('/')) return false

  const filename = candidate.split('/').pop()?.toLowerCase() || ''

  // Hợp lệ nếu là file không đuôi nhưng nổi tiếng (Dockerfile, Makefile...)
  if (KNOWN_EXTENSIONLESS.has(filename)) return true

  const parts = filename.split('.')
  // Nếu không có dấu chấm nào -> không có extension -> Reject
  if (parts.length < 2) return false

  const ext = parts.pop() || ''

  // Nếu extension có chứa ký tự lạ (không phải chữ số) -> rác
  if (!/^[a-z0-9]+$/i.test(ext)) return false

  const hasSlash = candidate.includes('/')

  if (!hasSlash) {
    // Trường hợp 1: Đường dẫn KHÔNG có '/' (VD: App.tsx, res.error)
    // -> Bắt buộc extension phải nằm trong danh sách chuẩn để tránh match nhầm method/variable.
    return KNOWN_EXTENSIONS.has(ext)
  } else {
    // Trường hợp 2: Đường dẫn CÓ '/' (VD: src/renderer/src/App.tsx hoặc src/main/worker/index.tsl)
    // -> Chấp nhận rộng rãi hơn nếu đuôi có độ dài hợp lý (1 đến 6 ký tự).
    return ext.length >= 1 && ext.length <= 6
  }
}

export function extractPathsFromMarkdown(text: string): string[] {
  if (!text.trim()) return []
  const seen = new Set<string>()
  const results: string[] = []

  // Tìm tất cả các từ liền mạch trong văn bản
  const matches = text.match(TOKEN_REGEX) || []

  for (const match of matches) {
    const candidate = cleanToken(match)

    // Nếu token vượt qua bài test looksLikePath và chưa từng xuất hiện
    if (!looksLikePath(candidate) || seen.has(candidate)) continue

    seen.add(candidate)
    results.push(candidate)
  }

  return results
}
