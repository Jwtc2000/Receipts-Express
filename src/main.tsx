import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import UpdateBanner from './components/UpdateBanner'
import StorageWarning from './components/StorageWarning'
import GlobalErrorToast from './components/GlobalErrorToast'
import FirstRunNotice from './components/FirstRunNotice'
import './styles.css'

// StorageWarning requests durable storage (navigator.storage.persist) on mount
// and, if it isn't granted and the user has data, warns about the eviction risk.
//
// FirstRunNotice is last so it paints over everything else: it is the one
// overlay that must block, since it is where the Terms are actually accepted.

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <StorageWarning />
    <UpdateBanner />
    <GlobalErrorToast />
    <FirstRunNotice />
  </React.StrictMode>,
)
