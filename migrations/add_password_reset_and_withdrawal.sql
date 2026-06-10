-- 비밀번호 재설정 토큰
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(64),
    ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_users_password_reset_token ON users(password_reset_token);

-- 회원 탈퇴 (soft delete) 시각 기록
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
