# 우리 가족 이야기

가족의 여행과 가족 모임을 모아 보고, 다가오는 여행을 함께 준비하는 사이트예요.

- **사이트**: GitHub Pages (무료). `main`에 push하면 자동으로 배포돼요.
- **데이터·사진·암호**: Supabase 무료 플랜. 카드 등록 없이 써요.
- **서버 코드**: 없어요. 권한 검사는 DB 규칙(RLS)이 해요.
- **빌드**: 없어요. `site/` 폴더의 파일이 그대로 사이트가 돼요.
- 디자인과 설계는 [DESIGN.md](DESIGN.md)에 정리돼 있어요.

```
site/              사이트 (HTML·CSS·JS)
  js/config.js     ← Supabase 주소와 공개 키를 넣는 곳
supabase/
  schema.sql       DB 구조 (처음 한 번 실행)
  seed.sql         샘플 여행 1개
tests/             계획 JSON 검사 테스트
serve.mjs          내 PC에서 띄워 보는 서버
.github/workflows/ 자동 배포 · 자동 깨우기
```

---

## 처음 설정하기 (한 번만)

### 1. Supabase 프로젝트 만들기
1. https://supabase.com 에서 **Start your project**를 누르고 GitHub 계정으로 가입해요. 카드는 필요 없어요.
2. **New project**를 눌러 프로젝트를 만들어요.
   - Name: `family` (아무 이름이나 괜찮아요)
   - Database Password: **Generate**를 눌러 만든 다음 안전한 곳에 적어 두세요. 사이트 암호와는 다른 거예요.
   - Region: **Northeast Asia (Seoul)**
3. 프로젝트가 준비될 때까지 1~2분 기다려요.

### 2. DB 구조 만들기
1. 왼쪽 메뉴에서 **SQL Editor**를 열어요.
2. [`supabase/schema.sql`](supabase/schema.sql) 내용을 통째로 붙여넣고 **Run**을 눌러요. "Success"가 나오면 돼요.
3. 샘플 여행이 필요하면 새 쿼리를 열어 [`supabase/seed.sql`](supabase/seed.sql)도 같은 방법으로 실행해요. 샘플은 나중에 사이트에서 지울 수 있어요.

> 가족 계정 이메일은 기본값이 `family@example.com`이에요. 바꾸려면 `schema.sql`의 `is_family()`와 `site/js/config.js`의 `FAMILY_EMAIL`을 **똑같이** 바꿔야 해요.

### 3. 가족 암호 정하기 (가족 공용 계정)
1. **Authentication → Sign In / Providers**를 열어요.
   - **Allow new users to sign up**을 **끄고** 저장해요. 가족 계정 말고는 아무도 가입할 수 없게 하는 설정이에요.
2. **Authentication → Users → Add user → Create new user**를 눌러요.
   - Email: `family@example.com`
   - Password: **가족 암호** (가족이 사이트에 들어갈 때 입력하는 암호예요. 6자 이상)
   - **Auto Confirm User**를 체크하고 만들어요.

이 암호는 Supabase에만 저장돼요. 코드나 GitHub에는 들어가지 않아요. 로그인을 유지하는 서명 키도 Supabase가 관리해요.

### 4. 사이트에 Supabase 주소 넣기
1. **Project Settings → API Keys**(또는 **Data API**)를 열어요.
2. **Project URL**과 **Publishable key**를 복사해요. Publishable key가 없으면 `anon` `public` 키를 복사해요.
3. [`site/js/config.js`](site/js/config.js)의 `SUPABASE_URL`, `SUPABASE_KEY`에 붙여넣어요.

> 이 두 값은 원래 공개되는 값이라 GitHub에 올라가도 괜찮아요. **`service_role` / `secret` 키는 절대 넣지 마세요.**

### 5. 내 PC에서 확인하기 (선택)
Node.js가 있으면 프로젝트 폴더에서 아래를 실행하고, http://localhost:8080 을 열어 가족 암호로 들어가 보세요.
```powershell
node serve.mjs
```
계획 검사 테스트는 이렇게 돌려요.
```powershell
node tests/plan.test.mjs
```

### 6. GitHub에 올리고 자동 배포 켜기
1. GitHub에서 새 저장소 `family_trip`을 **Public**으로 만들어요. 무료 계정은 공개 저장소만 Pages를 쓸 수 있어요. 코드에 비밀이 없으니 괜찮아요.
2. 이 폴더를 올려요.
   ```powershell
   git init -b main
   ```
   ```powershell
   git add .
   ```
   ```powershell
   git commit -m "우리 가족 이야기"
   ```
   ```powershell
   git remote add origin https://github.com/내아이디/family_trip.git
   ```
   ```powershell
   git push -u origin main
   ```
3. 저장소의 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 바꿔요.
4. **Actions** 탭에서 "사이트 배포"가 초록색 ✓가 되면, `https://내아이디.github.io/family_trip/` 로 들어갈 수 있어요.

이제부터는 `main`에 push할 때마다 자동으로 배포돼요.

### 7. 자동 깨우기 확인
Supabase 무료 프로젝트는 **일주일 동안 활동이 없으면 멈춰요.** 그래서 GitHub이 월·목마다 한 번씩 깨우도록 해 두었어요(`keepalive.yml`).
1. **Actions → Supabase 깨우기 → Run workflow**를 눌러 한 번 실행해 봐요. 초록색 ✓가 나오면 성공이에요.
2. ⚠ 저장소에 **60일 동안 push가 없으면** GitHub이 이 예약 작업을 자동으로 꺼요. Actions 탭에 노란 안내가 보이면 **Enable workflow**를 눌러 주세요.

---

## 운영하기

### 사이트가 멈췄을 때 ("연결이 안 돼요"가 계속 나올 때)
Supabase 대시보드에서 프로젝트를 열고 **Restore project**를 눌러요. 몇 분 뒤 다시 돼요. 데이터와 사진은 그대로예요.

### 가족 암호 바꾸기
SQL Editor에서 실행해요. `새암호`만 바꾸면 돼요.
```sql
update auth.users set encrypted_password = extensions.crypt('새암호', extensions.gen_salt('bf'))
where email = 'family@example.com';
delete from auth.sessions
where user_id = (select id from auth.users where email = 'family@example.com');
```
두 번째 줄 덕분에 모든 기기가 최대 1시간 안에 로그아웃되고, 새 암호를 다시 입력하게 돼요.

### 사진 용량 확인
사진 저장 상한은 **900MB**예요. 무료 1GB에서 여유를 뺀 값이고, 휴지통 안의 사진도 포함해요. 사진은 1600px로 줄여서 올리기 때문에 대략 3,000장까지 들어가요.
```sql
select round(public.photo_usage() / 1024.0 / 1024) as "사용 MB";
```
가득 차면 사이트가 올리기를 막고 안내 문구를 보여줘요. 휴지통을 비우면 공간이 생겨요. 휴지통의 사진은 30일이 지나면 자동으로 정리돼요.

### 무료 한도 요약
| 항목 | 무료 한도 | 이 사이트 |
|---|---|---|
| 사진 저장 | 1GB | 900MB에서 업로드를 막아요 |
| 데이터 전송 | 월 5GB | 목록에는 썸네일만 쓰고, 사진은 1년 동안 브라우저에 저장해 다시 받지 않아요 |
| DB | 0.5GB | 글자만 저장해서 충분해요 |
| 비활성 멈춤 | 7일 | 주 2회 자동 깨우기 |

Supabase 무료 플랜은 한도를 넘어도 요금을 청구하지 않아요. 대신 기능이 제한돼요. 카드를 등록하지 않았으니 요금이 나갈 일이 없어요.

---

## 여행 계획을 Claude와 만들기
Claude에게 아래처럼 부탁한 다음, 받은 답을 사이트의 **계획 붙여넣기**에 통째로 붙여넣으면 돼요. 앞뒤 설명 글이 섞여 있어도 괜찮아요.

> 다음 형식의 JSON으로 여행 계획을 만들어 줘. 날짜는 YYYY-MM-DD, 체크리스트는 그룹별로.
> ```json
> {
>   "version": 1,
>   "trip": { "title": "", "destination": "", "startDate": "YYYY-MM-DD",
>             "endDate": "YYYY-MM-DD", "people": 4, "stay": "" },
>   "days": [
>     { "date": "YYYY-MM-DD", "title": "",
>       "items": [ { "time": "", "place": "", "memo": "" } ],
>       "alternative": "" }
>   ],
>   "checklist": [ { "group": "", "text": "", "memo": "" } ]
> }
> ```

일정을 고치고 싶으면 Claude와 대화해서 JSON을 고친 다음, 같은 여행에 다시 붙여넣으면 돼요.
- 일정과 준비물만 새 계획으로 바뀌어요.
- 사진, 한마디, 체크 표시는 그대로예요. 체크 표시는 그룹과 이름이 같은 항목끼리 이어져요.
