export function formatTokenCount(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens <= 0) return '0'
  if (tokens < 1000) return tokens.toLocaleString()
  if (tokens < 1_000_000) {
    const value = tokens / 1000
    return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)}k`
  }
  const value = tokens / 1_000_000
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)}M`
}
