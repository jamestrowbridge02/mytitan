-- Remove demo tenant/users and related rows when they exist.
DO $$
DECLARE
  demo_company_ids text[];
  demo_user_ids text[];
  rec record;
BEGIN
  SELECT COALESCE(array_agg(id), '{}')::text[]
  INTO demo_company_ids
  FROM "Company"
  WHERE lower("name") LIKE '%demo%';

  SELECT COALESCE(array_agg(id), '{}')::text[]
  INTO demo_user_ids
  FROM "User"
  WHERE lower("email") LIKE 'demo%'
     OR lower("email") LIKE '%+demo%'
     OR lower("email") LIKE '%demo@%'
     OR "companyId" = ANY (demo_company_ids);

  FOR rec IN
    SELECT table_schema, table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'companyId'
      AND table_name <> 'Company'
  LOOP
    EXECUTE format(
      'DELETE FROM %I.%I WHERE "companyId" = ANY ($1)',
      rec.table_schema,
      rec.table_name
    ) USING demo_company_ids;
  END LOOP;

  FOR rec IN
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name IN ('userId', 'assignedUserId')
  LOOP
    EXECUTE format(
      'DELETE FROM %I.%I WHERE %I = ANY ($1)',
      rec.table_schema,
      rec.table_name,
      rec.column_name
    ) USING demo_user_ids;
  END LOOP;

  DELETE FROM "User" WHERE id = ANY (demo_user_ids);
  DELETE FROM "Company" WHERE id = ANY (demo_company_ids);
END $$;
