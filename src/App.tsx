import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import Create from './pages/Create'
import Generate from './pages/Generate'
import Drafts from './pages/Drafts'
import DraftEditor from './pages/DraftEditor'
import RenderQueue from './pages/RenderQueue'
import Library from './pages/Library'
import Assets from './pages/Assets'
import Tools from './pages/Tools'
import Settings from './pages/Settings'
import RenderChat from './renderRoutes/RenderChat'
import RenderSlide from './renderRoutes/RenderSlide'
import RenderOverlay from './renderRoutes/RenderOverlay'
import RenderPromoShot from './renderRoutes/RenderPromoShot'
import RenderChatShot from './renderRoutes/RenderChatShot'

// One entry per thing you might want to do, in the order you'd do it.
const NAV = [
  { to: '/', label: 'Create content' },
  { to: '/drafts', label: 'Your content' },
  { to: '/library', label: 'Downloads' },
  { to: '/queue', label: 'Render queue' },
  { to: '/tools', label: 'Tools' },
  { to: '/assets', label: 'Media library' },
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
        <Route path="/render/chatshot" element={<RenderChatShot />} />
      </Routes>
    )
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Sidebar on desktop, sticky top bar with scrollable nav on phones. */}
      <aside className="sticky top-0 z-20 flex shrink-0 flex-col border-b border-neutral-800 bg-neutral-950 p-3 lg:static lg:w-52 lg:border-b-0 lg:border-r lg:p-4">
        <div className="mb-2 text-lg font-bold lg:mb-6">
          Wing<span className="text-wing-400">AI</span> studio
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
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `whitespace-nowrap rounded-lg px-3 py-2 text-sm lg:mt-auto ${
                isActive ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-white'
              }`
            }
          >
            Settings
          </NavLink>
        </nav>
      </aside>
      <main className="min-w-0 flex-1 overflow-x-hidden p-4 md:p-6">
        <Routes>
          <Route path="/" element={<Create />} />
          <Route path="/drafts" element={<Drafts />} />
          <Route path="/batches/:batchId" element={<Drafts />} />
          <Route path="/drafts/:id" element={<DraftEditor />} />
          <Route path="/library" element={<Library />} />
          <Route path="/tools" element={<Tools />} />
          <Route path="/assets" element={<Assets />} />
          <Route path="/settings" element={<Settings />} />
          {/* Advanced/secondary: reachable by link, not in the nav. */}
          <Route path="/generate" element={<Generate />} />
          <Route path="/queue" element={<RenderQueue />} />
        </Routes>
      </main>
    </div>
  )
}
