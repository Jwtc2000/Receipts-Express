import React, { useEffect, useRef, useState } from 'react'
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

function Root() {
  const [gateOpen, setGateOpen] = useState(false)
  const behindRef = useRef<HTMLDivElement>(null)

  // Painting over the app is not the same as blocking it: a keyboard user can
  // tab underneath a backdrop, and a screen reader can read straight through
  // it. `inert` is what actually stops that, but it has to be applied to
  // something, and the three overlays mount and unmount on their own schedule,
  // so no existing node means "everything except the gate". This wrapper is
  // that node. display:contents generates no box, so it changes no layout,
  // while inert still applies to the whole subtree beneath it.
  //
  // Toggled on the element rather than passed as a prop. That was needed when
  // React 18's types had no `inert`; React 19's do, and this still works.
  useEffect(() => {
    behindRef.current?.toggleAttribute('inert', gateOpen)
  }, [gateOpen])

  return (
    <>
      <div ref={behindRef} style={{ display: 'contents' }}>
        {/* Above the app, not below it. The app column is a full viewport
            tall, so a warning mounted after it sat just past the bottom of
            the screen and was only ever seen by someone who scrolled to the
            end of the page. */}
        <StorageWarning />
        <App />
        <UpdateBanner />
        <GlobalErrorToast />
      </div>
      <FirstRunNotice onOpenChange={setGateOpen} />
    </>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
