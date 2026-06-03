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
  created_by  text        references users(username) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists marks (
  symbol      text        primary key,
  price       numeric     not null check (price > 0),
  updated_at  timestamptz not null default now()
);

-- ---- Users table (for login) ---------------------------------
-- Passwords are bcrypt-hashed via pgcrypto — never stored in plain text.

create extension if not exists pgcrypto;

create table if not exists users (
  id           uuid        primary key default gen_random_uuid(),
  username     text        not null unique,
  password_hash text       not null,
  display_name text,
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
alter table marks             disable row level security;
alter table users             disable row level security;
