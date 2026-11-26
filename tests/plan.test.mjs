// 실행: node tests/plan.test.mjs
import assert from 'node:assert/strict';
import { checkPlan, diffChecklist } from '../site/js/plan.js';

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

// 체크 상태 이어 붙이기 미리보기
const d = diffChecklist(
  [{ grp: '서류', text: '여권', checked: true }, { grp: '짐', text: '우산', checked: true }],
  [{ group: '서류', text: '여권' }, { group: '짐', text: '충전기' }],
);
assert.deepEqual(d, { added: 1, removed: 1, keptChecked: 1 });

console.log('plan.js 검사 통과');
