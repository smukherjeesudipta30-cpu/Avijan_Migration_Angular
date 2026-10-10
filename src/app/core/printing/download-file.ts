import { environment } from '../../../environments/environment';

/**
 * Saves a file the page made itself — a PDF, a CSV, a downloaded attachment.
 *
 * On a computer that is an ordinary <c>blob:</c> link. Phone browsers such as
 * Samsung Internet refuse those ("Only http or https URLs can be downloaded"),
 * so on a phone the file is handed to the server for five minutes and fetched
 * back from a normal https address instead (DownloadsController). Should that
 * fail for any reason, the ordinary link is still tried.
 */
export async function downloadBlob(blob: Blob, fileName: string): Promise<void> {
  if (isPhoneBrowser()) {
    try {
      const response = await fetch(`${environment.apiBaseUrl}/downloads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName,
          contentType: blob.type || 'application/octet-stream',
          base64: await toBase64(blob)
        })
      });
      const body = await response.json().catch(() => null);
      if (response.ok && body?.data) {
        window.location.href = `${environment.apiBaseUrl}/downloads/${body.data}`;
        return;
      }
    } catch {
      // Fall through to the ordinary link below.
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  // Attached, and the URL kept alive a moment: some browsers ignore a click on
  // a detached link, and revoking straight after the click can cancel it.
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 30_000);
}

/** A data: URL (a picture drawn on a canvas) saved the same way. */
export async function downloadDataUrl(dataUrl: string, fileName: string): Promise<void> {
  const blob = await (await fetch(dataUrl)).blob();
  await downloadBlob(blob, fileName);
}

function isPhoneBrowser(): boolean {
  return typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|SamsungBrowser|Mobile/i.test(navigator.userAgent);
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
