import { useRef, useCallback, useState, useEffect } from 'react'
import { set as idbSet } from 'idb-keyval'
import { useMapStore } from './store/mapStore'
import { TerrainViewCanvas, type TerrainViewCanvasHandle } from './components/TerrainViewCanvas'
import { ImageAlignView } from './components/ImageAlignView'
import { TK, TK_DARK } from './theme'
import { ThemeContext } from './context/ThemeContext'
import { EditorTopBar } from './components/v2/EditorTopBar'
import { SetupLandingPage } from './components/v2/SetupLandingPage'
import { SetupWizard } from './components/v2/SetupWizard'
import { CanvasToolbar } from './components/v2/CanvasToolbar'
import { BottomDock } from './components/v2/BottomDock'
import { ErrorBoundary } from './components/ErrorBoundary'
import { IconRail, type V3Panel } from './components/v3/IconRail'
import { PopoutStrip } from './components/v3/PopoutStrip'
import { RightPanel } from './components/v3/RightPanel'

export function AppV3() {
  const [screen, setScreen] = useState<'landing' | 'wizard' | 'editor'>('landing')
  const [isDark, setIsDark] = useState(false)

  return (
    <ErrorBoundary onReset={() => setScreen('landing')}>
      <AppV3Inner
        screen={screen}
        setScreen={setScreen}
        isDark={isDark}
        setIsDark={setIsDark}
      />
    </ErrorBoundary>
  )
}

function AppV3Inner({ screen, setScreen, isDark, setIsDark }: {
  screen: 'landing' | 'wizard' | 'editor'
  setScreen: (s: 'landing' | 'wizard' | 'editor') => void
  isDark: boolean
  setIsDark: (v: boolean) => void
}) {
  const { step, undo, redo, generateStatus, generateProgress, uiScale,
          elevationStatus, heightmapUrl, fetchElevation, loadBuiltinPreset } = useMapStore()
  const canvasHandleRef = useRef<TerrainViewCanvasHandle>(null)

  const [activePanel, setActivePanel] = useState<V3Panel | null>('terrain')
  const [settingsOpen, setSettingsOpen] = useState(false)

  const activeScreen = screen === 'editor' && step === 'setup' ? 'wizard' : screen

  const captureAndStoreThumb = useCallback(() => {
    const timer = setTimeout(() => {
      const dataUrl = canvasHandleRef.current?.captureThumb()
      if (dataUrl) idbSet('hachure-thumb', dataUrl).catch(() => {})
    }, 800)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (elevationStatus === 'done' && !heightmapUrl) {
      fetchElevation()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      if ((e.key === 'z' && e.shiftKey) || e.key === 'y') { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  const handleExportPDF = useCallback(async (mode: 'sheets' | 'combined') => {
    const toB64 = (blob: Blob): Promise<string> => new Promise((res, rej) => {
      const r = new FileReader()
      r.onload = () => res((r.result as string).split(',')[1])
      r.onerror = rej
      r.readAsDataURL(blob)
    })

    let sheetPayloads: { image_b64: string; paper_mm: [number, number] }[]

    if (mode === 'combined') {
      const result = await canvasHandleRef.current?.exportBlob()
      if (!result) return
      sheetPayloads = [{ image_b64: await toB64(result.blob), paper_mm: result.paperMm }]
    } else {
      const sheets = await canvasHandleRef.current?.exportSheets()
      if (!sheets) return
      sheetPayloads = await Promise.all(sheets.map(async s => ({
        image_b64: await toB64(s.blob),
        paper_mm: s.paperMm,
      })))
    }

    const res = await fetch('/api/export/sheets-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheets: sheetPayloads }),
    })
    if (!res.ok) return
    const pdfBlob = await res.blob()
    const url = URL.createObjectURL(pdfBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'map.pdf'
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const handleSelectPanel = (panel: V3Panel) => {
    if (activePanel === panel) {
      // clicking the active panel collapses the strip
      setActivePanel(null)
      setSettingsOpen(false)
    } else {
      setActivePanel(panel)
    }
  }

  const handleToggleSettings = () => setSettingsOpen(o => !o)

  if (activeScreen === 'landing') {
    return (
      <SetupLandingPage
        onNewMap={() => { loadBuiltinPreset('standard'); setScreen('wizard') }}
        onResume={() => { setScreen('editor'); captureAndStoreThumb() }}
        onLoadFile={() => { setScreen('editor') }}
        isDark={isDark}
        onToggleDark={() => setIsDark(!isDark)}
      />
    )
  }

  if (activeScreen === 'wizard') {
    return (
      <SetupWizard
        onCancel={() => setScreen('landing')}
        onDone={() => { setScreen('editor'); captureAndStoreThumb() }}
        isDark={isDark}
      />
    )
  }

  if (step === 'image-align') return <ImageAlignView />

  const t = isDark ? TK_DARK : TK
  const surroundColor = isDark ? '#2a2420' : '#B7B0A6'

  return (
    <ThemeContext.Provider value={t}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        background: t.paper,
        fontFamily: t.sans,
        color: t.ink,
      }}>
        <EditorTopBar onExportPDF={handleExportPDF} onGoHome={() => setScreen('landing')} />

        {generateStatus === 'loading' && generateProgress && (
          <div style={{ height: 2, background: t.paper2, flexShrink: 0 }}>
            <div style={{ height: '100%', width: `${generateProgress.progress}%`, background: t.rust, transition: 'width 0.25s ease' }} />
          </div>
        )}

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', zoom: uiScale }}>
          {/* Left: icon rail */}
          <IconRail
            active={activePanel}
            onSelect={handleSelectPanel}
            onSetup={() => setScreen('wizard')}
          />

          {/* Left: popout strip for the active panel */}
          {activePanel && (
            <PopoutStrip
              panel={activePanel}
              onOpenSettings={handleToggleSettings}
              settingsOpen={settingsOpen}
            />
          )}

          {/* Centre: canvas fills the remaining space */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <TerrainViewCanvas ref={canvasHandleRef} surroundColor={surroundColor} />
            <CanvasToolbar />
            <BottomDock canvasRef={canvasHandleRef} />
          </div>

          {/* Right: settings panel, slides in when open */}
          {activePanel && settingsOpen && (
            <RightPanel
              panel={activePanel}
              onClose={() => setSettingsOpen(false)}
            />
          )}
        </div>
      </div>
    </ThemeContext.Provider>
  )
}
