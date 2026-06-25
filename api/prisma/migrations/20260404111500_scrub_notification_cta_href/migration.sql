UPDATE "Notification"
SET "metaJson" = jsonb_set(
  COALESCE("metaJson", '{}'::jsonb),
  '{context}',
  COALESCE("metaJson"->'context', '{}'::jsonb) - 'ctaHref',
  true
)
WHERE COALESCE("metaJson"->'context', '{}'::jsonb) ? 'ctaHref';
