// 실행: node tests/plan.test.mjs
import assert from 'node:assert/strict';
import { checkPlan, diffChecklist, isWebLink, isMapLink, mapUrl } from '../site/js/plan.js';

const good = {
  version: 1,
  trip: { title: '칭다오', destination: '칭다오', startDate: '2026-12-08', endDate: '2026-12-11', people: 4, stay: '호텔' },
  days: [
    { date: '2026-12-09', title: '둘째 날', items: [{ time: '10:00', place: '잔교', memo: '' }], alternative: '' },
    { date: '2026-12-08', title: '첫날', items: [{ time: '', place: '공항' }] },
  ],
  checklist: [{ group: '서류', text: '여권', memo: '' }, { group: '짐', text: '충전기' }],
};

// 정상 + Claude 답변처럼 앞뒤 글과 ``` 가 붙어도 된다
let r = checkPlan('여기 계획이에요:\n```json\n' + JSON.stringify(good, null, 2) + '\n```\n좋은 여행 되세요!');
assert.equal(r.errors, undefined);
assert.equal(r.plan.days[0].date, '2026-12-08'); // 날짜순 정렬
assert.equal(r.plan.days[1].items[0].memo, '');
assert.equal(r.plan.trip.people, 4);

// 문법 오류 → 줄 번호
r = checkPlan('{\n "version": 1,\n "trip": {\n }\n,}');
assert.match(r.errors[0], /번째 줄 근처/);

// 내용 오류를 쉬운 말로
const bad = structuredClone(good);
bad.trip.startDate = '12/8';
bad.days[0].items[0].place = '';
bad.days[1].date = '2027-01-01';
bad.checklist.push({ group: '서류', text: '여권' });
r = checkPlan(JSON.stringify(bad));
assert.ok(r.errors.some(e => e.includes('시작 날짜(startDate)는 2026-12-08처럼') && e.includes('"12/8"')), r.errors);
assert.ok(r.errors.some(e => e.includes('1일차 1번째 일정에 "장소"')), r.errors);
assert.ok(r.errors.some(e => e.includes('"서류 · 여권"가 두 번')), r.errors);

const bad2 = structuredClone(good);
bad2.days[1].date = '2026-12-20';
bad2.version = 2;
r = checkPlan(JSON.stringify(bad2));
assert.ok(r.errors.some(e => e.includes('여행 기간 밖')), r.errors);
assert.ok(r.errors.some(e => e.includes('version')), r.errors);

assert.ok(checkPlan('안녕').errors[0].includes('계획이 없어요'));
assert.ok(checkPlan(JSON.stringify({ ...good, trip: { ...good.trip, endDate: '2026-12-01' } })).errors.some(e => e.includes('끝 날짜가')));

// 링크와 나라
const linked = structuredClone(good);
linked.trip.country = '중국';
linked.days[0].items[0].link = 'https://example.com/jan';
r = checkPlan(JSON.stringify(linked));
assert.equal(r.plan.trip.country, '중국');
assert.equal(r.plan.days[1].items[0].link, 'https://example.com/jan');
assert.equal('link' in r.plan.days[0].items[0], false); // 링크 없는 항목엔 칸을 만들지 않음
linked.days[0].items[0].link = 'javascript:alert(1)';
assert.ok(checkPlan(JSON.stringify(linked)).errors.some(e => e.includes('https://로 시작')));
linked.days[0].items[0].link = 'www.example.com';
assert.ok(checkPlan(JSON.stringify(linked)).errors.some(e => e.includes('https://로 시작')));
assert.ok(!isWebLink('javascript:alert(1)') && isWebLink('http://a.kr'));
assert.match(mapUrl('경포 해변', '강릉'), /^https:\/\/map\.naver\.com\/p\/search\/%EA%B0%95%EB%A6%89%20/);
assert.match(mapUrl('경포 해변', '강릉', '대한민국'), /map\.naver\.com/);
assert.match(mapUrl('잔교', '칭다오', '중국'), /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
assert.equal(mapUrl('강릉 중앙시장', '강릉'), 'https://map.naver.com/p/search/' + encodeURIComponent('강릉 중앙시장'));

// 지도 주소 link는 지도 버튼으로, 나머지는 홈페이지로
for (const u of ['https://www.google.com/maps/search/?api=1&query=%E9%9D%92%E5%B2%9B%E6%A0%88%E6%A1%A5',
  'https://maps.google.com/?q=x', 'https://maps.app.goo.gl/abc', 'https://map.naver.com/p/search/x',
  'https://m.map.naver.com/search?query=x', 'https://naver.me/abc', 'https://map.kakao.com/?q=x', 'https://place.map.kakao.com/123', 'https://www.google.co.kr/maps/place/x'])
  assert.ok(isMapLink(u), u);
for (const u of ['https://www.agoda.com/ko-kr/h86972823/hotel/qingdao-cn.html', 'https://www.google.com/search?q=maps',
  'https://www.gn.go.kr/', 'https://evil.com/maps.google.com', 'not a url'])
  assert.ok(!isMapLink(u), u);

// 체크 상태 이어 붙이기 미리보기
const d = diffChecklist(
  [{ grp: '서류', text: '여권', checked: true }, { grp: '짐', text: '우산', checked: true }],
  [{ group: '서류', text: '여권' }, { group: '짐', text: '충전기' }],
);
assert.deepEqual(d, { added: 1, removed: 1, keptChecked: 1 });

console.log('plan.js 검사 통과');
