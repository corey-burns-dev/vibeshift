/**
 * Avatar crop/resize helper. Produces a square image at AVATAR_CROP_SIZE for profile avatars.
 */

export const AVATAR_CROP_SIZE = 256

export type PixelCrop = {
  x: number
  y: number
  width: number
  height: number
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', e => reject(e))
    image.src = url
  })
}

/**
 * Crops and resizes the image at imageSrc to the given pixel area, then outputs
 * a square image of size outputSize x outputSize as a JPEG File.
 */
export async function getCroppedImageFile(
  imageSrc: string,
  pixelCrop: PixelCrop,
  outputSize: number = AVATAR_CROP_SIZE
): Promise<File> {
  const image = await loadImage(imageSrc)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2d context not available')

  canvas.width = outputSize
  canvas.height = outputSize

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outputSize,
    outputSize
  )

  const blob = await new Promise<Blob | null>(resolve => {
    canvas.toBlob(resolve, 'image/jpeg', 0.9)
  })
  if (!blob) throw new Error('Failed to create image blob')

  return new File([blob], 'avatar.jpg', { type: 'image/jpeg' })
}
