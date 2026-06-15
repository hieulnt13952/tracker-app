-- ============================================================
--  Hieu Trading Book — Supabase Schema
--  Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

create table if not exists accounts (
  id          text        primary key,
  name        text        not null,
  currency    text        not null default 'CAD',
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
  created_by  text        references users(username) on delete set null,
  created_at  timestamptz not null default now(),
  deleted     boolean     not null default false
);

create table if not exists trades (
  id          text        primary key,
  account_id  text        not null references accounts(id) on delete cascade,
  symbol      text        not null,
  side        text        not null check (side in ('buy', 'sell')),
  qty         numeric     not null check (qty > 0),
  price       numeric     not null check (price > 0),
  date        timestamptz not null,
  created_by  text        references users(username) on delete set null,
  created_at  timestamptz not null default now(),
  deleted     boolean     not null default false
);

-- ---- Instruments -----------------------------------------------
create table if not exists instruments (
  symbol     text        primary key,
  name       text        not null,
  decimals   int         not null default 2,
  last_price numeric,
  updated_at timestamptz default now()
);

alter table instruments disable row level security;

-- ---- VN Bank Accounts ------------------------------------------
create table if not exists vn_bank_accounts (
  id           text        primary key,
  bank_name    text        not null,
  account_name text        not null,
  account_type text        not null default 'Savings',
  currency     text        not null default 'VND',
  amount       numeric     not null default 0,
  note         text,
  updated_at   timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create table if not exists vn_bank_history (
  id           text        primary key,
  account_id   text        not null references vn_bank_accounts(id) on delete cascade,
  old_amount   numeric     not null,
  new_amount   numeric     not null,
  note         text,
  changed_at   timestamptz not null default now()
);

alter table vn_bank_accounts disable row level security;
alter table vn_bank_history  disable row level security;

-- ---- Ticker tape symbols (managed manually in Supabase) -------
create table if not exists tickerlist (
  symbol     text        primary key,   -- e.g. "FOREXCOM:SPXUSD"
  name       text,                      -- friendly label, optional
  created_at timestamptz not null default now(),
  created_by text
);

alter table tickerlist disable row level security;

-- ---- Wishlist items -------------------------------------------
create table if not exists wishlist_items (
  id          text        primary key,
  name        text        not null,
  url         text        not null,
  description text,
  rank        integer     not null default 0,
  created_by  text,
  created_at  timestamptz not null default now()
);

alter table wishlist_items disable row level security;

-- ---- Storage bucket for user profile avatars ------------------
-- Creates a public bucket so uploaded images are readable without auth.
insert into storage.buckets (id, name, public)
values ('user-avatars', 'user-avatars', true)
on conflict (id) do nothing;

-- Allow anyone (anon key) to read, upload, and overwrite avatars.
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'storage'
    and tablename = 'objects' and policyname = 'user_avatars_read'
  ) then
    create policy "user_avatars_read"
      on storage.objects for select
      using (bucket_id = 'user-avatars');
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'storage'
    and tablename = 'objects' and policyname = 'user_avatars_write'
  ) then
    create policy "user_avatars_write"
      on storage.objects for insert
      with check (bucket_id = 'user-avatars');
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'storage'
    and tablename = 'objects' and policyname = 'user_avatars_update'
  ) then
    create policy "user_avatars_update"
      on storage.objects for update
      using (bucket_id = 'user-avatars');
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'storage'
    and tablename = 'objects' and policyname = 'user_avatars_delete'
  ) then
    create policy "user_avatars_delete"
      on storage.objects for delete
      using (bucket_id = 'user-avatars');
  end if;
end $$;

-- ---- Sync usage (tracks Browserless calls per month) ----------
create table if not exists sync_usage (
  month         text  primary key,   -- "YYYY-MM", e.g. "2026-06"
  limit_count   int   not null default 1000,
  refresh_count int   not null default 0
);

alter table sync_usage disable row level security;

-- ---- Users table (for login) ---------------------------------
-- Passwords are bcrypt-hashed via pgcrypto — never stored in plain text.

create extension if not exists pgcrypto;

create table if not exists users (
  id           uuid        primary key default gen_random_uuid(),
  username     text        not null unique,
  password_hash text       not null,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now()
);

-- login() RPC: verifies username + password, returns the user row on success.
-- Called by the app with the anon key — password check happens server-side.
create or replace function login(p_username text, p_password text)
returns table(username text, display_name text)
language plpgsql security definer as $$
begin
  return query
    select u.username, u.display_name
    from users u
    where u.username = lower(trim(p_username))
      and u.password_hash = crypt(p_password, u.password_hash);
end;
$$;

grant execute on function login to anon;

-- ---- How to add users ----------------------------------------
-- Run this for each user you want to create (replace values):
--
--   insert into users (username, password_hash, display_name)
--   values ('hieu', crypt('your_password_here', gen_salt('bf')), 'Hieu');
--
--   insert into users (username, password_hash, display_name)
--   values ('admin', crypt('your_password_here', gen_salt('bf')), 'Admin');
-- --------------------------------------------------------------

-- Disable RLS (internal tool — access controlled by login page).
alter table accounts          disable row level security;
alter table cash_transactions disable row level security;
alter table trades            disable row level security;
alter table users             disable row level security;

-- ============================================================
--  MIGRATION — run this if you already have a live database
--  (safe to run multiple times — uses IF EXISTS / IF NOT EXISTS)
-- ============================================================

-- 1. Drop the marks table (prices now live in instruments.last_price)
drop table if exists marks;

-- 2. Remove class and quote columns from instruments
alter table instruments
  drop column if exists class,
  drop column if exists quote;

-- 3. Add last_price and updated_at to instruments
alter table instruments
  add column if not exists last_price numeric,
  add column if not exists updated_at timestamptz default now();

-- 4. Add avatar_url to users table
alter table users add column if not exists avatar_url text;

-- 5. Add created_by and rank to wishlist_items (if table already exists)
alter table wishlist_items add column if not exists created_by text;
alter table wishlist_items add column if not exists rank integer not null default 0;
