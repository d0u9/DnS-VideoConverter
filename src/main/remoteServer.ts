import { app } from 'electron'
import { createServer, type Server } from 'node:http'
import { networkInterfaces } from 'node:os'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { WebSocketServer, type WebSocket } from 'ws'
import type {
  BrowseEntry,
  BrowseResponse,
  RemoteCommand,
  RemoteServerMessage,
  RemoteTaskSnapshot
} from '@shared/remoteTypes'
import { REMOTE_PAGE_HTML } from './remotePageHtml'
import { loadSettings } from './settings'

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
let commandHandler: ((cmd: RemoteCommand) => void) | null = null

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
  tasks.set(snapshot.taskId, snapshot)
  broadcast({ type: 'update', task: snapshot })
}

export function removeTaskSnapshot(taskId: string): void {
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

      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(REMOTE_PAGE_HTML)
        return
      }

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
      send(ws, { type: 'hello', appVersion: app.getVersion() })
      send(ws, { type: 'snapshot', tasks: Array.from(tasks.values()) })

      ws.on('message', (data) => {
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

    server.listen(port, () => {
      httpServer = server
      wss = socketServer
      currentUrl = localLanUrl(port)
      resolve({ url: currentUrl })
    })
  })
}

export function stopRemoteServer(): void {
  for (const ws of clients) ws.terminate()
  clients.clear()
  wss?.close()
  wss = null
  httpServer?.close()
  httpServer = null
  currentUrl = null
  tasks.clear()
}
