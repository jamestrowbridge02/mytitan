-- Shadow repair to ensure StockItem exists before inventory add-ons
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'StockItem') then
    create table "StockItem" (
      "id" text primary key,
      "tenantId" text not null,
      "locationId" text,
      "sku" text not null,
      "name" text not null,
      "unit" text not null,
      "minLevel" decimal(14,2) not null default 0,
      "avgUnitCost" decimal(14,2) not null default 0,
      "supplierId" text,
      "isActive" boolean not null default true,
      "createdAt" timestamp(3) not null default current_timestamp,
      "updatedAt" timestamp(3) not null default current_timestamp
    );
  end if;
end
$$;

create table if not exists "StockSupplier" (
  "id" text primary key,
  "tenantId" text not null,
  "name" text not null,
  "email" text,
  "phone" text,
  "createdAt" timestamp(3) not null default current_timestamp,
  "updatedAt" timestamp(3) not null default current_timestamp
);

create unique index if not exists "StockItem_tenantId_sku_key" on "StockItem"("tenantId", "sku");
create index if not exists "StockItem_tenantId_locationId_idx" on "StockItem"("tenantId", "locationId");
create index if not exists "StockItem_tenantId_supplierId_idx" on "StockItem"("tenantId", "supplierId");
create index if not exists "StockItem_tenantId_createdAt_idx" on "StockItem"("tenantId", "createdAt");
create index if not exists "StockSupplier_tenantId_createdAt_idx" on "StockSupplier"("tenantId", "createdAt");

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'StockItem_tenantId_fkey') then
    alter table "StockItem" add constraint "StockItem_tenantId_fkey"
      foreign key ("tenantId") references "Company"("id") on delete cascade on update cascade;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'StockItem_locationId_fkey') then
    alter table "StockItem" add constraint "StockItem_locationId_fkey"
      foreign key ("locationId") references "Location"("id") on delete set null on update cascade;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'StockSupplier_tenantId_fkey') then
    alter table "StockSupplier" add constraint "StockSupplier_tenantId_fkey"
      foreign key ("tenantId") references "Company"("id") on delete cascade on update cascade;
  end if;
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'StockSupplier') then
    if not exists (
      select 1 from pg_constraint where conname = 'StockItem_supplierId_fkey') then
      alter table "StockItem" add constraint "StockItem_supplierId_fkey"
        foreign key ("supplierId") references "StockSupplier"("id") on delete set null on update cascade;
    end if;
  end if;
end
$$;
