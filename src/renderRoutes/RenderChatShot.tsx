import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ChatSpec } from '@shared/formats/chat'
import ChatScreen from '../components/chat/ChatScreen'
import { api } from '../lib/api'
import { useReadyFlag } from './useCapture'

/** Capture page for standalone chat screenshots: ?id=<ephemeral shot id>. */
export default function RenderChatShot() {
  const [params] = useSearchParams()
  const [spec, setSpec] = useState<{
    chat: ChatSpec
    mode: 'full' | 'zoom'
    storyImagePath?: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [imageReady, setImageReady] = useState(false)

  const id = params.get('id')
  useEffect(() => {
    if (!id) {
      setError('missing id')
      return
    }
    api
      .chatShot(id)
      .then((r) => setSpec(r.spec))
      .catch((e: Error) => setError(e.message))
  }, [id])

  const storyUrl = spec?.storyImagePath ? `/files/${spec.storyImagePath}` : undefined
  useEffect(() => {
    if (!spec) return
    if (!storyUrl) {
      setImageReady(true)
      return
    }
    const image = new Image()
    image.onload = () => setImageReady(true)
    image.onerror = () => setImageReady(true)
    image.src = storyUrl
  }, [spec, storyUrl])

  useReadyFlag(Boolean(spec) && imageReady)

  if (error) return <div data-capture-page>error: {error}</div>
  if (!spec || !imageReady) return <div data-capture-page />
  return (
    <div data-capture-page>
      <ChatScreen spec={spec.chat} mode={spec.mode} storyImageUrl={storyUrl} />
    </div>
  )
}
