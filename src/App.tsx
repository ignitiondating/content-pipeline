import { NavLink, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import Projects from './pages/Projects'
import NewProject from './pages/NewProject'
import Editor from './pages/Editor'
import Settings from './pages/Settings'
import RenderChat from './renderRoutes/RenderChat'
import RenderSlide from './renderRoutes/RenderSlide'
import RenderOverlay from './renderRoutes/RenderOverlay'
import RenderPromoShot from './renderRoutes/RenderPromoShot'
import RenderChatShot from './renderRoutes/RenderChatShot'

function DraftRedirect() {
  const { id } = useParams()
  return <Navigate to={id ? `/edit/${id}` : '/'} replace />
}

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

  // CapCut editor + new-project flow fill the window — no studio chrome.
  const fullscreen =
    location.pathname.startsWith('/edit/') || location.pathname === '/new'

  if (fullscreen) {
    return (
      <Routes>
        <Route path="/new" element={<NewProject />} />
        <Route path="/edit/:id" element={<Editor />} />
      </Routes>
    )
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="sticky top-0 z-20 flex shrink-0 flex-col border-b border-neutral-800 bg-neutral-950 px-4 py-4 lg:static lg:h-screen lg:w-56 lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
        <div className="mb-3 text-lg font-bold lg:mb-8">
          Wing<span className="text-wing-400">AI</span> studio
        </div>
        <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 lg:mx-0 lg:flex-1 lg:flex-col lg:overflow-visible lg:px-0">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `whitespace-nowrap rounded-lg px-3 py-2.5 text-sm ${
                isActive ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'
              }`
            }
          >
            Projects
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `whitespace-nowrap rounded-lg px-3 py-2.5 text-sm lg:mt-auto ${
                isActive ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-white'
              }`
            }
          >
            Settings
          </NavLink>
        </nav>
      </aside>
      <main className="min-w-0 flex-1 overflow-x-hidden px-6 py-8 sm:px-10 sm:py-10 lg:px-14">
        <Routes>
          <Route path="/" element={<Projects />} />
          <Route path="/settings" element={<Settings />} />
          {/* Legacy routes collapse into the CapCut flow. */}
          <Route path="/drafts" element={<Navigate to="/" replace />} />
          <Route path="/drafts/:id" element={<DraftRedirect />} />
          <Route path="/batches/:batchId" element={<Navigate to="/" replace />} />
          <Route path="/library" element={<Navigate to="/" replace />} />
          <Route path="/generate" element={<Navigate to="/new" replace />} />
          <Route path="/tools" element={<Navigate to="/" replace />} />
          <Route path="/assets" element={<Navigate to="/" replace />} />
          <Route path="/queue" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
