-- Applied to the Supabase project dxdgffmczouqwjhwefkf on 2026-11-04.
-- One profile per signed-in player.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique
    constraint username_format check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null
    constraint display_name_length check (char_length(btrim(display_name)) between 1 and 40),
  bio text
    constraint bio_length check (bio is null or char_length(bio) <= 160),
  avatar_url text
    constraint avatar_url_https check (avatar_url is null or avatar_url ~ '^https://'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Blackjack player profiles, one per auth user.';

alter table public.profiles enable row level security;

-- Signed-in players can see profiles (for future leaderboards / tables).
create policy "Profiles are visible to signed-in players"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Players can create their own profile"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "Players can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Players can delete their own profile"
  on public.profiles for delete
  to authenticated
  using ((select auth.uid()) = id);

-- Signed-out visitors get no access at all.
revoke all on public.profiles from anon;

-- Keep timestamps honest regardless of what the client sends.
create or replace function public.profiles_set_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_timestamps
  before insert or update on public.profiles
  for each row execute function public.profiles_set_timestamps();
