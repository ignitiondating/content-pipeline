import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api } from '../../lib/api'

interface Counts {
  drafts: Record<string, number>
  activeJobs: number
}

interface Step {
  key: string
  label: string
  to: string
  /** Route prefixes that mark this step as the current page. */
  match: string[]
  /** Pieces currently sitting at this stage. */
  count: (c: Counts) => number
  hint: string
}

const STEPS: Step[] = [
  { key: 'generate', label: 'Generate', to: '/generate', match: ['/generate'], count: () => 0, hint: 'Claude writes variants' },
  { key: 'review', label: 'Review', to: '/drafts?status=draft', match: ['/drafts', '/batches'], count: (c) => c.drafts.draft ?? 0, hint: 'approve, edit or reject' },
  { key: 'render', label: 'Render', to: '/queue', match: ['/queue'], count: (c) => c.activeJobs, hint: 'files being produced' },
  { key: 'export', label: 'Export', to: '/queue', match: [], count: (c) => c.drafts.rendered ?? 0, hint: 'rendered, send to library' },
  { key: 'post', label: 'Post', to: '/library', match: ['/library'], count: (c) => c.drafts.exported ?? 0, hint: 'download, upload, mark posted' },
]

export default function PipelineSteps() {
  const location = useLocation()
  const [counts, setCounts] = useState<Counts | null>(null)

  useEffect(() => {
    api.counts().then(setCounts).catch(() => {})
  }, [location.key])

  const activeIndex = STEPS.findIndex((s) => s.match.some((m) => location.pathname.startsWith(m)))

  return (
    <div className="mb-8 flex items-center gap-1 overflow-x-auto">
      {STEPS.map((step, i) => {
        const n = counts ? step.count(counts) : 0
        const isActive = i === activeIndex
        return (
          <div key={step.key} className="flex items-center gap-1">
            {i > 0 && <span className="px-1 text-neutral-700">→</span>}
            <Link
              to={step.to}
              title={step.hint}
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm whitespace-nowrap ${
                isActive
                  ? 'border-wing-500 bg-wing-950/40 text-white'
                  : 'border-transparent text-neutral-400 hover:text-white'
              }`}
            >
              {step.label}
              {n > 0 && (
                <span
                  className={`rounded-full px-1.5 text-xs font-semibold tabular-nums ${
                    isActive ? 'bg-wing-500 text-white' : 'bg-neutral-800 text-neutral-300'
                  }`}
                >
                  {n}
                </span>
              )}
            </Link>
          </div>
        )
      })}
      {counts && (counts.drafts.posted ?? 0) > 0 && (
        <span className="ml-3 whitespace-nowrap text-xs text-neutral-500">
          ✓ {counts.drafts.posted} posted
        </span>
      )}
    </div>
  )
}
