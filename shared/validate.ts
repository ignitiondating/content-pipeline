import { z } from 'zod'
import { SPEC_SCHEMAS, DraftMetaSchema, type AnySpec, type DraftMeta, type Format, FORMATS } from './formats/draft'

export function parseSpec(format: Format, value: unknown): AnySpec {
  return SPEC_SCHEMAS[format].parse(value) as AnySpec
}

export function parseMeta(value: unknown): DraftMeta {
  return DraftMetaSchema.parse(value)
}

export function isFormat(value: string): value is Format {
  return (FORMATS as readonly string[]).includes(value)
}

/** Human-readable zod error for API responses and generation retries. */
export function zodIssues(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')
}
