// Supabase 대시보드 → Project Settings → API 에서 복사해 넣는다.
// 이 값들은 공개돼도 괜찮다(데이터는 가족 암호로 로그인해야만 열린다).
export const SUPABASE_URL = 'https://akauwjmavppksnmlnbby.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_yZf1ms-xxvwvweRw9RfkKg_2UJt_fwB';
// supabase/schema.sql 의 is_family() 이메일과 같아야 한다.
export const FAMILY_EMAIL = 'family@example.com';
// schema.sql 의 photo_limit() 과 같은 값 (안내 문구용)
export const PHOTO_LIMIT = 900 * 1024 * 1024;
