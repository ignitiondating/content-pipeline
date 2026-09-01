import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { getSetting } from '../db/repo'
import { zodIssues } from '../../shared/validate'

export const DEFAULT_MODEL = 'claude-sonnet-5'
export const MODELS = ['claude-sonnet-5', 'claude-fable-5'] as const

let client: Anthropic | null = null

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set — copy .env.example to .env and fill it in')
  }
  client ??= new Anthropic()
  return client
}

export function currentModel(): string {
  return getSetting('model') ?? DEFAULT_MODEL
}

/**
 * Structured generation: forces a single tool whose input_schema is derived
 * from the zod schema, validates the tool input, and retries once with the
 * validation errors appended when the first attempt doesn't parse.
 */
export async function generateStructured<T>(opts: {
  system: string
  user: string
  schema: z.ZodType<T>
  toolName: string
  model?: string
  maxTokens?: number
}): Promise<T> {
  const model = opts.model ?? currentModel()
  const inputSchema = z.toJSONSchema(opts.schema, { target: 'draft-7' }) as Anthropic.Tool.InputSchema

  const attempt = async (extraUser?: string): Promise<T> => {
    const response = await getClient().messages.create({
      model,
      max_tokens: opts.maxTokens ?? 16_000,
      system: opts.system,
      messages: [{ role: 'user', content: extraUser ? `${opts.user}\n\n${extraUser}` : opts.user }],
      tools: [
        {
          name: opts.toolName,
          description: 'Submit the generated content in the required structure.',
          input_schema: inputSchema,
        },
      ],
      tool_choice: { type: 'tool', name: opts.toolName },
    })
    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    )
    if (!toolUse) throw new Error('model returned no tool_use block')
    return opts.schema.parse(toolUse.input)
  }

  try {
    return await attempt()
  } catch (error) {
    if (error instanceof z.ZodError) {
      return attempt(
        `Your previous attempt failed validation with these errors, fix them and resubmit:\n${zodIssues(error)}`,
      )
    }
    throw error
  }
}
