-- Add otp field to EmailVerificationToken table (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'EmailVerificationToken' AND column_name = 'otp'
    ) THEN
        ALTER TABLE "EmailVerificationToken" ADD COLUMN "otp" TEXT;
        CREATE INDEX IF NOT EXISTS "EmailVerificationToken_otp_idx" ON "EmailVerificationToken"("otp");
    END IF;
END $$;

-- Add otp field to PasswordResetToken table (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'PasswordResetToken' AND column_name = 'otp'
    ) THEN
        ALTER TABLE "PasswordResetToken" ADD COLUMN "otp" TEXT;
        CREATE INDEX IF NOT EXISTS "PasswordResetToken_otp_idx" ON "PasswordResetToken"("otp");
    END IF;
END $$;

-- Verification query
SELECT 
    'EmailVerificationToken' as table_name, 
    COUNT(*) as has_otp_column
FROM information_schema.columns 
WHERE table_name = 'EmailVerificationToken' AND column_name = 'otp'
UNION ALL
SELECT 
    'PasswordResetToken' as table_name, 
    COUNT(*) as has_otp_column
FROM information_schema.columns 
WHERE table_name = 'PasswordResetToken' AND column_name = 'otp';
