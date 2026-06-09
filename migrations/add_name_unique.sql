-- 이름 대소문자 구분 없이 중복 방지 (예: "Magnus"와 "magnus"는 동일 취급)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_name_lower ON users(LOWER(name));
