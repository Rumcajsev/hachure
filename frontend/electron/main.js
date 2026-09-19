import { app, BrowserWindow, shell, session, dialog } from 'electron'
import { spawn } from 'child_process'
import { createServer } from 'net'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged

let sidecar = null

// ── Port helper ───────────────────────────────────────────────────────────────

const PREFERRED_PORT = 48765

function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = createServer()
    srv.once('error', () => resolve(false))
    srv.once('listening', () => { srv.close(); resolve(true) })
    srv.listen(port, '127.0.0.1')
  })
}

async function getPort() {
  if (await isPortFree(PREFERRED_PORT)) return PREFERRED_PORT
  // Fallback: let OS pick — localStorage won't persist this session but app still works
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

function showSidecarError(detail) {
  dialog.showErrorBox('Hachure failed to start', `The backend process could not start.\n\n${detail}\n\nTry relaunching the app. If the problem persists, reinstall from the DMG.`)
  app.quit()
}

function startSidecar(port) {
  return new Promise((resolve, reject) => {
    const bin = sidecarPath()
    const distDir = path.join(process.resourcesPath, 'frontend-dist')
    sidecar = spawn(bin, ['--port', String(port), '--dist-dir', distDir], {
      stdio: ['ignore', 'pipe', 'inherit'],
    })

    let started = false

    sidecar.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      if (!started && text.includes(`HACHURE_READY:${port}`)) {
        started = true
        resolve(port)
      }
    })

    sidecar.on('error', reject)
    sidecar.on('exit', (code) => {
      if (!started) {
        reject(new Error(`Sidecar exited with code ${code} before becoming ready`))
      } else if (code !== 0 && code !== null) {
        showSidecarError(`Backend process exited unexpectedly (code ${code}).`)
      }
    })

    setTimeout(() => {
      if (!started) reject(new Error('Sidecar startup timed out after 30s'))
    }, 30_000)
  })
}

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow(url) {
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 900,
    minHeight: 600,
    title: 'Hachure',
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
  await session.defaultSession.clearCache()

  let url

  if (isDev) {
    url = 'http://localhost:5173'
  } else {
    let port
    try {
      port = await getPort()
      await startSidecar(port)
    } catch (err) {
      showSidecarError(err.message)
      return
    }
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
