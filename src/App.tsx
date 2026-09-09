import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Generate from './pages/Generate'
import BatchReview from './pages/BatchReview'
import DraftEditor from './pages/DraftEditor'
import RenderQueue from './pages/RenderQueue'
import Library from './pages/Library'
import Assets from './pages/Assets'
import Settings from './pages/Settings'
import PipelineSteps from './components/studio/PipelineSteps'
import RenderChat from './renderRoutes/RenderChat'
import RenderSlide from './renderRoutes/RenderSlide'
import RenderOverlay from './renderRoutes/RenderOverlay'
import RenderPromoShot from './renderRoutes/RenderPromoShot'
import PromoShots from './pages/PromoShots'

const NAV = [
  { to: '/', label: 'Dashboard' },
  { to: '/generate', label: 'Generate' },
  { to: '/drafts', label: 'Drafts' },
  { to: '/queue', label: 'Render queue' },
  { to: '/library', label: 'Library' },
  { to: '/assets', label: 'Assets' },
  { to: '/promo-shots', label: 'Promo shots' },
  { to: '/settings', label: 'Settings' },
]

export default function App() {
  const location = useLocation()
  // Capture pages are chrome-less: Playwright screenshots them 1:1.
  if (location.pathname.startsWith('/render/')) {
    return (
      <Routes>
        <Route path="/render/chat" element={<RenderChat />} />
        <Route path="/render/slide" element={<RenderSlide />} />
        <Route path="/render/overlay" element={<RenderOverlay />} />
        <Route path="/render/promoshot" element={<RenderPromoShot />} />
      </Routes>
    )
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Sidebar on desktop, sticky top bar with scrollable nav on phones. */}
      <aside className="sticky top-0 z-20 shrink-0 border-b border-neutral-800 bg-neutral-950 p-3 lg:static lg:w-52 lg:border-b-0 lg:border-r lg:p-4">
        <div className="mb-2 text-lg font-bold lg:mb-6">
          Wing<span className="text-wing-400">AI</span> pipeline
        </div>
        <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-lg px-3 py-2 text-sm ${
                  isActive ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="min-w-0 flex-1 overflow-x-hidden p-4 md:p-6">
        <PipelineSteps />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/generate" element={<Generate />} />
          <Route path="/drafts" element={<BatchReview />} />
          <Route path="/batches/:batchId" element={<BatchReview />} />
          <Route path="/drafts/:id" element={<DraftEditor />} />
          <Route path="/queue" element={<RenderQueue />} />
          <Route path="/library" element={<Library />} />
          <Route path="/assets" element={<Assets />} />
          <Route path="/promo-shots" element={<PromoShots />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  )
}
