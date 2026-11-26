-- 샘플 여행 1개 (지워도 된다). schema.sql 다음에 SQL Editor에서 실행.
select public.save_plan(null, $json$
{
  "version": 1,
  "trip": { "title": "샘플 여행 · 강릉", "destination": "강릉", "startDate": "2026-12-20",
            "endDate": "2026-12-21", "people": 4, "stay": "경포 바닷가 숙소" },
  "days": [
    { "date": "2026-12-20", "title": "도착 & 바다",
      "items": [
        { "time": "09:00", "place": "서울 출발", "memo": "휴게소 한 번" },
        { "time": "13:00", "place": "초당 순두부", "memo": "점심" },
        { "time": "15:00", "place": "경포 해변", "memo": "산책" }
      ],
      "alternative": "바람이 세면 오죽헌 관람" },
    { "date": "2026-12-21", "title": "시장 구경 후 귀가",
      "items": [
        { "time": "10:00", "place": "중앙시장", "memo": "닭강정 포장" },
        { "time": "14:00", "place": "집으로", "memo": "" }
      ],
      "alternative": "" }
  ],
  "checklist": [
    { "group": "챙길 것", "text": "신분증", "memo": "" },
    { "group": "챙길 것", "text": "상비약", "memo": "멀미약" },
    { "group": "짐", "text": "두꺼운 겉옷", "memo": "바닷바람" },
    { "group": "짐", "text": "휴대폰 충전기", "memo": "" }
  ]
}
$json$::jsonb);
