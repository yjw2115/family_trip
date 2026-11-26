// 계획 JSON 검사. 틀린 곳을 쉬운 말로 알려주고, 맞으면 정리된 계획을 돌려준다.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

// 누를 수 있는 웹 주소인지 (javascript: 같은 주소는 막는다)
export function isWebLink(s) {
  try { return ['http:', 'https:'].includes(new URL(s).protocol); } catch { return false; }
}

// 지도 서비스 주소인지 (그런 link는 홈페이지가 아니라 지도 버튼으로 쓴다)
export function isMapLink(s) {
  try {
    const u = new URL(s), h = u.hostname.replace(/^www\./, '');
    return /^maps\.google\.|^maps\.app\.goo\.gl$|^(m\.)?map\.naver\.com$|^naver\.me$|^(place\.)?map\.kakao\.com$|^kko\.to$/.test(h)
      || (/^google\.[a-z.]+$/.test(h) && u.pathname.startsWith('/maps'))
      || (h === 'goo.gl' && u.pathname.startsWith('/maps'));
  } catch { return false; }
}

// 국내(비었거나 한국)면 네이버 지도, 해외면 구글 지도
const KOREA = ['', '한국', '대한민국', '남한', 'korea', 'south korea', 'republic of korea', 'kr', 'kor'];
export function mapUrl(place, destination = '', country = '') {
  const q = destination && !place.includes(destination) ? `${destination} ${place}` : place;
  return KOREA.includes(country.trim().toLowerCase())
    ? 'https://map.naver.com/p/search/' + encodeURIComponent(q)
    : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
}

// 글자 칸: 없으면 '', 숫자는 글자로 바꾸고, 그 밖의 것은 오류
function text(v, where, errors) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  errors.push(`${where}은(는) 글자로 써야 해요.`);
  return '';
}

function parseError(src, e) {
  const m = /line (\d+)/.exec(e.message) || /position (\d+)/.exec(e.message);
  if (m && e.message.includes('line')) return `${m[1]}번째 줄 근처에 괄호나 쉼표, 따옴표가 빠졌거나 남아 있어요.`;
  if (m) return `${src.slice(0, +m[1]).split('\n').length}번째 줄 근처에 괄호나 쉼표, 따옴표가 빠졌거나 남아 있어요.`;
  return '계획 형식이 아니에요. 괄호 { }, 쉼표, 따옴표가 빠지지 않았는지 확인해 주세요.';
}

export function checkPlan(src) {
  src = String(src || '').trim();
  // Claude 답변을 통째로 붙여넣어도 되도록 첫 { 부터 마지막 } 까지만 쓴다
  const a = src.indexOf('{'), b = src.lastIndexOf('}');
  if (a < 0 || b < a) return { errors: ['붙여넣은 내용에 계획이 없어요. { 로 시작하는 계획 전체를 붙여넣어 주세요.'] };
  src = src.slice(a, b + 1);

  let p;
  try { p = JSON.parse(src); } catch (e) { return { errors: [parseError(src, e)] }; }

  const errors = [];
  if (p.version !== 1) errors.push('맨 위의 "version"은 1이어야 해요.');

  const t = p.trip;
  if (!t || typeof t !== 'object' || Array.isArray(t)) {
    return { errors: [...errors, '"trip"(여행 정보)이 없어요.'] };
  }
  const trip = {
    title: text(t.title, '여행 제목(title)', errors),
    destination: text(t.destination, '여행지(destination)', errors),
    country: text(t.country, '나라(country)', errors),
    stay: text(t.stay, '숙소(stay)', errors),
    startDate: t.startDate,
    endDate: t.endDate,
    people: null,
  };
  if (!trip.title) errors.push('여행 제목(title)이 비어 있어요.');
  for (const [k, name] of [['startDate', '시작 날짜'], ['endDate', '끝 날짜']]) {
    if (!isDate(t[k])) errors.push(`${name}(${k})는 2026-12-08처럼 써야 해요 (지금: "${t[k] ?? ''}").`);
  }
  const rangeOk = isDate(t.startDate) && isDate(t.endDate);
  if (rangeOk && t.endDate < t.startDate) errors.push('끝 날짜가 시작 날짜보다 빨라요.');
  if (t.people !== undefined && t.people !== null && t.people !== '') {
    const n = Number(t.people);
    if (!Number.isInteger(n) || n < 1) errors.push(`인원(people)은 1 이상의 숫자여야 해요 (지금: "${t.people}").`);
    else trip.people = n;
  }

  const days = [];
  if (p.days !== undefined && !Array.isArray(p.days)) errors.push('"days"(일정)는 [ ] 목록이어야 해요.');
  const seenDates = new Set();
  (Array.isArray(p.days) ? p.days : []).forEach((d, i) => {
    const w = `${i + 1}일차`;
    if (!d || typeof d !== 'object') { errors.push(`${w} 형식이 이상해요.`); return; }
    if (!isDate(d.date)) errors.push(`${w} 날짜(date)는 2026-12-08처럼 써야 해요 (지금: "${d.date ?? ''}").`);
    else if (rangeOk && (d.date < t.startDate || d.date > t.endDate)) errors.push(`${w} 날짜(${d.date})가 여행 기간 밖이에요.`);
    else if (seenDates.has(d.date)) errors.push(`${w} 날짜(${d.date})가 다른 날과 겹쳐요.`);
    seenDates.add(d.date);
    if (d.items !== undefined && !Array.isArray(d.items)) errors.push(`${w} 일정(items)은 [ ] 목록이어야 해요.`);
    const items = (Array.isArray(d.items) ? d.items : []).map((it, j) => {
      const iw = `${w} ${j + 1}번째 일정`;
      if (!it || typeof it !== 'object') { errors.push(`${iw} 형식이 이상해요.`); return null; }
      const item = { time: text(it.time, `${iw} 시간`, errors), place: text(it.place, `${iw} 장소`, errors), memo: text(it.memo, `${iw} 메모`, errors) };
      if (!item.place) errors.push(`${iw}에 "장소"(place)가 비어 있어요.`);
      const link = text(it.link, `${iw} 링크`, errors);
      if (link && !isWebLink(link)) errors.push(`${iw} 링크(link)는 https://로 시작하는 주소여야 해요 (지금: "${link}").`);
      if (link) item.link = link;
      return item;
    }).filter(Boolean);
    days.push({ date: d.date, title: text(d.title, `${w} 제목`, errors), items, alternative: text(d.alternative, `${w} 대안 코스`, errors) });
  });
  days.sort((x, y) => String(x.date).localeCompare(String(y.date)));

  const checklist = [];
  if (p.checklist !== undefined && !Array.isArray(p.checklist)) errors.push('"checklist"(준비물)는 [ ] 목록이어야 해요.');
  const seenItems = new Set();
  (Array.isArray(p.checklist) ? p.checklist : []).forEach((c, i) => {
    const w = `준비물 ${i + 1}번째`;
    if (!c || typeof c !== 'object') { errors.push(`${w} 형식이 이상해요.`); return; }
    const item = { group: text(c.group, `${w} 그룹`, errors), text: text(c.text, `${w} 이름`, errors), memo: text(c.memo, `${w} 메모`, errors) };
    if (!item.group) errors.push(`${w}에 "그룹"(group)이 비어 있어요.`);
    if (!item.text) errors.push(`${w}에 "이름"(text)이 비어 있어요.`);
    const key = item.group + '\u0000' + item.text;
    if (item.group && item.text && seenItems.has(key)) errors.push(`${w} "${item.group} · ${item.text}"가 두 번 있어요.`);
    seenItems.add(key);
    checklist.push(item);
  });

  if (errors.length) return { errors };
  return { plan: { version: 1, trip, days, checklist } };
}

// 기존 준비물과 새 준비물 비교 (미리보기용)
export function diffChecklist(oldItems, newItems) {
  const key = (g, t) => g + '\u0000' + t;
  const oldMap = new Map(oldItems.map(o => [key(o.grp, o.text), o]));
  const newKeys = new Set(newItems.map(n => key(n.group, n.text)));
  let added = 0, keptChecked = 0;
  for (const n of newItems) {
    const o = oldMap.get(key(n.group, n.text));
    if (!o) added++;
    else if (o.checked) keptChecked++;
  }
  const removed = oldItems.filter(o => !newKeys.has(key(o.grp, o.text))).length;
  return { added, removed, keptChecked };
}
