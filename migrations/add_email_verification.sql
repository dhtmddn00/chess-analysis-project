ALTER TABLE users
    ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS verification_token VARCHAR(64),
    ADD COLUMN IF NOT EXISTS verification_token_expires_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token);
