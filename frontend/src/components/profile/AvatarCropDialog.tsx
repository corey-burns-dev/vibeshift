import { useCallback, useState } from 'react'
import type { Area, Point } from 'react-easy-crop'
import Cropper from 'react-easy-crop'
import 'react-easy-crop/react-easy-crop.css'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AVATAR_CROP_SIZE,
  getCroppedImageFile,
  type PixelCrop,
} from '@/lib/cropImage'

export interface AvatarCropDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  imageSource: string
  onConfirm: (croppedFile: File) => void
  onCancel?: () => void
}

export function AvatarCropDialog({
  open,
  onOpenChange,
  imageSource,
  onConfirm,
  onCancel,
}: AvatarCropDialogProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const handleCropChange = useCallback((_croppedArea: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels)
  }, [])

  const handleCropComplete = useCallback((_croppedArea: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels)
  }, [])

  const handleConfirm = useCallback(async () => {
    if (!croppedAreaPixels) return
    setIsProcessing(true)
    try {
      const pixelCrop: PixelCrop = {
        x: Math.round(croppedAreaPixels.x),
        y: Math.round(croppedAreaPixels.y),
        width: Math.round(croppedAreaPixels.width),
        height: Math.round(croppedAreaPixels.height),
      }
      const file = await getCroppedImageFile(
        imageSource,
        pixelCrop,
        AVATAR_CROP_SIZE
      )
      onConfirm(file)
      onOpenChange(false)
    } catch (err) {
      console.error('Failed to crop image:', err)
    } finally {
      setIsProcessing(false)
    }
  }, [imageSource, croppedAreaPixels, onConfirm, onOpenChange])

  const handleCancel = useCallback(() => {
    onCancel?.()
    onOpenChange(false)
  }, [onCancel, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-md' aria-describedby='avatar-crop-desc'>
        <DialogHeader>
          <DialogTitle>Crop your avatar</DialogTitle>
          <DialogDescription id='avatar-crop-desc'>
            Adjust the crop area. The image will be resized to{' '}
            {AVATAR_CROP_SIZE}×{AVATAR_CROP_SIZE} for your profile picture.
          </DialogDescription>
        </DialogHeader>
        <div className='relative h-72 w-full overflow-hidden rounded-lg bg-muted'>
          <Cropper
            image={imageSource}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape='round'
            showGrid={false}
            style={{
              containerStyle: { backgroundColor: 'var(--muted)' },
              mediaStyle: {},
              cropAreaStyle: {},
            }}
            classes={{
              containerClassName: 'rounded-lg',
              mediaClassName: '',
              cropAreaClassName: '',
            }}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropAreaChange={handleCropChange}
            onCropComplete={handleCropComplete}
            restrictPosition
            mediaProps={{}}
            cropperProps={{}}
            zoomSpeed={1}
            minZoom={1}
            maxZoom={3}
            rotation={0}
            keyboardStep={0.1}
          />
        </div>
        <DialogFooter>
          <Button type='button' variant='outline' onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            type='button'
            onClick={handleConfirm}
            disabled={!croppedAreaPixels || isProcessing}
          >
            {isProcessing ? 'Processing…' : 'Use photo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
