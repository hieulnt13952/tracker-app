-- ============================================================
--  Hieu Trading Book — Supabase Schema
--  Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

create table if not exists accounts (
  id          text        primary key,
  name        text        not null,
  currency    text        not null default 'USD',
  broker      text,
  created_at  timestamptz not null default now()
);

create table if not exists cash_transactions (
  id          text        primary key,
  account_id  text        not null references accounts(id) on delete cascade,
  type        text        not null check (type in ('deposit', 'withdraw')),
  amount      numeric     not null check (amount > 0),
  date        timestamptz not null,
  note        text,
  created_at  timestamptz not null default now()
);

create table if not exists trades (
  id          text        primary key,
  account_id  text        not null references accounts(id) on delete cascade,
  symbol      text        not null,
  side        text        not null check (side in ('buy', 'sell')),
  qty         numeric     not null check (qty > 0),
  price       numeric     not null check (price > 0),
  fee         numeric     not null default 0,
  date        timestamptz not null,
  created_at  timestamptz not null default now()
);

create table if not exists marks (
  symbol      text        primary key,
  price       numeric     not null check (price > 0),
  updated_at  timestamptz not null default now()
);

-- Disable RLS for single-user / internal tool setup.
-- If you need multi-user auth, replace these with proper RLS policies.
alter table accounts          disable row level security;
alter table cash_transactions disable row level security;
alter table trades            disable row level security;
alter table marks             disable row level security;
