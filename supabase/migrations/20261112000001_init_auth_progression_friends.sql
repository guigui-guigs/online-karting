create schema if not exists private;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  friend_code text not null unique,
  display_name text not null default 'Pilote' check (char_length(display_name) between 1 and 16),
  avatar_url text,
  favorite_racer text not null default 'red',
  xp integer not null default 0 check (xp >= 0),
  level integer not null default 1 check (level between 1 and 99),
  title text not null default 'Rookie du Bitume',
  coins integer not null default 0 check (coins >= 0),
  races_played integer not null default 0 check (races_played >= 0),
  wins integer not null default 0 check (wins >= 0),
  podiums integer not null default 0 check (podiums >= 0),
  trophies_won integer not null default 0 check (trophies_won >= 0),
  unlocked_racers text[] not null default array['red', 'aqua', 'kiwi'],
  profile_data jsonb not null default '{}'::jsonb,
  active_room_code text check (active_room_code is null or char_length(active_room_code) <= 8),
  active_room_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_xp_desc_idx on public.profiles (xp desc);

create table if not exists public.track_records (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  track_id text not null check (char_length(track_id) between 1 and 32),
  best_time_ms integer not null check (best_time_ms between 5000 and 600000),
  racer_id text not null default 'red',
  kart_id text not null default 'classic',
  ghost_token text check (ghost_token is null or char_length(ghost_token) <= 24000),
  updated_at timestamptz not null default now(),
  unique (user_id, track_id)
);

create index if not exists track_records_leaderboard_idx
  on public.track_records (track_id, best_time_ms asc);

create table if not exists public.friendships (
  id bigint generated always as identity primary key,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> addressee_id),
  unique (requester_id, addressee_id)
);

create unique index if not exists friendships_pair_unique_idx
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists friendships_requester_id_idx on public.friendships (requester_id);
create index if not exists friendships_addressee_id_idx on public.friendships (addressee_id);

create table if not exists public.room_invites (
  id bigint generated always as identity primary key,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  room_code text not null check (char_length(room_code) between 4 and 8),
  track_id text not null default 'coco',
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);

create index if not exists room_invites_recipient_created_idx
  on public.room_invites (recipient_id, created_at desc);
create index if not exists room_invites_sender_id_idx on public.room_invites (sender_id);

-- Private helper & trigger to auto-create profile + unique PK-XXXX friend code on signup
create or replace function private.generate_friend_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  i integer;
  attempt integer;
begin
  for attempt in 1..40 loop
    candidate := 'PK-';
    for i in 1..4 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
    end loop;
    if not exists (select 1 from public.profiles where friend_code = candidate) then
      return candidate;
    end if;
  end loop;
  return 'PK-' || upper(substr(md5(random()::text), 1, 6));
end;
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  raw_name text;
  clean_name text;
  avatar text;
begin
  raw_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(coalesce(new.email, ''), '@', 1),
    'Pilote'
  );
  clean_name := coalesce(nullif(left(trim(regexp_replace(raw_name, '\s+', ' ', 'g')), 14), ''), 'Pilote');
  avatar := nullif(trim(coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', '')), '');

  insert into public.profiles (id, friend_code, display_name, avatar_url)
  values (new.id, private.generate_friend_code(), clean_name, avatar)
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on schema private from public, anon, authenticated;
revoke execute on function private.generate_friend_code() from public, anon, authenticated;
revoke execute on function private.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Explicit Data API grants
grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.track_records to anon, authenticated;
grant insert, update on public.profiles, public.track_records to authenticated;
grant select, insert, update, delete on public.friendships, public.room_invites to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Enable RLS on all exposed tables
alter table public.profiles enable row level security;
alter table public.track_records enable row level security;
alter table public.friendships enable row level security;
alter table public.room_invites enable row level security;

-- RLS Policies: profiles
create policy "profiles_select_all"
  on public.profiles for select
  to anon, authenticated
  using (true);

create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- RLS Policies: track_records
create policy "track_records_select_all"
  on public.track_records for select
  to anon, authenticated
  using (true);

create policy "track_records_insert_own"
  on public.track_records for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "track_records_update_own"
  on public.track_records for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- RLS Policies: friendships
create policy "friendships_select_involved"
  on public.friendships for select
  to authenticated
  using ((select auth.uid()) = requester_id or (select auth.uid()) = addressee_id);

create policy "friendships_insert_requester"
  on public.friendships for insert
  to authenticated
  with check (
    (select auth.uid()) = requester_id
    and requester_id <> addressee_id
    and status = 'pending'
  );

create policy "friendships_update_addressee"
  on public.friendships for update
  to authenticated
  using ((select auth.uid()) = addressee_id)
  with check ((select auth.uid()) = addressee_id and status = 'accepted');

create policy "friendships_delete_involved"
  on public.friendships for delete
  to authenticated
  using ((select auth.uid()) = requester_id or (select auth.uid()) = addressee_id);

-- RLS Policies: room_invites
create policy "room_invites_select_involved"
  on public.room_invites for select
  to authenticated
  using ((select auth.uid()) = sender_id or (select auth.uid()) = recipient_id);

create policy "room_invites_insert_sender"
  on public.room_invites for insert
  to authenticated
  with check ((select auth.uid()) = sender_id and sender_id <> recipient_id);

create policy "room_invites_delete_involved"
  on public.room_invites for delete
  to authenticated
  using ((select auth.uid()) = sender_id or (select auth.uid()) = recipient_id);

-- Enable Realtime notifications for room_invites & friendships (safe idempotent block)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.room_invites;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.friendships;
    exception when duplicate_object then null;
    end;
  end if;
end $$;
