import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.2/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
export const $ = (sel, el = document) => el.querySelector(sel);

// 로그인 안 된 기기는 암호 화면으로
export async function requireLogin() {
  const { data } = await sb.auth.getSession();
  if (!data.session) {
    location.replace('login.html?next=' + encodeURIComponent(location.pathname + location.search + location.hash));
    throw new Error('login required');
  }
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---- 날짜 ----
const WD = '일월화수목금토';
export const today = () => new Date().toLocaleDateString('sv-SE'); // 기기 시간 기준 YYYY-MM-DD
const parts = s => { const [y, m, d] = s.split('-').map(Number); return { y, m, d, w: WD[new Date(y, m - 1, d).getDay()] }; };

export function fmtDate(s) {
  const a = parts(s);
  return `${a.y}년 ${a.m}월 ${a.d}일 (${a.w})`;
}
export function fmtRange(s, e) {
  if (!e || e === s) return fmtDate(s);
  const a = parts(s), b = parts(e);
  if (a.y !== b.y) return `${a.y}년 ${a.m}월 ${a.d}일(${a.w}) ~ ${b.y}년 ${b.m}월 ${b.d}일(${b.w})`;
  return `${a.y}년 ${a.m}월 ${a.d}일(${a.w}) ~ ${a.m === b.m ? '' : b.m + '월 '}${b.d}일(${b.w})`;
}
export function fmtShort(s) { const a = parts(s); return `${a.m}월 ${a.d}일 (${a.w})`; }
const dayNum = s => Date.UTC(...s.split('-').map((v, i) => i === 1 ? v - 1 : +v)) / 864e5;
// 다가오면 'D-12', 오늘이면 '오늘', 기간 중이면 '여행 중', 지났으면 ''
export function dday(ev) {
  const t = today(), end = ev.end_date || ev.start_date;
  if (t < ev.start_date) return 'D-' + (dayNum(ev.start_date) - dayNum(t));
  if (t <= end) return ev.start_date === end ? '오늘' : '여행 중';
  return '';
}
export const isUpcoming = ev => (ev.end_date || ev.start_date) >= today();

// ---- 사진 주소 (서명 URL을 7일 동안 기억해서 브라우저 캐시를 살린다) ----
const WEEK = 7 * 864e5;
export const thumbKey = p => `thumb/${p}.jpg`;
export const fullKey = p => `full/${p}.jpg`;
export async function photoUrls(keys) {
  const now = Date.now(), out = {}, missing = [];
  for (const k of new Set(keys)) {
    const c = JSON.parse(localStorage.getItem('u:' + k) || 'null');
    if (c && c.exp - now > 864e5) out[k] = c.url; else missing.push(k);
  }
  for (let i = 0; i < missing.length; i += 100) {
    const { data, error } = await sb.storage.from('photos').createSignedUrls(missing.slice(i, i + 100), WEEK / 1000);
    if (error) throw error;
    for (const r of data) {
      if (!r.signedUrl) continue;
      out[r.path] = r.signedUrl;
      // ponytail: 지운 사진 주소도 남지만 장당 300바이트라 정리하지 않음
      try { localStorage.setItem('u:' + r.path, JSON.stringify({ url: r.signedUrl, exp: now + WEEK })); } catch { /* 저장 공간 부족: 기억만 안 함 */ }
    }
  }
  return out;
}

// ---- 휴지통 정리: deleted_at이 cutoff보다 오래된 사진과 모임을 완전히 지운다 ----
async function removePhotos(list) {
  for (let i = 0; i < list.length; i += 100) {
    const part = list.slice(i, i + 100);
    const { error } = await sb.storage.from('photos').remove(part.flatMap(p => [fullKey(p.path), thumbKey(p.path)]));
    if (error) throw error;
    const r = await sb.from('photos').delete().in('id', part.map(p => p.id));
    if (r.error) throw r.error;
  }
}
export async function purge(cutoffIso, limit = 20) {
  const ph = await sb.from('photos').select('id,path').lt('deleted_at', cutoffIso).limit(limit);
  if (ph.error) throw ph.error;
  await removePhotos(ph.data);
  const ev = await sb.from('events').select('id').lt('deleted_at', cutoffIso).limit(5);
  if (ev.error) throw ev.error;
  for (const e of ev.data) {
    const rest = await sb.from('photos').select('id,path').eq('event_id', e.id);
    if (rest.error) throw rest.error;
    await removePhotos(rest.data);
    const r = await sb.from('events').delete().eq('id', e.id);
    if (r.error) throw r.error;
  }
  return ph.data.length + ev.data.length;
}

// ---- 확인 창, 알림 ----
// ask('정말 지울까요?', '지우기', true) → 확인을 누르면 dialog(입력칸 읽기용), 취소면 null
// 확인 버튼을 먼저 둬야 입력칸에서 Enter = 확인. 보이는 순서는 row-reverse로 [취소][확인].
export function ask(message, okLabel = '확인', danger = false, extraHtml = '', noCancel = false) {
  return new Promise(resolve => {
    const d = document.createElement('dialog');
    d.innerHTML = `<form method="dialog">
      <p class="dlg-msg">${esc(message).replace(/\n/g, '<br>')}</p>${extraHtml}
      <div class="row" style="flex-direction: row-reverse">
        <button value="ok" class="btn ${danger ? 'btn-danger' : 'btn-primary'}">${esc(okLabel)}</button>
        ${noCancel ? '' : '<button value="no" class="btn btn-outline">취소</button>'}
      </div></form>`;
    document.body.append(d);
    d.addEventListener('close', () => { resolve(d.returnValue === 'ok' ? d : null); d.remove(); });
    d.showModal();
  });
}

export const tell = msg => ask(msg, '확인', false, '', true);

export function toast(msg, bad = false) {
  const t = document.createElement('div');
  t.className = 'toast' + (bad ? ' bad' : '');
  t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), 3000);
}

// Supabase 오류를 쉬운 말로
export function friendly(err) {
  const m = String(err?.message || err || '');
  if (/fetch|network|Load failed/i.test(m)) return '인터넷 연결을 확인하고 다시 시도해 주세요.';
  if (/JWT|session|auth/i.test(m)) return '다시 로그인해 주세요.';
  return '잠시 문제가 생겼어요. 다시 시도해 주세요.';
}

export const KIND = { trip: '✈ 여행', gathering: '🎂 가족 모임' };
