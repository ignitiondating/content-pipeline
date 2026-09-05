import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import WingPromoShot, { type WingPromoShotSpec } from '../components/promo/WingPromoShot'
import { api } from '../lib/api'
import { useReadyFlag } from './useCapture'

/** Capture page for WingAI promo screenshots: ?id=<ephemeral shot id>. */
export default function RenderPromoShot() {
  const [params] = useSearchParams()
  const [spec, setSpec] = useState<(WingPromoShotSpec & { imagePath?: string }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [imageReady, setImageReady] = useState(false)

  const id = params.get('id')
  useEffect(() => {
    if (!id) {
      setError('missing id')
      return
    }
    api
      .promoShot(id)
      .then((r) => setSpec(r.spec))
      .catch((e: Error) => setError(e.message))
  }, [id])

  const imageUrl = spec?.imagePath ? `/files/${spec.imagePath}` : undefined
  useEffect(() => {
    if (!spec) return
    if (!imageUrl) {
      setImageReady(true)
      return
    }
    const image = new Image()
    image.onload = () => setImageReady(true)
    image.onerror = () => setImageReady(true)
    image.src = imageUrl
  }, [spec, imageUrl])

  useReadyFlag(Boolean(spec) && imageReady)

  if (error) return <div data-capture-page>error: {error}</div>
  if (!spec || !imageReady) return <div data-capture-page />
  return (
    <div data-capture-page>
      <WingPromoShot spec={{ ...spec, imageUrl }} />
    </div>
  )
}
