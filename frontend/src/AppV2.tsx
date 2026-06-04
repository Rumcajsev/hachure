import { useRef, useCallback, useState, useEffect } from 'react'
import { set as idbSet } from 'idb-keyval'
import { useMapStore } from './store/mapStore'
import { RiversSidebarV3 } from './components/v2/RiversSidebarV3'
import { DisplaySidebarV3 } from './components/v2/DisplaySidebarV3'
import { SettlementsSidebarV3 } from './components/v2/SettlementsSidebarV3'
import { TerrainViewCanvas, type TerrainViewCanvasHandle } from './components/TerrainViewCanvas'
import { ImageAlignView } from './components/ImageAlignView'
import { TK, TK_DARK } from './theme'
import { ThemeContext } from './context/ThemeContext'
import { EditorTopBar } from './components/v2/EditorTopBar'
import { TerrainSidebarV3 } from './components/v2/TerrainSidebarV3'
import { RoadsSidebarV3 } from './components/v2/RoadsSidebarV3'
import { OverlaysSidebarV3 } from './components/v2/OverlaysSidebarV3'
import { BottomDock } from './components/v2/BottomDock'
import { CanvasToolbar } from './components/v2/CanvasToolbar'
import { SetupLandingPage } from './components/v2/SetupLandingPage'
import { SetupWizard } from './components/v2/SetupWizard'
import { ErrorBoundary } from './components/ErrorBoundary'

export function AppV2() {
  const [screen, setScreen] = useState<'landing' | 'wizard' | 'editor'>('landing')
  const [isDark, setIsDark] = useState(false)

  return (
    <ErrorBoundary onReset={() => setScreen('landing')}>
      <AppV2Inner
        screen={screen}
        setScreen={setScreen}
        isDark={isDark}
        setIsDark={setIsDark}
      />
    </ErrorBoundary>
  )
}

function AppV2Inner({ screen, setScreen, isDark, setIsDark }: {
  screen: 'landing' | 'wizard' | 'editor'
  setScreen: (s: 'landing' | 'wizard' | 'editor') => void
  isDark: boolean
  setIsDark: (v: boolean) => void
}) {
  const { step, activePanel, undo, redo, generateStatus, generateProgress, uiScale,
          elevationStatus, heightmapUrl, fetchElevation, loadBuiltinPreset } = useMapStore()
  const canvasHandleRef = useRef<TerrainViewCanvasHandle>(null)

  // If the store resets step to 'setup' while in the editor (e.g. mid-generation SSE flow),
  // treat it as wizard so the editor doesn't render against an empty store.
  const activeScreen = screen === 'editor' && step === 'setup' ? 'wizard' : screen

  const captureAndStoreThumb = useCallback(() => {
    const timer = setTimeout(() => {
      const dataUrl = canvasHandleRef.current?.captureThumb()
      if (dataUrl) idbSet('hachure-thumb', dataUrl).catch(() => {})
    }, 800)
    return () => clearTimeout(timer)
  }, [])

  // Re-fetch elevation on load when it was previously done but heightmap isn't in memory
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

  const handleExportPDF = useCallback(async () => {
    const sheets = await canvasHandleRef.current?.exportSheets()
    if (!sheets) return

    const toB64 = (blob: Blob): Promise<string> => new Promise((res, rej) => {
      const r = new FileReader()
      r.onload = () => res((r.result as string).split(',')[1])
      r.onerror = rej
      r.readAsDataURL(blob)
    })

    const sheetPayloads = await Promise.all(sheets.map(async s => ({
      image_b64: await toB64(s.blob),
      paper_mm: s.paperMm,
    })))

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

  if (activeScreen === 'landing') {
    return (
      <SetupLandingPage
        onNewMap={() => { loadBuiltinPreset('standard'); setScreen('wizard') }}
        onResume={() => { setScreen('editor'); captureAndStoreThumb() }}
        onLoadFile={() => { /* TODO: file load */ setScreen('editor') }}
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
  const sidebar = activePanel === 'terrain'     ? <TerrainSidebarV3 />
    : activePanel === 'display'     ? <DisplaySidebarV3 />
    : activePanel === 'roads'       ? <RoadsSidebarV3 />
    : activePanel === 'rivers'      ? <RiversSidebarV3 />
    : activePanel === 'settlements' ? <SettlementsSidebarV3 />
    : <OverlaysSidebarV3 />

  const surroundColor = isDark ? '#2a2420' : '#B7B0A6'

  return (
    <ThemeContext.Provider value={t}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden', background: t.paper, fontFamily: t.sans, color: t.ink }}>
        <EditorTopBar onExportPDF={handleExportPDF} onGoHome={() => setScreen('landing')} />

        {/* Progress bar */}
        {generateStatus === 'loading' && generateProgress && (
          <div style={{ height: 2, background: t.paper2, flexShrink: 0 }}>
            <div style={{ height: '100%', width: `${generateProgress.progress}%`, background: t.rust, transition: 'width 0.25s ease' }} />
          </div>
        )}

        {/* Canvas + floating sidebar */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <div style={{ width: '100%', height: '100%', display: 'flex' }}>
            <TerrainViewCanvas ref={canvasHandleRef} surroundColor={surroundColor} />
          </div>
          {/* Sidebar floats over the canvas */}
          <div style={{ position: 'absolute', top: 16, left: 16, bottom: 16, zIndex: 10, pointerEvents: 'none' }}>
            <div style={{ pointerEvents: 'auto', height: '100%', boxShadow: t.shadowFlyout, zoom: uiScale }}>
              {sidebar}
            </div>
          </div>

          <CanvasToolbar />
          <BottomDock canvasRef={canvasHandleRef} />
        </div>
      </div>
    </ThemeContext.Provider>
  )
}
