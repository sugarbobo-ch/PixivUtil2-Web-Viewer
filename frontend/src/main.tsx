import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { I18nProvider } from './i18n'
import './index.css'
import './styles/header.css'
import './styles/mobile-menu.css'
import './styles/gallery.css'
import './styles/responsive.css'
import './styles/theme.css'
import './styles/sidebar.css'
import './styles/navigation.css'
import './styles/typography.css'
import './styles/buttons.css'
import './styles/controls.css'
import './styles/badges.css'
import './styles/onboarding.css'

const pseudoLocaleQaEnabled = import.meta.env.DEV
  && new URLSearchParams(window.location.search).get('qa-pseudo') === '1'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider pseudoLocale={pseudoLocaleQaEnabled}>
      <App />
    </I18nProvider>
  </React.StrictMode>,
)
