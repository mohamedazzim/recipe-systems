import {
  downscaleImage,
  targetDimensions,
  IMAGE_MAX_DIMENSION,
} from '@/lib/image';

describe('targetDimensions', () => {
  it('scales the longest edge down to the cap, preserving aspect ratio', () => {
    expect(targetDimensions(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(targetDimensions(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it('returns the input unchanged when already within the cap', () => {
    expect(targetDimensions(1600, 900, 1600)).toEqual({ width: 1600, height: 900 });
    expect(targetDimensions(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it('never returns a zero dimension and tolerates a zero input', () => {
    expect(targetDimensions(0, 0, 1600)).toEqual({ width: 0, height: 0 });
    expect(targetDimensions(4000, 10, 1600)).toEqual({ width: 1600, height: 4 });
  });
});

describe('downscaleImage', () => {
  const realImage = global.Image;
  const realCreateObjectURL = URL.createObjectURL;
  const realRevokeObjectURL = URL.revokeObjectURL;

  afterEach(() => {
    global.Image = realImage;
    URL.createObjectURL = realCreateObjectURL;
    URL.revokeObjectURL = realRevokeObjectURL;
  });

  it('returns the original file for a non-optimizable type', async () => {
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' });
    await expect(downscaleImage(file)).resolves.toBe(file);
  });

  it('skips an image that is already small and within the dimension cap', async () => {
    URL.createObjectURL = (() => 'blob:fake') as typeof URL.createObjectURL;
    URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL;
    global.Image = class {
      naturalWidth = 1200;
      naturalHeight = 900;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    } as unknown as typeof Image;

    const file = new File(['small'], 'card.jpg', { type: 'image/jpeg' });
    await expect(downscaleImage(file)).resolves.toBe(file);
  });

  it('falls back to the original file when the image cannot be decoded', async () => {
    URL.createObjectURL = (() => 'blob:fake') as typeof URL.createObjectURL;
    URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL;
    global.Image = class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    } as unknown as typeof Image;

    const file = new File(['x'], 'card.jpg', { type: 'image/jpeg' });
    await expect(downscaleImage(file)).resolves.toBe(file);
  });

  it('uses a sensible default long-edge cap', () => {
    expect(IMAGE_MAX_DIMENSION).toBe(1600);
  });
});
