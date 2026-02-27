-- Tenant-scoped dashboard theme mode
ALTER TABLE "TenantSetting"
  ADD COLUMN IF NOT EXISTS "themeMode" TEXT NOT NULL DEFAULT 'light';
