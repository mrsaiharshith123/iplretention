// Canvas-based share-card renderer. Draws pixel-exact layouts for two formats, so nothing is
// cropped or cut off, and works the same on desktop and mobile (no DOM screenshotting).
const NAVY = '#071D35', CSK = '#F9CD05', DEEP = '#123B5D', WHITE = '#FFFFFF', MUTED = '#AAB8C5', RED = '#F2564F'
const FONT = 'Manrope, Inter, Arial, sans-serif'
export const FORMATS = {
  landscape: { w: 1600, h: 1200, file: 'landscape-4x3' },
  story: { w: 1080, h: 1920, file: 'instagram-story' },
}
export const SITE_LABEL = (typeof window !== 'undefined' && window.location?.host) ? window.location.host : 'CSK Retention Predictor 2027'

// Route CSK gallery photos through our own origin (see vercel.json / vite.config.js) so the
// canvas is never tainted by cross-origin pixels.
const GALLERY = 'https://gallery.chennaisuperkings.com/PROD/TEAM/'
function candidates(url) {
  if (!url) return []
  const list = []
  if (url.startsWith(GALLERY)) list.push('/cskimg/' + url.slice(GALLERY.length))
  list.push(url)
  return list
}
function loadImg(src, cors) {
  return new Promise(res => {
    const im = new Image()
    if (cors) im.crossOrigin = 'anonymous'
    im.onload = () => res(im.naturalWidth ? im : null)
    im.onerror = () => res(null)
    im.src = src
  })
}
async function loadPhoto(url) {
  for (const c of candidates(url)) {
    const im = await loadImg(c, true)
    if (im) return im
  }
  return null // caller draws an initial avatar instead
}

function fit(ctx, text, weight, size, maxW, minSize = 12) {
  let s = size
  ctx.font = `${weight} ${s}px ${FONT}`
  while (ctx.measureText(text).width > maxW && s > minSize) { s -= 1; ctx.font = `${weight} ${s}px ${FONT}` }
  if (ctx.measureText(text).width > maxW) { // still too long at the minimum size: ellipsize
    let t = text
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1)
    return t + '…'
  }
  return text
}
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
}
function drawPortrait(ctx, img, name, x, y, size, accent) {
  ctx.save(); rr(ctx, x, y, size, size, size * 0.18); ctx.fillStyle = DEEP; ctx.fill(); ctx.clip()
  if (img) {
    const r = Math.min(size / img.naturalWidth, size / img.naturalHeight) * 0.92
    const w = img.naturalWidth * r, h = img.naturalHeight * r
    ctx.drawImage(img, x + (size - w) / 2, y + (size - h) / 2, w, h)
  } else {
    ctx.fillStyle = accent; ctx.font = `800 ${size * 0.5}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText((name || '?')[0].toUpperCase(), x + size / 2, y + size / 2 + size * 0.03)
  }
  ctx.restore()
}
function text(ctx, t, x, y, { size, weight = 600, color = WHITE, align = 'left', base = 'alphabetic', spacing = 0, maxW }) {
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = base
  if ('letterSpacing' in ctx) ctx.letterSpacing = spacing + 'px'
  const out = maxW ? fit(ctx, t, weight, size, maxW) : (ctx.font = `${weight} ${size}px ${FONT}`, t)
  ctx.fillText(out, x, y)
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px'
}
function dot(ctx, x, y, r, color) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill() }

// One list row: portrait + name + role, inside a card.
function row(ctx, p, img, x, y, w, h, accent) {
  ctx.fillStyle = 'rgba(18,59,93,0.55)'; rr(ctx, x, y, w, h, h * 0.18); ctx.fill()
  ctx.fillStyle = accent; ctx.fillRect(x, y + h * 0.14, Math.max(4, h * 0.07), h * 0.72)
  const pad = h * 0.1, ps = h - pad * 2, px = x + pad + Math.max(4, h * 0.07)
  drawPortrait(ctx, img, p.name, px, y + pad, ps, accent)
  const tx = px + ps + h * 0.2, tw = x + w - tx - h * 0.2
  text(ctx, p.name, tx, y + h * 0.46, { size: h * 0.38, weight: 800, maxW: tw })
  text(ctx, (p.role || '').replace(/\s*\(Replacement\)/i, ''), tx, y + h * 0.78, { size: h * 0.28, weight: 600, color: MUTED, maxW: tw })
}

function stat(ctx, label, value, cx, y, big, color) {
  text(ctx, String(value), cx, y, { size: big, weight: 800, color, align: 'center' })
  text(ctx, label, cx, y + big * 0.42, { size: big * 0.26, weight: 700, color: MUTED, align: 'center', spacing: 2 })
}

function bg(ctx, W, H) {
  ctx.fillStyle = NAVY; ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = CSK; ctx.fillRect(0, 0, W, 14)
}

// Lays `items` out in k sub-columns (column-major) inside [x, x+w]; returns nothing.
function grid(ctx, items, imgs, x, y, w, k, rh, accent, rowGap = 8, colGap = 14) {
  const rows = Math.max(1, Math.ceil(items.length / k)), cw = (w - colGap * (k - 1)) / k
  items.forEach((p, i) => {
    const c = Math.floor(i / rows), r = i % rows
    row(ctx, p, imgs.get(p.id), x + c * (cw + colGap), y + r * (rh + rowGap), cw, rh, accent)
  })
}
// Smallest sub-column count (1..maxK) whose rows are at least minRh tall in `avail` px.
function pickK(n, avail, minRh, rowGap, maxK = 3) {
  for (let k = 1; k <= maxK; k++) {
    const rows = Math.max(1, Math.ceil(n / k)), rh = (avail - rowGap * (rows - 1)) / rows
    if (rh >= minRh) return k
  }
  return maxK
}

function drawLandscape(ctx, d, imgs) {
  const W = 1600, H = 1200, M = 56, GAP = 40, RG = 8
  bg(ctx, W, H)
  text(ctx, 'CSK RETENTION PREDICTOR 2027', M, 78, { size: 26, weight: 800, color: CSK, spacing: 4 })
  text(ctx, 'IPL 2027', W - M, 78, { size: 26, weight: 800, color: CSK, align: 'right', spacing: 4 })
  text(ctx, 'MY PREDICTION', M, 160, { size: 84, weight: 800 })
  text(ctx, d.name, W - M, 160, { size: 44, weight: 800, color: CSK, align: 'right', maxW: 760 })
  ctx.fillStyle = DEEP; ctx.fillRect(M, 190, W - M * 2, 3)

  const top = 218, bottom = 1000, listTop = top + 66, avail = bottom - listTop
  const kr = pickK(d.retained.length, avail, 62, RG), kl = pickK(d.released.length, avail, 62, RG)
  const rowsMax = Math.max(1, Math.ceil(d.retained.length / kr), Math.ceil(d.released.length / kl))
  const rh = Math.min(86, Math.floor((avail - RG * (rowsMax - 1)) / rowsMax))
  const totalW = W - M * 2 - GAP, unit = totalW / (kr + kl)
  const cols = [
    { title: 'RETAINED', color: CSK, items: d.retained, k: kr, x: M, w: unit * kr },
    { title: 'RELEASED', color: RED, items: d.released, k: kl, x: M + unit * kr + GAP, w: unit * kl },
  ]
  for (const c of cols) {
    dot(ctx, c.x + 14, top + 22, 14, c.color)
    text(ctx, c.title, c.x + 42, top + 34, { size: 38, weight: 800, color: c.color, spacing: 3 })
    text(ctx, String(c.items.length), c.x + c.w, top + 34, { size: 38, weight: 800, color: c.color, align: 'right' })
    ctx.fillStyle = c.color; ctx.fillRect(c.x, top + 50, c.w, 3)
    if (c.items.length) grid(ctx, c.items, imgs, c.x, listTop, c.w, c.k, rh, c.color, RG)
    else text(ctx, 'None', c.x + 8, listTop + 40, { size: 28, color: MUTED })
  }

  const fy = 1030
  ctx.fillStyle = DEEP; ctx.fillRect(M, fy, W - M * 2, 3)
  const sy = fy + 82
  stat(ctx, 'RETAINED', d.retained.length, 190, sy, 62, CSK)
  stat(ctx, 'RELEASED', d.released.length, 450, sy, 62, RED)
  stat(ctx, 'TOTAL PLAYERS', d.retained.length + d.released.length, 740, sy, 62, WHITE)
  text(ctx, "WHAT'S YOUR PREDICTION?", W - M, sy - 4, { size: 40, weight: 800, color: CSK, align: 'right' })
  text(ctx, SITE_LABEL, W - M, sy + 38, { size: 28, weight: 700, align: 'right', maxW: 640 })
  text(ctx, 'Fan-made. Not an official CSK or IPL product.', W / 2, H - 26, { size: 18, weight: 600, color: MUTED, align: 'center' })
}

function drawStory(ctx, d, imgs) {
  const W = 1080, H = 1920, M = 52, RG = 6
  // Instagram UI covers roughly the top 250px and bottom 250px of a Story; all content stays inside.
  const SAFE_T = 250, SAFE_B = H - 270
  bg(ctx, W, H)
  text(ctx, 'CSK RETENTION PREDICTOR 2027  ·  IPL 2027', W / 2, SAFE_T + 14, { size: 25, weight: 800, color: CSK, align: 'center', spacing: 2, maxW: W - M * 2 })
  text(ctx, 'MY PREDICTION', W / 2, SAFE_T + 90, { size: 72, weight: 800, align: 'center', maxW: W - M * 2 })
  text(ctx, d.name, W / 2, SAFE_T + 140, { size: 38, weight: 800, color: CSK, align: 'center', maxW: W - M * 2 })

  const footH = 190, headH = 54, secGap = 22
  const top = SAFE_T + 168, bottomLimit = SAFE_B - footH
  const rowsTotal = Math.max(1, Math.ceil(d.retained.length / 2)) + Math.max(1, Math.ceil(d.released.length / 2))
  const availRows = bottomLimit - top - headH * 2 - secGap - RG * (rowsTotal - 2)
  const rh = Math.max(40, Math.min(78, Math.floor(availRows / rowsTotal)))
  let y = top
  for (const c of [{ title: 'RETAINED', color: CSK, items: d.retained }, { title: 'RELEASED', color: RED, items: d.released }]) {
    dot(ctx, M + 14, y + 22, 13, c.color)
    text(ctx, c.title, M + 40, y + 34, { size: 34, weight: 800, color: c.color, spacing: 3 })
    text(ctx, String(c.items.length), W - M, y + 34, { size: 34, weight: 800, color: c.color, align: 'right' })
    ctx.fillStyle = c.color; ctx.fillRect(M, y + 46, W - M * 2, 3)
    y += headH
    if (c.items.length) { grid(ctx, c.items, imgs, M, y, W - M * 2, 2, rh, c.color, RG, 12); y += Math.ceil(c.items.length / 2) * (rh + RG) - RG }
    else { text(ctx, 'None', M + 8, y + 30, { size: 26, color: MUTED }); y += 44 }
    y += secGap
  }
  const sy = SAFE_B - 70
  ctx.fillStyle = DEEP; ctx.fillRect(M, SAFE_B - footH + 6, W - M * 2, 3)
  stat(ctx, 'RETAINED', d.retained.length, W * 0.2, sy - 24, 50, CSK)
  stat(ctx, 'RELEASED', d.released.length, W * 0.5, sy - 24, 50, RED)
  stat(ctx, 'TOTAL', d.retained.length + d.released.length, W * 0.8, sy - 24, 50, WHITE)
  text(ctx, "WHAT'S YOUR PREDICTION?", W / 2, SAFE_B - 6, { size: 34, weight: 800, color: CSK, align: 'center' })
  text(ctx, SITE_LABEL, W / 2, SAFE_B + 32, { size: 26, weight: 700, align: 'center', maxW: W - M * 2 })
}

/** data = { name, retained: [{id,name,role,photo_url}], released: [...] } */
export async function renderCard(format, data) {
  const f = FORMATS[format]
  try { await Promise.all(['400', '600', '700', '800'].map(w => document.fonts.load(`${w} 24px Manrope`))); await document.fonts.ready } catch { /* fall back to system font */ }
  const all = [...data.retained, ...data.released]
  const imgs = new Map()
  await Promise.all(all.map(async p => imgs.set(p.id, await loadPhoto(p.photo_url))))
  const canvas = document.createElement('canvas'); canvas.width = f.w; canvas.height = f.h
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ;(format === 'story' ? drawStory : drawLandscape)(ctx, data, imgs)
  const blob = await new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('Image generation failed')), 'image/png'))
  return blob
}

export function fileName(format, name) {
  const slug = (name || 'fan').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'fan'
  return `csk-prediction-${slug}-${FORMATS[format].file}.png`
}
export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a')
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
export async function shareBlob(blob, name) {
  const file = new File([blob], name, { type: 'image/png' })
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'My CSK Retention Prediction 2027', text: "What's your prediction?" }); return 'shared' }
    catch (e) { if (e?.name === 'AbortError') return 'cancelled'; /* else fall through to download */ }
  }
  downloadBlob(blob, name); return 'downloaded'
}
