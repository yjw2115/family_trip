import { sb, $, esc, requireLogin, fmtRange, fmtShort, dday, today, KIND, photoUrls, fullKey, thumbKey, ask, tell, toast, friendly } from './common.js';
import { upload, QuotaError } from './photo.js';
import { PHOTO_LIMIT } from './config.js';

await requireLogin();

const id = Number(new URLSearchParams(location.search).get('id'));
const main = $('#main');
const TABS = { schedule: '일정', checklist: '준비물', photos: '사진', notes: '한마디' };
let ev, items, photos, notes, urls = {};
let tab, viewerIdx = -1, viewerPushed = false, busy = false;

// ---------- 불러오기 ----------
async function load() {
  const [a, b, c, d] = await Promise.all([
    sb.from('event_list').select('*').eq('id', id).maybeSingle(),
    sb.from('checklist_items').select('*').eq('event_id', id).order('position'),
    sb.from('photos').select('*').eq('event_id', id).is('deleted_at', null).order('taken_at').order('id'),
    sb.from('notes').select('*').eq('event_id', id).order('created_at', { ascending: false }),
  ]);
  const err = a.error || b.error || c.error || d.error;
  if (err) throw err;
  ev = a.data; items = b.data; photos = c.data; notes = d.data;
  if (!ev) return;
  const cp = coverPath();
  urls = { ...urls, ...await photoUrls([...photos.map(p => thumbKey(p.path)), ...(cp ? [fullKey(cp)] : [])]) };
}
const coverPath = () => (photos.find(p => p.id === ev.cover_photo_id) || photos[0])?.path;
const isTrip = () => ev.kind === 'trip';

// ---------- 그리기 ----------
function heroHtml() {
  const cp = coverPath(), d = dday(ev);
  const meta = isTrip() ? [ev.destination, ev.people && `${ev.people}명`, ev.stay && `숙소: ${ev.stay}`].filter(Boolean).join(' · ') : '';
  return `<div class="hero">
    ${cp ? `<img src="${esc(urls[fullKey(cp)])}" alt="">` : ''}
    <h1>${esc(ev.title)}</h1>
    <div class="meta">${KIND[ev.kind]} ${d ? `<span class="badge">${d}</span>` : ''}</div>
    <div>${fmtRange(ev.start_date, ev.end_date)}</div>
    ${meta ? `<div class="meta">${esc(meta)}</div>` : ''}
  </div>`;
}

function scheduleHtml() {
  const days = ev.days || [];
  if (!days.length) return `<p class="empty">아직 일정이 없어요.<br><a class="btn btn-primary" style="margin-top: 12px" href="paste.html?id=${id}">계획 붙여넣기</a></p>`;
  const t = today(), openIdx = Math.max(0, days.findIndex(d => d.date === t));
  return days.map((d, i) => `<details class="day"${i === openIdx ? ' open' : ''}>
    <summary>${i + 1}일차 · ${fmtShort(d.date)}${d.title ? `<span class="sub">${esc(d.title)}</span>` : ''}</summary>
    <ul class="items">${(d.items || []).map(it => `<li><span class="time">${esc(it.time)}</span>
      <span><b>${esc(it.place)}</b>${it.memo ? `<br><span class="sub">${esc(it.memo)}</span>` : ''}</span></li>`).join('')}</ul>
    ${d.alternative ? `<div class="alt">💡 <b>대안 코스</b><br>${esc(d.alternative)}</div>` : '<div style="height: 8px"></div>'}
  </details>`).join('');
}

function checklistHtml() {
  if (!items.length) return `<p class="empty">아직 준비물이 없어요.<br><a class="btn btn-primary" style="margin-top: 12px" href="paste.html?id=${id}">계획 붙여넣기</a></p>`;
  const groups = new Map();
  for (const it of items) (groups.get(it.grp) || groups.set(it.grp, []).get(it.grp)).push(it);
  return [...groups].map(([g, list]) => `
    <div class="group-title"><span>${esc(g)}</span><span data-count="${esc(g)}">${list.filter(i => i.checked).length}/${list.length}</span></div>
    ${list.map(it => `<label class="check${it.checked ? ' done' : ''}">
      <input type="checkbox" data-item="${it.id}"${it.checked ? ' checked' : ''}>
      <span>${esc(it.text)}${it.memo ? `<br><span class="sub">${esc(it.memo)}</span>` : ''}</span></label>`).join('')}`).join('');
}

function photosHtml() {
  const groups = new Map();
  for (const p of photos) { const k = p.taken_at.slice(0, 10); (groups.get(k) || groups.set(k, []).get(k)).push(p); }
  return `<button class="btn btn-primary btn-block" id="addPhotos">📷 사진 올리기</button>
    <p class="progress hidden" id="progress" role="status"></p>
    ${photos.length ? '' : '<p class="empty" style="margin-top: 16px">아직 사진이 없어요.</p>'}
    ${[...groups].map(([day, list]) => `<div class="date-head">${fmtShort(day)}</div>
      <div class="grid3">${list.map(p => `<button data-photo="${p.id}" aria-label="사진 크게 보기">
        <img src="${esc(urls[thumbKey(p.path)])}" alt="${esc(p.caption)}" loading="lazy"></button>`).join('')}</div>`).join('')}`;
}

function notesHtml() {
  return `<form id="noteForm">
      <label for="nName">이름</label><input id="nName" type="text" value="${esc(localStorage.getItem('name') || '')}" placeholder="예: 엄마">
      <label for="nBody">한마디</label><textarea id="nBody" required placeholder="한마디를 남겨 주세요…"></textarea>
      <button class="btn btn-primary btn-block" style="margin-top: 12px">남기기</button>
    </form>
    ${notes.map(n => `<div class="note"><div class="who"><span>${esc(n.author || '가족')} · ${fmtShort(new Date(n.created_at).toLocaleDateString('sv-SE'))}</span>
      <button class="link-btn" data-del-note="${n.id}">지우기</button></div><p>${esc(n.body)}</p></div>`).join('')}`;
}

function render() {
  document.title = ev.title + ' · 우리 가족 이야기';
  $('#menuBtn').classList.remove('hidden');
  if (isTrip()) {
    main.innerHTML = heroHtml() +
      `<div class="tabs" role="tablist">${Object.entries(TABS).map(([k, v]) => `<button role="tab" data-tab="${k}">${v}</button>`).join('')}</div>` +
      Object.keys(TABS).map(k => `<section id="sec-${k}"></section>`).join('');
  } else {
    main.innerHTML = heroHtml() + `<h2>사진 ${photos.length}장</h2><section id="sec-photos"></section><h2>가족 한마디</h2><section id="sec-notes"></section>`;
  }
  if (isTrip()) { $('#sec-schedule').innerHTML = scheduleHtml(); $('#sec-checklist').innerHTML = checklistHtml(); }
  $('#sec-photos').innerHTML = photosHtml();
  $('#sec-notes').innerHTML = notesHtml();
  route();
}

function showTab(t) {
  tab = t;
  if (!isTrip()) return;
  for (const b of main.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', b.dataset.tab === t);
  for (const k of Object.keys(TABS)) $('#sec-' + k).classList.toggle('hidden', k !== t);
}

// 주소의 # 를 보고 탭·사진 보기를 맞춘다
function route() {
  const h = location.hash.slice(1), m = /^photo-(\d+)$/.exec(h);
  const defaultTab = today() > (ev.end_date || ev.start_date) ? 'photos' : 'schedule';
  showTab(m ? 'photos' : TABS[h] ? h : tab || defaultTab);
  if (m) openViewer(Number(m[1])); else closeViewerUi();
}
addEventListener('hashchange', () => ev && route());

// ---------- 화면 안 동작 ----------
main.addEventListener('click', async e => {
  const t = e.target.closest('button, a');
  if (!t) return;
  if (t.dataset.tab) { history.replaceState(null, '', '#' + t.dataset.tab); return route(); }
  if (t.dataset.photo) { viewerPushed = true; location.hash = 'photo-' + t.dataset.photo; return; }
  if (t.id === 'addPhotos') { if (!busy) $('#files').click(); return; }
  if (t.dataset.delNote) {
    if (!await ask('이 한마디를 지울까요?\n지우면 되살릴 수 없어요.', '지우기', true)) return;
    const { error } = await sb.from('notes').delete().eq('id', t.dataset.delNote);
    if (error) return toast(friendly(error), true);
    notes = notes.filter(n => n.id !== Number(t.dataset.delNote));
    $('#sec-notes').innerHTML = notesHtml();
    toast('✓ 지웠어요');
  }
});

// 준비물 체크: 바로 바꾸고 뒤에서 저장
main.addEventListener('change', async e => {
  const box = e.target;
  if (!box.dataset.item) return;
  const it = items.find(i => i.id === Number(box.dataset.item));
  it.checked = box.checked;
  const syncUi = () => {
    box.checked = it.checked;
    box.closest('.check').classList.toggle('done', it.checked);
    const list = items.filter(i => i.grp === it.grp);
    for (const c of main.querySelectorAll('[data-count]')) if (c.dataset.count === it.grp) c.textContent = `${list.filter(i => i.checked).length}/${list.length}`;
  };
  syncUi();
  const { error } = await sb.from('checklist_items').update({ checked: it.checked }).eq('id', it.id);
  if (error) { it.checked = !it.checked; syncUi(); toast('저장하지 못했어요. 다시 눌러 주세요.', true); }
});

main.addEventListener('submit', async e => {
  if (e.target.id !== 'noteForm') return;
  e.preventDefault();
  const author = $('#nName').value.trim(), body = $('#nBody').value.trim();
  if (!body) return toast('한마디를 써 주세요.', true);
  localStorage.setItem('name', author);
  e.submitter.disabled = true;
  const { data, error } = await sb.from('notes').insert({ event_id: id, author, body }).select().single();
  e.submitter.disabled = false;
  if (error) return toast(friendly(error), true);
  notes.unshift(data);
  $('#sec-notes').innerHTML = notesHtml();
  toast('✓ 남겼어요');
});

// ---------- 사진 올리기 ----------
const QUOTA_MSG = '사진 저장 공간이 거의 찼어요.\n휴지통을 비우거나 가족 관리자에게 알려 주세요.';
$('#files').onchange = async e => {
  const files = [...e.target.files];
  e.target.value = '';
  if (!files.length) return;
  const dlg = await ask(`사진 ${files.length}장을 올려요.`, '올리기', false,
    `<label for="upName">올린 사람 이름 (선택)</label><input id="upName" type="text" value="${esc(localStorage.getItem('name') || '')}" placeholder="예: 민지">`);
  if (!dlg) return;
  const name = dlg.querySelector('#upName').value.trim();
  localStorage.setItem('name', name);

  const usage = await sb.rpc('photo_usage');
  if (!usage.error && usage.data + 5 * 1024 * 1024 > PHOTO_LIMIT) return tell(QUOTA_MSG);

  busy = true;
  const warn = ev => ev.preventDefault();
  addEventListener('beforeunload', warn);
  const prog = $('#progress');
  prog.classList.remove('hidden');
  let ok = 0, badFormat = 0, failed = 0, full = false;
  for (let i = 0; i < files.length; i++) {
    prog.textContent = `사진 올리는 중… ${i + 1}/${files.length}장`;
    try { await upload(id, files[i], name); ok++; }
    catch (err) {
      if (err instanceof QuotaError) { full = true; break; }
      if (err instanceof DOMException || err.name === 'InvalidStateError' || err.message === 'jpeg') badFormat++; else failed++;
      console.error(err);
    }
  }
  removeEventListener('beforeunload', warn);
  busy = false;
  await load();
  render();
  if (ok) toast(`✓ ${ok}장 올렸어요`);
  const msgs = [];
  if (badFormat) msgs.push(`${badFormat}장은 올릴 수 없는 사진 형식이에요.`);
  if (failed) msgs.push(`${failed}장은 올리지 못했어요. 인터넷을 확인하고 다시 올려 주세요.`);
  if (full) msgs.push(QUOTA_MSG);
  if (msgs.length) tell(msgs.join('\n\n'));
};

// ---------- 사진 크게 보기 ----------
const viewer = $('#viewer');
async function openViewer(pid) {
  viewerIdx = photos.findIndex(p => p.id === pid);
  if (viewerIdx < 0) { closeViewerUi(); return; }
  const p = photos[viewerIdx];
  viewer.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  $('#vCount').textContent = `${viewerIdx + 1} / ${photos.length}`;
  $('#vPrev').disabled = viewerIdx === 0;
  $('#vNext').disabled = viewerIdx === photos.length - 1;
  $('#vCaption').textContent = p.caption || '메모 없음';
  $('#vMeta').textContent = [p.uploader && `올린 사람: ${p.uploader}`, fmtShort(p.taken_at.slice(0, 10))].filter(Boolean).join(' · ');
  const isCover = coverPath() === p.path && ev.cover_photo_id === p.id;
  $('#vCover').disabled = isCover;
  $('#vCover').textContent = isCover ? '✓ 대표 사진' : '⭐ 대표로';
  const img = $('#vImg');
  img.src = urls[thumbKey(p.path)]; // 먼저 작은 사진, 이어서 큰 사진
  img.alt = p.caption;
  const u = await photoUrls([fullKey(p.path)]);
  if (photos[viewerIdx] === p) img.src = u[fullKey(p.path)];
}
function closeViewerUi() {
  viewer.classList.add('hidden');
  document.body.style.overflow = '';
  viewerIdx = -1;
}
function closeViewer() {
  if (viewerPushed) { viewerPushed = false; history.back(); }
  else location.replace('#photos');
}
const step = d => {
  const n = photos[viewerIdx + d];
  if (n) location.replace('#photo-' + n.id);
};
$('#vClose').onclick = closeViewer;
$('#vPrev').onclick = () => step(-1);
$('#vNext').onclick = () => step(1);
addEventListener('keydown', e => {
  if (viewerIdx < 0) return;
  if (e.key === 'ArrowLeft') step(-1);
  if (e.key === 'ArrowRight') step(1);
  if (e.key === 'Escape') closeViewer();
});
let touchX = null;
$('#vStage').addEventListener('touchstart', e => { touchX = e.touches.length === 1 ? e.touches[0].clientX : null; });
$('#vStage').addEventListener('touchend', e => {
  if (touchX === null || (visualViewport && visualViewport.scale > 1.01)) return;
  const dx = e.changedTouches[0].clientX - touchX;
  if (Math.abs(dx) > 60) step(dx < 0 ? 1 : -1);
  touchX = null;
});

$('#vEdit').onclick = async () => {
  const p = photos[viewerIdx];
  const dlg = await ask('사진 한 줄 메모', '저장', false, `<input id="cap" type="text" maxlength="200" value="${esc(p.caption)}">`);
  if (!dlg) return;
  const caption = dlg.querySelector('#cap').value.trim();
  const { error } = await sb.from('photos').update({ caption }).eq('id', p.id);
  if (error) return toast(friendly(error), true);
  p.caption = caption;
  $('#vCaption').textContent = caption || '메모 없음';
  toast('✓ 저장했어요');
};

$('#vCover').onclick = async () => {
  const p = photos[viewerIdx];
  const { error } = await sb.from('events').update({ cover_photo_id: p.id }).eq('id', id);
  if (error) return toast(friendly(error), true);
  ev.cover_photo_id = p.id;
  Object.assign(urls, await photoUrls([fullKey(p.path)]));
  $('.hero').outerHTML = heroHtml();
  openViewer(p.id);
  toast('✓ 대표 사진으로 정했어요');
};

$('#vDel').onclick = async () => {
  const p = photos[viewerIdx];
  if (!await ask('이 사진을 지울까요?\n휴지통에서 30일 안에 되살릴 수 있어요.', '지우기', true)) return;
  const { error } = await sb.from('photos').update({ deleted_at: new Date().toISOString() }).eq('id', p.id);
  if (error) return toast(friendly(error), true);
  const idx = viewerIdx;
  photos.splice(idx, 1);
  toast('✓ 휴지통으로 옮겼어요');
  const cp = coverPath();
  if (cp) Object.assign(urls, await photoUrls([fullKey(cp)]));
  const next = photos[Math.min(idx, photos.length - 1)];
  render();
  if (next) location.replace('#photo-' + next.id); else closeViewer();
};

// ---------- 더보기 메뉴 ----------
$('#menuBtn').onclick = async () => {
  const d = document.createElement('dialog');
  d.innerHTML = `<form method="dialog" style="display: grid; gap: 12px">
    <button value="edit" class="btn btn-outline">제목·날짜 고치기</button>
    ${isTrip() ? `<button value="paste" class="btn btn-outline">계획 붙여넣기</button>` : ''}
    <button value="del" class="btn btn-danger">모임 지우기</button>
    <button value="" class="btn btn-outline">닫기</button></form>`;
  document.body.append(d);
  d.showModal();
  await new Promise(r => d.addEventListener('close', r, { once: true }));
  d.remove();
  if (d.returnValue === 'paste') location.href = 'paste.html?id=' + id;
  if (d.returnValue === 'edit') editEvent();
  if (d.returnValue === 'del') {
    if (!await ask('이 모임을 지울까요?\n사진도 함께 휴지통으로 가요.\n30일 안에 되살릴 수 있어요.', '지우기', true)) return;
    const { error } = await sb.rpc('trash_event', { p_id: id });
    if (error) return toast(friendly(error), true);
    location.replace('index.html');
  }
};

async function editEvent() {
  const dlg = await ask('제목·날짜 고치기', '저장', false, `
    <label for="eTitle">제목</label><input id="eTitle" type="text" value="${esc(ev.title)}">
    <label for="eStart">날짜</label><input id="eStart" type="date" value="${ev.start_date}">
    ${isTrip() ? `<label for="eEnd">끝나는 날 (선택)</label><input id="eEnd" type="date" value="${ev.end_date || ''}">` : ''}`);
  if (!dlg) return;
  const title = dlg.querySelector('#eTitle').value.trim(), start = dlg.querySelector('#eStart').value;
  const end = isTrip() ? dlg.querySelector('#eEnd').value || null : null;
  if (!title || !start) return tell('제목과 날짜를 모두 써 주세요.');
  if (end && end < start) return tell('끝나는 날이 시작하는 날보다 빨라요.');
  const { error } = await sb.from('events').update({ title, start_date: start, end_date: end }).eq('id', id);
  if (error) return toast(friendly(error), true);
  Object.assign(ev, { title, start_date: start, end_date: end });
  render();
  toast('✓ 저장했어요');
}

// ---------- 시작 ----------
try {
  await load();
  if (!ev) main.innerHTML = `<p class="empty">모임을 찾을 수 없어요. 지워졌을 수 있어요.<br><a href="index.html">홈으로</a></p>`;
  else render();
} catch (err) {
  main.innerHTML = `<p class="errors">${esc(friendly(err))}</p>`;
  console.error(err);
}
