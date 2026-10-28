import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import { LANG } from './i18n.ts'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('#root missing')
document.documentElement.lang = LANG
createRoot(root).render(<StrictMode><App /></StrictMode>)
