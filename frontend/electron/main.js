import { app, BrowserWindow, shell } from 'electron'
import { spawn } from 'child_process'
import { createServer } from 'net'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged

let sidecar = null

// ── Port helper ───────────────────────────────────────────────────────────────

function getFreePort() {
  return new Promise((resolve) => {
    const srv = createServer()
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port
      srv.close(() => resolve(port))
    })
  })
}

// ── Sidecar ───────────────────────────────────────────────────────────────────

function sidecarPath() {
  if (isDev) return null
  // In production: Resources/sidecar (configured in electron-builder)
  return path.join(process.resourcesPath, 'sidecar', 'sidecar')
}

function startSidecar(port) {
  return new Promise((resolve, reject) => {
    const bin = sidecarPath()
    const distDir = path.join(process.resourcesPath, 'frontend-dist')
    sidecar = spawn(bin, ['--port', String(port), '--dist-dir', distDir], {
      stdio: ['ignore', 'pipe', 'inherit'],
    })

    sidecar.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      if (text.includes(`IG2_READY:${port}`)) resolve(port)
    })

    sidecar.on('error', reject)
    sidecar.on('exit', (code) => {
      if (code !== 0 && code !== null) reject(new Error(`Sidecar exited with code ${code}`))
    })

    setTimeout(() => reject(new Error('Sidecar startup timed out')), 30_000)
  })
}

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow(url) {
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 900,
    minHeight: 600,
    title: 'IG2 Hex Map Generator',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  win.loadURL(url)

  if (isDev) win.webContents.openDevTools({ mode: 'detach' })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  let url

  if (isDev) {
    url = 'http://localhost:5173'
  } else {
    const port = await getFreePort()
    await startSidecar(port)
    url = `http://127.0.0.1:${port}`
  }

  createWindow(url)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(url)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  if (sidecar) sidecar.kill()
})
