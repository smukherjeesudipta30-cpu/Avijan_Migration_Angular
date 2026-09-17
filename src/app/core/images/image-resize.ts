/**
 * Shrinks an image client-side until it fits under a byte limit, so a real
 * phone-camera photo (routinely 2-8 MB) doesn't just bounce off the server's
 * size cap with nothing the person can do about it short of finding a
 * separate compression tool. Re-encodes as JPEG via a canvas: first by
 * scaling down the pixel dimensions if they're larger than needed for a
 * student photo, then by stepping down JPEG quality, until the result is
 * under the limit or quality bottoms out.
 *
 * GIFs are passed through untouched — canvas re-encoding only ever captures
 * a single frame, which would silently turn an animated GIF into a static
 * JPEG. A GIF that is already too large still hits the plain size error.
 */
export async function resizeImageToLimit(
  file: File,
  maxBytes: number,
  maxDimension = 1200
): Promise<File> {
  if (file.type === 'image/gif' || file.size <= maxBytes) {
    return file;
  }

  const bitmap = await loadImage(file);

  try {
    let width = bitmap.width;
    let height = bitmap.height;

    if (width > maxDimension || height > maxDimension) {
      const scale = maxDimension / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    ctx.drawImage(bitmap, 0, 0, width, height);

    // Quality first, since it costs no visible sharpness loss until well
    // below 0.5; dimensions shrink further only if quality alone can't get
    // there, which mainly happens on an unusually large or busy image.
    for (const quality of [0.85, 0.7, 0.55, 0.4]) {
      const blob = await canvasToBlob(canvas, quality);
      if (blob && blob.size <= maxBytes) {
        return blobToFile(blob, file.name);
      }
    }

    // Quality alone wasn't enough — halve the dimensions once and try again
    // at a mid quality. One more pass is deliberately the ceiling: beyond
    // this the photo is no longer recognisable as the point of the upload.
    canvas.width = Math.round(width / 2);
    canvas.height = Math.round(height / 2);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const finalBlob = await canvasToBlob(canvas, 0.6);
    return finalBlob && finalBlob.size <= maxBytes ? blobToFile(finalBlob, file.name) : file;
  } finally {
    bitmap.close();
  }
}

function loadImage(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file);
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
}

function blobToFile(blob: Blob, originalName: string): File {
  const stem = originalName.replace(/\.[^.]+$/, '');
  return new File([blob], `${stem}.jpg`, { type: 'image/jpeg' });
}
