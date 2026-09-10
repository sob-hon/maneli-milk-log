create extension if not exists pgcrypto;

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'parent' check (role in ('owner', 'parent')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id),
  unique (user_id)
);

create table public.babies (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);

create table public.feedings (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  baby_id uuid not null references public.babies(id) on delete cascade,
  amount_ml integer not null check (amount_ml between 1 and 1000),
  fed_at timestamptz not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index feedings_household_fed_at_idx
  on public.feedings (household_id, fed_at desc)
  where deleted_at is null;

create table public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  code_hash text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = target_household_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger feedings_set_updated_at
before update on public.feedings
for each row execute function public.set_updated_at();

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.babies enable row level security;
alter table public.feedings enable row level security;
alter table public.household_invites enable row level security;

create policy "members read their household"
on public.households for select to authenticated
using (public.is_household_member(id));

create policy "members read household members"
on public.household_members for select to authenticated
using (public.is_household_member(household_id));

create policy "members read their babies"
on public.babies for select to authenticated
using (public.is_household_member(household_id));

create policy "members read their feedings"
on public.feedings for select to authenticated
using (public.is_household_member(household_id));

create policy "members add feedings"
on public.feedings for insert to authenticated
with check (
  public.is_household_member(household_id)
  and created_by = auth.uid()
  and exists (
    select 1 from public.babies
    where babies.id = baby_id
      and babies.household_id = feedings.household_id
  )
);

create policy "members update feedings"
on public.feedings for update to authenticated
using (public.is_household_member(household_id))
with check (
  public.is_household_member(household_id)
  and exists (
    select 1 from public.babies
    where babies.id = baby_id
      and babies.household_id = feedings.household_id
  )
);

create policy "members read active invites"
on public.household_invites for select to authenticated
using (public.is_household_member(household_id));

create or replace function public.create_household_and_baby(
  household_name text,
  baby_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_household_id uuid;
  existing_household_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in before creating a family log';
  end if;

  select household_id into existing_household_id
  from public.household_members
  where user_id = auth.uid()
  limit 1;

  if existing_household_id is not null then
    return existing_household_id;
  end if;

  insert into public.households (name, owner_user_id)
  values (trim(household_name), auth.uid())
  returning id into new_household_id;

  insert into public.household_members (household_id, user_id, role)
  values (new_household_id, auth.uid(), 'owner');

  insert into public.babies (household_id, name)
  values (new_household_id, trim(baby_name));

  return new_household_id;
end;
$$;

create or replace function public.create_household_invite()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  member_household_id uuid;
  plain_code text;
begin
  select household_id into member_household_id
  from public.household_members
  where user_id = auth.uid()
  limit 1;

  if member_household_id is null then
    raise exception 'Create or join a family log first';
  end if;

  plain_code := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));

  insert into public.household_invites (
    household_id,
    code_hash,
    created_by,
    expires_at
  ) values (
    member_household_id,
    encode(extensions.digest(plain_code, 'sha256'), 'hex'),
    auth.uid(),
    now() + interval '7 days'
  );

  return plain_code;
end;
$$;

create or replace function public.join_household_by_code(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_invite public.household_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in before joining a family log';
  end if;

  if exists (select 1 from public.household_members where user_id = auth.uid()) then
    raise exception 'This account already belongs to a family log';
  end if;

  select * into matched_invite
  from public.household_invites
  where code_hash = encode(extensions.digest(upper(trim(invite_code)), 'sha256'), 'hex')
    and redeemed_at is null
    and expires_at > now()
  for update;

  if matched_invite.id is null then
    raise exception 'That invitation code is invalid or has expired';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (matched_invite.household_id, auth.uid(), 'parent');

  update public.household_invites
  set redeemed_at = now(), redeemed_by = auth.uid()
  where id = matched_invite.id;

  return matched_invite.household_id;
end;
$$;

revoke all on public.households from anon, authenticated;
revoke all on public.household_members from anon, authenticated;
revoke all on public.babies from anon, authenticated;
revoke all on public.feedings from anon, authenticated;
revoke all on public.household_invites from anon, authenticated;

grant select on public.households to authenticated;
grant select on public.household_members to authenticated;
grant select on public.babies to authenticated;
grant select, insert, update on public.feedings to authenticated;
grant select on public.household_invites to authenticated;

revoke all on function public.is_household_member(uuid) from public;
revoke all on function public.create_household_and_baby(text, text) from public;
revoke all on function public.create_household_invite() from public;
revoke all on function public.join_household_by_code(text) from public;

grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.create_household_and_baby(text, text) to authenticated;
grant execute on function public.create_household_invite() to authenticated;
grant execute on function public.join_household_by_code(text) to authenticated;

alter publication supabase_realtime add table public.feedings;
