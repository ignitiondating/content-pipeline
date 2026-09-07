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
    <div className="flex min-h-screen">
      <aside className="w-52 shrink-0 border-r border-neutral-800 p-4">
        <div className="mb-6 text-lg font-bold">
          Wing<span className="text-wing-400">AI</span> pipeline
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm ${
                  isActive ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-x-hidden p-6">
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
