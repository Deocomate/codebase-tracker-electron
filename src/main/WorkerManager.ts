/**
 * WorkerManager: Manages the lifecycle of a Worker child process.
 * 
 * Handles spawning (WSL or local), NDJSON request/response mapping,
 * progress event forwarding, error recovery, and graceful shutdown.
 */

import { spawn, ChildProcess, execSync } from 'child_process'
import { join } from 'path'
import { EventEmitter } from 'events'
import { extractDistro, windowsToLinux, windowsToWslMount, isWslPath } from './pathMapper'
import type { WorkerRequest, WorkerResponse, WorkerAction } from './worker/protocol'

// ==================== Types ====================

interface PendingRequest {
  resolve: (data: unknown) => void
  reject: (err: Error) => void
  progressCallback?: (progress: number, message: string) => void
}

export interface WorkerManagerOptions {
  /** The original project path (could be WSL UNC or Windows path) */
  projectPath: string
  /** WSL configuration from frontend */
  wslConfig?: { enabled: boolean; basePath: string }
}

// ==================== Constants ====================

const MAX_RESTART_ATTEMPTS = 3
const RESTART_WINDOW_MS = 30_000

// ==================== WorkerManager Class ====================

export class WorkerManager extends EventEmitter {
  private child: ChildProcess | null = null
  private inputBuffer = ''
  private requestCounter = 0
  private pendingRequests = new Map<string, PendingRequest>()
  private isShuttingDown = false
  private initialized = false
  private restartTimestamps: number[] = []

  // Cached WSL info (populated during validateEnvironment)
  private wslNodePath: string | null = null
  private lastErrorLog = ''

  // Immutable config set at construction
  public readonly projectPath: string
  public readonly isWsl: boolean
  public readonly distro: string | null
  public readonly linuxProjectPath: string | null

  constructor(options: WorkerManagerOptions) {
    super()
    this.projectPath = options.projectPath

    // Determine if this is a WSL project
    if (options.wslConfig?.enabled && isWslPath(options.projectPath)) {
      this.isWsl = true
      this.distro = extractDistro(options.projectPath)
      this.linuxProjectPath = windowsToLinux(options.projectPath)
    } else {
      this.isWsl = false
      this.distro = null
      this.linuxProjectPath = null
    }
  }

  // ==================== Public API ====================

  /**
   * Validate that the WSL environment has Node.js installed.
   * Uses the user's interactive shell to discover the absolute path to node
   * (critical for NVM-installed Node.js which isn't in the default PATH).
   */
  async validateEnvironment(): Promise<{ ok: boolean; error?: string }> {
    if (!this.isWsl || !this.distro) {
      return { ok: true }
    }

    // 1. Detect user's default shell in WSL
    let defaultShell = 'bash'
    try {
      const shellResult = execSync(
        `wsl.exe -d ${this.distro} -- sh -c "basename \\"$SHELL\\""`,
        { timeout: 10_000, stdio: ['pipe', 'pipe', 'pipe'] }
      )
      defaultShell = shellResult.toString().trim() || 'bash'
      console.log(`[WorkerManager] WSL default shell: ${defaultShell}`)
    } catch {
      // fallback to bash
    }

    // 2. Find absolute path to node using interactive shell (loads NVM/profile)
    try {
      const nodeCheck = execSync(
        `wsl.exe -d ${this.distro} -- ${defaultShell} -ic "which node"`,
        { timeout: 15_000, stdio: ['pipe', 'pipe', 'pipe'] }
      )
      const nodePath = nodeCheck.toString().trim()

      if (!nodePath || nodePath.includes('not found')) {
        throw new Error('Node not found')
      }

      this.wslNodePath = nodePath
      console.log(`[WorkerManager] WSL Node.js path: ${this.wslNodePath}`)
      return { ok: true }
    } catch {
      return {
        ok: false,
        error: `Cần cài đặt Node.js trong môi trường ${this.distro} để sử dụng tính năng WSL.\n\nCách cài đặt:\n  1. Mở terminal WSL (${this.distro})\n  2. Chạy: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash\n  3. Restart terminal, rồi chạy: nvm install --lts`
      }
    }
  }

  /**
   * Spawn the Worker child process.
   */
  async start(): Promise<void> {
    if (this.child) {
      await this.kill()
    }
    this.lastErrorLog = ''

    const workerScriptPath = this.getWorkerScriptPath()

    if (this.isWsl && this.distro) {
      // Spawn inside WSL using the ABSOLUTE path to node (discovered during validation).
      // This avoids needing interactive shell (-ic) which causes signal/prompt issues.
      // wsl.exe -e <absolute_node_path> <worker_script> works perfectly with stdin/stdout piping.
      const linuxWorkerPath = windowsToWslMount(workerScriptPath)

      if (this.wslNodePath) {
        // Best path: use absolute node path directly — no shell overhead, clean stdio
        console.log(`[WorkerManager] WSL spawn: wsl.exe -d ${this.distro} -e ${this.wslNodePath} ${linuxWorkerPath}`)
        this.child = spawn('wsl.exe', [
          '-d', this.distro, '-e',
          this.wslNodePath, linuxWorkerPath
        ], {
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true
        })
      } else {
        // Fallback: try plain `node` (might work if installed system-wide)
        console.log(`[WorkerManager] WSL spawn (fallback): wsl.exe -d ${this.distro} -e node ${linuxWorkerPath}`)
        this.child = spawn('wsl.exe', [
          '-d', this.distro, '-e',
          'node', linuxWorkerPath
        ], {
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true
        })
      }
    } else {
      // Spawn local Node.js process using Electron binary in Node mode.
      // ELECTRON_RUN_AS_NODE=1 tells Electron to behave as plain Node.js.
      console.log(`[WorkerManager] Local spawn: ${process.execPath} ${workerScriptPath}`)
      this.child = spawn(process.execPath, [workerScriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
      })
    }

    this.setupChildHandlers()
  }

  /**
   * Send a request to the Worker and wait for the response.
   */
  async send(
    action: WorkerAction,
    payload?: Record<string, unknown>,
    progressCallback?: (progress: number, message: string) => void
  ): Promise<unknown> {
    if (!this.child || this.isShuttingDown) {
      throw new Error('Worker not running')
    }

    const id = String(++this.requestCounter)

    return new Promise<unknown>((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject, progressCallback })

      const request: WorkerRequest = { id, action, payload }
      const line = JSON.stringify(request) + '\n'

      try {
        this.child!.stdin!.write(line, (err) => {
          if (err) {
            this.pendingRequests.delete(id)
            reject(new Error(`Failed to write to worker stdin: ${err.message}`))
          }
        })
      } catch (err: unknown) {
        this.pendingRequests.delete(id)
        reject(new Error(`Worker stdin error: ${err instanceof Error ? err.message : String(err)}`))
      }
    })
  }

  /**
   * Mark the worker as successfully initialized (INIT completed).
   * Auto-restart will only kick in after this flag is set.
   */
  markInitialized(): void {
    this.initialized = true
  }

  /**
   * Gracefully shutdown the Worker process.
   */
  async kill(): Promise<void> {
    if (!this.child) return
    this.isShuttingDown = true

    const childToKill = this.child

    // Remove all listeners FIRST to prevent the 'close' event from
    // triggering "unexpected exit" handling after cleanup resets isShuttingDown.
    childToKill.removeAllListeners()

    // Try graceful shutdown via SHUTDOWN command
    try {
      const request = JSON.stringify({ id: 'shutdown', action: 'SHUTDOWN' }) + '\n'
      childToKill.stdin?.write(request)
      await new Promise((resolve) => setTimeout(resolve, 1000))
    } catch {
      // Ignore errors during shutdown
    }

    // Force kill if still alive
    if (!childToKill.killed) {
      childToKill.kill('SIGKILL')
    }

    // Clean state
    this.child = null
    this.inputBuffer = ''
    this.isShuttingDown = false
    this.initialized = false
    this.rejectAllPending(new Error('Worker was killed'))
  }

  /**
   * Check if the worker is currently running.
   */
  get isRunning(): boolean {
    return this.child !== null && !this.child.killed && !this.isShuttingDown
  }

  // ==================== Private Methods ====================

  private getWorkerScriptPath(): string {
    // In development: out/main/worker.js (relative to __dirname which is out/main/)
    // In production: worker.js is unpacked from asar via asarUnpack config.
    // __dirname inside asar: ...\app.asar\out\main
    // Unpacked location:     ...\app.asar.unpacked\out\main\worker.js
    const workerPath = join(__dirname, 'worker.js')
    return workerPath.replace('app.asar', 'app.asar.unpacked')
  }

  private setupChildHandlers(): void {
    if (!this.child) return

    // Handle stdout (NDJSON responses)
    this.child.stdout!.setEncoding('utf-8')
    this.child.stdout!.on('data', (chunk: string) => {
      this.inputBuffer += chunk
      const lines = this.inputBuffer.split('\n')
      this.inputBuffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue

        try {
          const response = JSON.parse(trimmed) as WorkerResponse
          this.handleResponse(response)
        } catch {
          // Not valid JSON — might be stray output, ignore
        }
      }
    })

    // Handle stderr (debug logs from worker)
    this.child.stderr!.setEncoding('utf-8')
    this.child.stderr!.on('data', (chunk: string) => {
      // Lưu lại log lỗi (giữ khoảng 2000 ký tự cuối để tránh tốn RAM)
      this.lastErrorLog += chunk
      if (this.lastErrorLog.length > 2000) {
        this.lastErrorLog = this.lastErrorLog.slice(-2000)
      }

      const lines = chunk.split('\n').filter((l) => l.trim())
      for (const line of lines) {
        console.log(`[WorkerLog] ${line}`)
      }
    })

    // Handle process exit
    this.child.on('close', (code) => {
      if (!this.isShuttingDown) {
        // Gắn log lỗi từ stderr vào message báo lỗi
        const errorMsg = `Worker crashed (exit code ${code}). Details: ${this.lastErrorLog.trim() || 'No additional logs.'}`
        console.error(`[WorkerManager] ${errorMsg}`)
        this.rejectAllPending(new Error(errorMsg))
        this.child = null

        // Only auto-restart if the worker was previously initialized successfully.
        // This prevents restart loops during project:load failures.
        if (this.initialized) {
          this.attemptRestart()
        }
      }
    })

    this.child.on('error', (err) => {
      const errorMsg = `Worker spawn error: ${err.message}. Details: ${this.lastErrorLog.trim()}`
      console.error(`[WorkerManager]`, errorMsg)
      this.rejectAllPending(new Error(errorMsg))
      this.child = null
    })
  }

  private handleResponse(response: WorkerResponse): void {
    const pending = this.pendingRequests.get(response.id)
    if (!pending) return

    if (response.status === 'progress') {
      // Forward progress to the registered callback
      if (pending.progressCallback && response.progress !== undefined && response.message) {
        pending.progressCallback(response.progress, response.message)
      }
      // Don't resolve yet — wait for final success/error
      return
    }

    // Final response — resolve or reject
    this.pendingRequests.delete(response.id)

    if (response.status === 'error') {
      pending.resolve({ error: response.error })
    } else {
      pending.resolve(response.data)
    }
  }

  private rejectAllPending(error: Error): void {
    for (const [id, pending] of this.pendingRequests) {
      pending.reject(error)
      this.pendingRequests.delete(id)
    }
  }

  private attemptRestart(): void {
    const now = Date.now()
    this.restartTimestamps.push(now)

    // Keep only recent timestamps
    this.restartTimestamps = this.restartTimestamps.filter(
      (ts) => now - ts < RESTART_WINDOW_MS
    )

    if (this.restartTimestamps.length > MAX_RESTART_ATTEMPTS) {
      console.error(
        `[WorkerManager] Worker crashed ${MAX_RESTART_ATTEMPTS}+ times in ${RESTART_WINDOW_MS / 1000}s, giving up.`
      )
      this.emit('crash', new Error('Worker exceeded max restart attempts'))
      return
    }

    console.log(`[WorkerManager] Attempting auto-restart (${this.restartTimestamps.length}/${MAX_RESTART_ATTEMPTS})...`)
    this.start().catch((err) => {
      console.error('[WorkerManager] Auto-restart failed:', err.message)
      this.emit('crash', err)
    })
  }
}
