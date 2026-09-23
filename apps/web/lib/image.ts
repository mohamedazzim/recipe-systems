// Photo downscaling for card uploads. The OCR request path is synchronous and
// the raw image is base64-encoded to the vision provider, so a full-resolution
// phone photo (5–10 MB) inflates to ~1.3× that in transit and pushes a single
// upload past the edge proxy's request ceiling (observed: ECONNRESET at ~30s).
//
// Vision models normalize the image themselves — measured image-token counts are
// flat (~1.06k) from 78 KB to 6.6 MB — so shrinking the long edge costs no OCR
// fidelity while cutting the payload by an order of magnitude.

/** Longest-edge cap. Matches the resolution vision providers sample at, so
 *  anything larger is bytes the provider would discard anyway. */
export const IMAGE_MAX_DIMENSION = 1600;

/** JPEG quality for the re-encode — high enough to keep small print legible. */
export const IMAGE_JPEG_QUALITY = 0.85;

/** Below this (and within the dimension cap) the original is sent untouched, so
 *  already-small cards are never re-encoded into a worse copy. */
export const IMAGE_OPTIMIZE_MIN_BYTES = 1_000_000;

const OPTIMIZABLE_TYPES = ['image/jpeg', 'image/png'];

export interface DownscaleOptions {
  maxDimension?: number;
  quality?: number;
  minBytes?: number;
}

/** Scale (width, height) down so the longest edge is at most `max`, preserving
 *  aspect ratio. Returns the input unchanged when already within the cap. */
export function targetDimensions(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest === 0 || longest <= max) return { width, height };
  const scale = max / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Decode a File into an HTMLImageElement, always revoking the object URL. */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image decode failed'));
    };
    image.src = url;
  });
}

/**
 * Downscale a card photo before upload. Returns the ORIGINAL file when:
 *  - the type is not JPEG/PNG,
 *  - the image is already within the dimension cap and under `minBytes`,
 *  - decoding/encoding fails, or the re-encode would not be smaller.
 * Never throws — an optimization failure must never block the upload.
 */
export async function downscaleImage(file: File, opts: DownscaleOptions = {}): Promise<File> {
  const maxDimension = opts.maxDimension ?? IMAGE_MAX_DIMENSION;
  const quality = opts.quality ?? IMAGE_JPEG_QUALITY;
  const minBytes = opts.minBytes ?? IMAGE_OPTIMIZE_MIN_BYTES;

  if (!OPTIMIZABLE_TYPES.includes(file.type)) return file;

  try {
    const image = await loadImage(file);
    const naturalWidth = image.naturalWidth || image.width;
    const naturalHeight = image.naturalHeight || image.height;
    const { width, height } = targetDimensions(naturalWidth, naturalHeight, maxDimension);

    const resized = width !== naturalWidth || height !== naturalHeight;
    if (!resized && file.size <= minBytes) return file;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    );
    if (!blob || blob.size >= file.size) return file;

    const name = `${file.name.replace(/\.[^.]+$/, '')}.jpg`;
    return new File([blob], name, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
