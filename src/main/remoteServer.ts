import { app } from 'electron'
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import { networkInterfaces } from 'node:os'
import { readdirSync, readFileSync, existsSync, renameSync, statSync } from 'node:fs'
import path from 'node:path'
import { WebSocketServer, type WebSocket } from 'ws'
import type {
  BrowseEntry,
  BrowseResponse,
  RemoteCommand,
  RemoteServerMessage,
  RemoteTaskSnapshot
} from '@shared/remoteTypes'
import { loadSettings } from './settings'

// The remote page is a built React app living alongside the desktop
// renderer's output (out/renderer/remote.html + out/renderer/assets/*).
const RENDERER_DIR = path.join(__dirname, '../renderer')

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
}

function serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string): boolean {
  if (req.method !== 'GET') return false
  const relative = pathname === '/' ? 'remote.html' : pathname.replace(/^\/+/, '')
  const resolved = path.join(RENDERER_DIR, relative)
  // Never serve anything outside the renderer output directory.
  if (
    (resolved !== RENDERER_DIR && !resolved.startsWith(RENDERER_DIR + path.sep)) ||
    !existsSync(resolved)
  ) return false
  const ext = path.extname(resolved)
  res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' })
  res.end(readFileSync(resolved))
  return true
}

const VIDEO_EXTENSIONS = new Set([
  '.mkv',
  '.mp4',
  '.mov',
  '.avi',
  '.webm',
  '.m4v',
  '.ts',
  '.wmv',
  '.flv'
])

let httpServer: Server | null = null
let wss: WebSocketServer | null = null
let currentUrl: string | null = null
const clients = new Set<WebSocket>()
const tasks = new Map<string, RemoteTaskSnapshot>()
const pendingTaskBroadcasts = new Map<string, ReturnType<typeof setTimeout>>()
let commandHandler: ((cmd: RemoteCommand) => void) | null = null

// Without a heartbeat a connection that dies silently (laptop asleep, Wi-Fi
// hand-off, phone locked) stays OPEN on both sides: the page keeps showing the
// last state it received and every button click is sent into a black hole.
// The server pings to reap dead sockets; the steady stream of heartbeat
// messages lets the page notice the same thing and reconnect.
const HEARTBEAT_MS = 5000
const alive = new WeakSet<WebSocket>()
let heartbeatTimer: ReturnType<typeof setInterval> | null = null

export function getUrl(): string | null {
  return currentUrl
}

function send(ws: WebSocket, msg: RemoteServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg))
}

function broadcast(msg: RemoteServerMessage): void {
  for (const ws of clients) send(ws, msg)
}

export function onRemoteCommand(cb: (cmd: RemoteCommand) => void): void {
  commandHandler = cb
}

export function updateTaskSnapshot(snapshot: RemoteTaskSnapshot): void {
  const previous = tasks.get(snapshot.taskId)
  tasks.set(snapshot.taskId, snapshot)

  // Progress and ffmpeg log events can produce hundreds of complete snapshots
  // per second. Keep the latest state for new connections, but coalesce routine
  // broadcasts. Lifecycle changes remain immediate so controls feel responsive.
  const lifecycleChanged = !previous || previous.status !== snapshot.status || previous.inputPath !== snapshot.inputPath
  const pending = pendingTaskBroadcasts.get(snapshot.taskId)
  if (lifecycleChanged) {
    if (pending) clearTimeout(pending)
    pendingTaskBroadcasts.delete(snapshot.taskId)
    broadcast({ type: 'update', task: snapshot })
  } else if (!pending) {
    pendingTaskBroadcasts.set(
      snapshot.taskId,
      setTimeout(() => {
        pendingTaskBroadcasts.delete(snapshot.taskId)
        const latest = tasks.get(snapshot.taskId)
        if (latest) broadcast({ type: 'update', task: latest })
      }, 100)
    )
  }
}

export function removeTaskSnapshot(taskId: string): void {
  const pending = pendingTaskBroadcasts.get(taskId)
  if (pending) clearTimeout(pending)
  pendingTaskBroadcasts.delete(taskId)
  tasks.delete(taskId)
  broadcast({ type: 'remove', taskId })
}

export function broadcastStats(stats: {
  cpuPercent: number
  netRxBps: number
  netTxBps: number
}): void {
  if (clients.size > 0) broadcast({ type: 'stats', ...stats })
}

export function isRunning(): boolean {
  return httpServer !== null
}

function findAllowedRoot(target: string, roots: string[]): string | null {
  const resolved = path.resolve(target)
  for (const root of roots) {
    const resolvedRoot = path.resolve(root)
    if (resolved === resolvedRoot || resolved.startsWith(resolvedRoot + path.sep)) {
      return resolvedRoot
    }
  }
  return null
}

function browseRoots(): BrowseResponse {
  const roots = loadSettings().remoteBrowseRoots
  return {
    path: null,
    parent: null,
    entries: roots.map((r) => ({ name: r, path: path.resolve(r), isDir: true }))
  }
}

function browseDirectory(targetPath: string): BrowseResponse | { error: string; status: number } {
  const roots = loadSettings().remoteBrowseRoots
  const root = findAllowedRoot(targetPath, roots)
  if (!root) {
    return { error: 'Path is outside the configured folders.', status: 403 }
  }

  const resolved = path.resolve(targetPath)
  let dirents
  try {
    dirents = readdirSync(resolved, { withFileTypes: true })
  } catch (err) {
    return { error: (err as Error).message, status: 500 }
  }

  const entries: BrowseEntry[] = dirents
    .filter((d) => !d.name.startsWith('.'))
    .filter((d) => d.isDirectory() || VIDEO_EXTENSIONS.has(path.extname(d.name).toLowerCase()))
    .map((d) => ({
      name: d.name,
      path: path.join(resolved, d.name),
      isDir: d.isDirectory()
    }))
    .sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.name.localeCompare(b.name)
    })

  return {
    path: resolved,
    parent: resolved === root ? null : path.dirname(resolved),
    entries
  }
}

function renameVideo(sourcePath: string, newName: string): BrowseEntry | { error: string; status: number } {
  const roots = loadSettings().remoteBrowseRoots
  if (!findAllowedRoot(sourcePath, roots)) return { error: 'Path is outside the configured folders.', status: 403 }
  const trimmed = newName.trim()
  if (!trimmed || trimmed === '.' || trimmed === '..' || /[\\/]/.test(trimmed)) {
    return { error: 'Enter a valid file name without folder separators.', status: 400 }
  }
  if (!VIDEO_EXTENSIONS.has(path.extname(trimmed).toLowerCase())) {
    return { error: 'The renamed file must keep a supported video extension.', status: 400 }
  }
  try {
    if (!statSync(sourcePath).isFile()) return { error: 'Only video files can be renamed.', status: 400 }
  } catch {
    return { error: 'The source file no longer exists.', status: 404 }
  }
  const targetPath = path.join(path.dirname(sourcePath), trimmed)
  if (!findAllowedRoot(targetPath, roots)) return { error: 'Target path is outside the configured folders.', status: 403 }
  if (targetPath === sourcePath) return { name: trimmed, path: targetPath, isDir: false }
  if (existsSync(targetPath)) return { error: 'A file with that name already exists.', status: 409 }
  try {
    renameSync(sourcePath, targetPath)
    return { name: trimmed, path: targetPath, isDir: false }
  } catch (err) {
    return { error: (err as Error).message, status: 500 }
  }
}

function handleRenameRequest(req: IncomingMessage, res: ServerResponse): void {
  let body = ''
  req.setEncoding('utf8')
  req.on('data', (chunk: string) => {
    body += chunk
    if (body.length > 16_384) req.destroy()
  })
  req.on('end', () => {
    try {
      const payload = JSON.parse(body) as { path?: unknown; newName?: unknown }
      if (typeof payload.path !== 'string' || typeof payload.newName !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid rename request.' }))
        return
      }
      const result = renameVideo(payload.path, payload.newName)
      if ('error' in result) {
        res.writeHead(result.status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: result.error }))
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ entry: result }))
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid JSON request.' }))
    }
  })
}

function localLanUrl(port: number): string {
  const nets = networkInterfaces()
  for (const ifaceList of Object.values(nets)) {
    for (const net of ifaceList ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        return `http://${net.address}:${port}`
      }
    }
  }
  return `http://localhost:${port}`
}

export function startRemoteServer(port: number): Promise<{ url: string }> {
  return new Promise((resolve, reject) => {
    if (httpServer && currentUrl) {
      resolve({ url: currentUrl })
      return
    }

    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost')

      if (req.method === 'GET' && url.pathname === '/api/browse') {
        const target = url.searchParams.get('path')
        const result = target ? browseDirectory(target) : browseRoots()
        if ('error' in result) {
          res.writeHead(result.status, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: result.error }))
          return
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
        return
      }

      if (req.method === 'POST' && url.pathname === '/api/rename') {
        handleRenameRequest(req, res)
        return
      }

      if (serveStatic(req, res, url.pathname)) return

      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not found')
    })

    server.on('error', (err) => {
      httpServer = null
      reject(err)
    })

    const socketServer = new WebSocketServer({ server, path: '/ws' })

    socketServer.on('connection', (ws) => {
      clients.add(ws)
      alive.add(ws)
      ws.on('pong', () => alive.add(ws))
      send(ws, { type: 'hello', appVersion: app.getVersion() })
      send(ws, { type: 'snapshot', tasks: Array.from(tasks.values()) })

      ws.on('message', (data) => {
        alive.add(ws)
        try {
          const cmd = JSON.parse(data.toString()) as RemoteCommand

          if (
            (cmd.type === 'convert' || cmd.type === 'cancel' || cmd.type === 'closeTask') &&
            typeof cmd.taskId === 'string'
          ) {
            commandHandler?.(cmd)
            return
          }

          if (cmd.type === 'newTask' && typeof cmd.inputPath === 'string') {
            // Never trust a client-supplied path implicitly — it must fall inside
            // one of the configured browse roots, same as directory listings.
            const roots = loadSettings().remoteBrowseRoots
            if (findAllowedRoot(cmd.inputPath, roots)) {
              commandHandler?.(cmd)
            }
            return
          }

          if (cmd.type === 'setOptions' && typeof cmd.taskId === 'string') {
            commandHandler?.(cmd)
          }
        } catch {
          // ignore malformed messages
        }
      })

      ws.on('close', () => clients.delete(ws))
      ws.on('error', () => clients.delete(ws))
    })

    heartbeatTimer = setInterval(() => {
      for (const ws of clients) {
        if (!alive.has(ws)) {
          clients.delete(ws)
          ws.terminate()
          continue
        }
        alive.delete(ws)
        ws.ping()
      }
      broadcast({ type: 'heartbeat' })
    }, HEARTBEAT_MS)

    server.listen(port, () => {
      httpServer = server
      wss = socketServer
      currentUrl = localLanUrl(port)
      resolve({ url: currentUrl })
    })
  })
}

export function stopRemoteServer(): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer)
  heartbeatTimer = null
  for (const timer of pendingTaskBroadcasts.values()) clearTimeout(timer)
  pendingTaskBroadcasts.clear()
  for (const ws of clients) ws.terminate()
  clients.clear()
  wss?.close()
  wss = null
  httpServer?.close()
  httpServer = null
  currentUrl = null
  tasks.clear()
}
