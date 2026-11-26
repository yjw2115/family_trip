// 사진 줄이기 · 촬영일 읽기 · 올리기
import { sb, fullKey, thumbKey } from './common.js';

const FULL = 1600, THUMB_SHORT = 600, Q_FULL = 0.8, Q_THUMB = 0.75;

// JPEG 안의 EXIF 촬영일(DateTimeOriginal)을 'YYYY-MM-DDTHH:MM:SS'로. 없으면 null.
export function exifDate(buf) {
  const v = new DataView(buf);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xFFD8) return null;
  let off = 2;
  while (off + 4 <= v.byteLength) {
    const marker = v.getUint16(off), len = v.getUint16(off + 2);
    if (marker === 0xFFE1 && v.getUint32(off + 4) === 0x45786966) { // "Exif"
      const t = off + 10, le = v.getUint16(t) === 0x4949;
      const u16 = o => v.getUint16(t + o, le), u32 = o => v.getUint32(t + o, le);
      const find = (ifd, tag) => {
        if (t + ifd + 2 > v.byteLength) return null;
        const n = u16(ifd);
        for (let i = 0; i < n; i++) {
          const e = ifd + 2 + i * 12;
          if (t + e + 12 > v.byteLength) return null;
          if (u16(e) === tag) return e;
        }
        return null;
      };
      const str = e => {
        const o = t + u32(e + 8);
        if (o + 19 > v.byteLength) return null;
        let s = '';
        for (let i = 0; i < 19; i++) s += String.fromCharCode(v.getUint8(o + i));
        const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(s);
        return m && m[1] !== '0000' ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}` : null;
      };
      const ifd0 = u32(4), exifPtr = find(ifd0, 0x8769);
      const orig = exifPtr && find(u32(exifPtr + 8), 0x9003);
      if (orig) return str(orig);
      const dt = find(ifd0, 0x0132);
      return dt ? str(dt) : null;
    }
    if ((marker & 0xFF00) !== 0xFF00 || marker === 0xFFDA) break;
    off += 2 + len;
  }
  return null;
}

const localNow = () => new Date().toLocaleString('sv-SE').replace(' ', 'T');

function toJpeg(bmp, w, h, sx, sy, sw, sh, q) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(bmp, sx, sy, sw, sh, 0, 0, w, h);
  return new Promise((ok, bad) => c.toBlob(b => b ? ok(b) : bad(new Error('jpeg')), 'image/jpeg', q));
}

// 파일 1장 → { full, thumb, width, height, takenAt }
export async function prepare(file) {
  const head = await file.slice(0, 256 * 1024).arrayBuffer();
  const bmp = await createImageBitmap(file); // 휴대폰 사진 회전(EXIF)을 반영해 연다
  const s = Math.min(1, FULL / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
  const ts = Math.min(1, THUMB_SHORT / Math.min(bmp.width, bmp.height));
  const full = await toJpeg(bmp, w, h, 0, 0, bmp.width, bmp.height, Q_FULL);
  const thumb = await toJpeg(bmp, Math.round(bmp.width * ts), Math.round(bmp.height * ts), 0, 0, bmp.width, bmp.height, Q_THUMB);
  bmp.close();
  return { full, thumb, width: w, height: h, takenAt: exifDate(head) || localNow() };
}

export class QuotaError extends Error {}

// 1장 올리기. 실패하면 올린 파일을 되돌린다.
export async function upload(eventId, file, uploader) {
  const p = await prepare(file);
  const path = crypto.randomUUID();
  const bucket = sb.storage.from('photos');
  const opt = { contentType: 'image/jpeg', cacheControl: '31536000' };
  const a = await bucket.upload(fullKey(path), p.full, opt);
  if (a.error) throw /row-level security|policy|Unauthorized/i.test(a.error.message) ? new QuotaError() : a.error;
  const b = await bucket.upload(thumbKey(path), p.thumb, opt);
  const row = b.error ? b : await sb.from('photos').insert({
    event_id: eventId, path, taken_at: p.takenAt, uploader,
    width: p.width, height: p.height, bytes: p.full.size + p.thumb.size,
  });
  if (row.error) {
    await bucket.remove([fullKey(path), thumbKey(path)]);
    throw /row-level security|policy/i.test(row.error.message) && b.error ? new QuotaError() : row.error;
  }
}
