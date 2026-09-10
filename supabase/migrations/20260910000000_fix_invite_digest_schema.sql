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
  where code_hash = encode(
      extensions.digest(upper(trim(invite_code)), 'sha256'),
      'hex'
    )
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

revoke all on function public.create_household_invite() from public;
revoke all on function public.join_household_by_code(text) from public;

grant execute on function public.create_household_invite() to authenticated;
grant execute on function public.join_household_by_code(text) to authenticated;
