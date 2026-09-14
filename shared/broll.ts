/**
 * B-roll is organized in two dimensions, both read straight off the path:
 * `library/broll/<tag>/<role>/clip.mp4`. The tag is the look (basketball,
 * 3d); the role is where in the video a clip belongs.
 *
 * Felipe's note from testing: the opening shot and the plays between messages
 * do different jobs, and mixing them makes every video feel the same. Files
 * dropped straight into the tag folder stay 'beats', so nothing that already
 * exists has to move.
 */
export const BROLL_ROLES = ['intro', 'beats', 'outro'] as const
export type BrollRole = (typeof BROLL_ROLES)[number]

export const DEFAULT_BROLL_ROLE: BrollRole = 'beats'

export const BROLL_ROLE_LABELS: Record<BrollRole, string> = {
  intro: 'Opening',
  beats: 'Between messages',
  outro: 'Closing',
}

const isRole = (value: string | undefined): value is BrollRole =>
  BROLL_ROLES.includes(value as BrollRole)

/** The folder a clip sits in, or 'beats' when it sits loose in the tag folder. */
export function roleOfPath(path: string): BrollRole {
  const parts = path.replaceAll('\\', '/').split('/')
  const at = parts.indexOf('broll')
  if (at < 0) return DEFAULT_BROLL_ROLE
  const candidate = parts[at + 2]
  // Only a folder counts: there has to be a filename after it.
  return isRole(candidate) && parts.length > at + 3 ? candidate : DEFAULT_BROLL_ROLE
}

/** Splits a clip list into its three pools, each keeping the given order. */
export function byRole(paths: string[]): Record<BrollRole, string[]> {
  const pools: Record<BrollRole, string[]> = { intro: [], beats: [], outro: [] }
  for (const path of paths) pools[roleOfPath(path)].push(path)
  return pools
}
