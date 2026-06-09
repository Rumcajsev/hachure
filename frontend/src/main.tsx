import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { AppV2 } from './AppV2.tsx'
import { AppV3 } from './AppV3.tsx'

const useV3 = new URLSearchParams(window.location.search).get('ui') === 'v3'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {useV3 ? <AppV3 /> : <AppV2 />}
  </StrictMode>,
)
