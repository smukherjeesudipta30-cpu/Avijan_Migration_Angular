/**
 * The birthday wish card, drawn on a canvas so it can be saved or shared as a
 * picture (WhatsApp takes an image, not a web page). 1080 × 1350 — the portrait
 * size WhatsApp and Instagram show without cropping.
 */
export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

export interface CardInput {
  name: string;
  kind: string;
  turningAge: number | null;
  date: Date;
  photo: HTMLImageElement | null;
  logo: HTMLImageElement | null;
  /** Seeds the confetti so the same person always gets the same card. */
  seed: string;
}

export function drawBirthdayCard(canvas: HTMLCanvasElement, c: CardInput): void {
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const g = canvas.getContext('2d')!;
  const W = CARD_WIDTH, H = CARD_HEIGHT, cx = W / 2;
  const rand = seeded(c.seed);

  // Night-sky gradient, rose to deep violet.
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#ff5f8f');
  bg.addColorStop(0.45, '#8e2de2');
  bg.addColorStop(1, '#1b1446');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  // Soft glow behind the photo.
  const glow = g.createRadialGradient(cx, 520, 40, cx, 520, 520);
  glow.addColorStop(0, 'rgba(255,255,255,0.35)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);

  // Confetti.
  const colours = ['#ffd166', '#06d6a0', '#ffffff', '#ff9ec7', '#7bdff2', '#f9c74f'];
  for (let i = 0; i < 140; i++) {
    g.save();
    g.translate(rand() * W, rand() * H);
    g.rotate(rand() * Math.PI);
    g.globalAlpha = 0.45 + rand() * 0.5;
    g.fillStyle = colours[i % colours.length];
    if (i % 3 === 0) { g.beginPath(); g.arc(0, 0, 4 + rand() * 6, 0, Math.PI * 2); g.fill(); }
    else g.fillRect(-9, -4, 18, 8);
    g.restore();
  }

  // Balloons in the top corners.
  balloon(g, 140, 250, 78, '#ffd166');
  balloon(g, 250, 180, 64, '#06d6a0');
  balloon(g, W - 140, 250, 78, '#ff9ec7');
  balloon(g, W - 250, 180, 64, '#7bdff2');

  // Heading.
  g.textAlign = 'center';
  g.fillStyle = '#ffffff';
  g.font = '600 42px Georgia, "Times New Roman", serif';
  g.fillText('✦  Wishing you a very  ✦', cx, 130);
  const gold = g.createLinearGradient(cx - 380, 0, cx + 380, 0);
  gold.addColorStop(0, '#f6d365');
  gold.addColorStop(0.5, '#fff3c4');
  gold.addColorStop(1, '#f6a14b');
  g.fillStyle = gold;
  g.shadowColor = 'rgba(0,0,0,0.35)';
  g.shadowBlur = 18;
  g.font = 'italic 700 118px Georgia, "Times New Roman", serif';
  g.fillText('Happy Birthday', cx, 260);
  g.shadowBlur = 0;

  // Photo (or initials) in a gold ring.
  const r = 190, py = 560;
  g.beginPath(); g.arc(cx, py, r + 16, 0, Math.PI * 2); g.fillStyle = gold; g.fill();
  g.beginPath(); g.arc(cx, py, r + 6, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
  g.save();
  g.beginPath(); g.arc(cx, py, r, 0, Math.PI * 2); g.clip();
  if (c.photo) {
    const s = Math.max((2 * r) / c.photo.width, (2 * r) / c.photo.height);
    const w = c.photo.width * s, h = c.photo.height * s;
    g.drawImage(c.photo, cx - w / 2, py - h / 2, w, h);
  } else {
    const fill = g.createLinearGradient(cx - r, py - r, cx + r, py + r);
    fill.addColorStop(0, '#ff9ec7'); fill.addColorStop(1, '#8e2de2');
    g.fillStyle = fill; g.fillRect(cx - r, py - r, 2 * r, 2 * r);
    g.fillStyle = '#ffffff';
    g.font = '700 150px Georgia, serif';
    g.textBaseline = 'middle';
    g.fillText(initials(c.name), cx, py + 8);
    g.textBaseline = 'alphabetic';
  }
  g.restore();

  // Age badge.
  if (c.turningAge && c.turningAge > 0 && c.turningAge < 120) {
    const bx = cx + 150, by = py + 140;
    g.beginPath(); g.arc(bx, by, 62, 0, Math.PI * 2); g.fillStyle = '#ffd166'; g.fill();
    g.lineWidth = 6; g.strokeStyle = '#ffffff'; g.stroke();
    g.fillStyle = '#5a189a';
    g.font = '800 54px Arial, sans-serif';
    g.fillText(String(c.turningAge), bx, by + 12);
    g.font = '700 20px Arial, sans-serif';
    g.fillText(ordinalSuffix(c.turningAge), bx, by + 38);
  }

  // Name and role.
  g.fillStyle = '#ffffff';
  g.font = '700 ' + fitFont(g, c.name, 76, W - 140) + 'px Georgia, serif';
  g.fillText(c.name, cx, 870);
  g.font = '600 34px Arial, sans-serif';
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.fillText(`${c.kind} · Avijan`, cx, 925);

  // Message.
  g.fillStyle = '#ffffff';
  g.font = 'italic 38px Georgia, serif';
  ['May this year bring you success, good health', 'and endless reasons to smile.']
    .forEach((line, i) => g.fillText(line, cx, 1020 + i * 54));

  // Cake row and footer.
  g.font = '64px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
  g.fillText('🎂  🎉  🎁', cx, 1180);

  g.fillStyle = 'rgba(255,255,255,0.92)';
  roundRect(g, cx - 300, 1225, 600, 90, 45); g.fill();
  if (c.logo) {
    const lh = 54, lw = (c.logo.width / c.logo.height) * lh;
    g.drawImage(c.logo, cx - 270, 1243, lw, lh);
    g.fillStyle = '#5a189a';
    g.textAlign = 'right';
    g.font = '600 28px Arial, sans-serif';
    g.fillText('With love, Team Avijan', cx + 270, 1280);
    g.textAlign = 'center';
  } else {
    g.fillStyle = '#5a189a';
    g.font = '600 32px Arial, sans-serif';
    g.fillText('With love, Team Avijan', cx, 1282);
  }
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.font = '22px Arial, sans-serif';
  g.fillText(c.date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }), cx, 1340 - 4);
}

/** The message sent along with the card on WhatsApp. */
export function wishText(name: string): string {
  const first = (name || '').trim().split(/\s+/)[0] || 'there';
  return `Dear ${first}, wishing you a very Happy Birthday! 🎂🎉\n` +
    `May this year bring you success, good health and lots of happiness.\n\n— With love, Team Avijan`;
}

/** wa.me wants the number with country code and digits only; 10-digit numbers are Indian. */
export function whatsAppUrl(phone: string | null, text: string): string {
  let digits = (phone || '').replace(/\D/g, '');
  if (digits.startsWith('0')) digits = digits.replace(/^0+/, '');
  if (digits.length === 10) digits = '91' + digits;
  const msg = encodeURIComponent(text);
  return digits.length >= 11 ? `https://wa.me/${digits}?text=${msg}` : `https://wa.me/?text=${msg}`;
}

export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function balloon(g: CanvasRenderingContext2D, x: number, y: number, r: number, colour: string): void {
  g.save();
  g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(x, y + r * 1.15);
  g.bezierCurveTo(x - 20, y + r * 1.6, x + 20, y + r * 2, x, y + r * 2.6); g.stroke();
  const fill = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.2);
  fill.addColorStop(0, '#ffffff'); fill.addColorStop(0.25, colour); fill.addColorStop(1, shade(colour));
  g.fillStyle = fill;
  g.beginPath(); g.ellipse(x, y, r * 0.85, r * 1.05, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(x - 8, y + r * 1.15); g.lineTo(x + 8, y + r * 1.15); g.lineTo(x, y + r * 1.02); g.fill();
  g.restore();
}

function shade(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.round(v * 0.62));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

function fitFont(g: CanvasRenderingContext2D, text: string, size: number, max: number): number {
  for (; size > 36; size -= 2) {
    g.font = `700 ${size}px Georgia, serif`;
    if (g.measureText(text).width <= max) break;
  }
  return size;
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?';
}

function ordinalSuffix(n: number): string {
  const v = n % 100;
  return v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
}

function seeded(seed: string): () => number {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}
