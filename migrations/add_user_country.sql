-- 회원가입 시 국가 (ISO 3166-1 alpha-2, 선택 입력)
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS country VARCHAR(2);
