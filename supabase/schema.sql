-- A Golden Promise: one redemption per rolling 365-day period.
-- Run this whole file in Supabase Dashboard > SQL Editor.

create table if not exists public.visit_pass_redemptions (
  id bigint generated always as identity primary key,
  request_id uuid not null unique,
  redeemed_at timestamptz not null default now(),
  email_status text not null default 'pending'
    check (email_status in ('pending', 'sent', 'failed')),
  email_id text,
  email_error text
);

alter table public.visit_pass_redemptions enable row level security;
revoke all on table public.visit_pass_redemptions from anon, authenticated;
grant all on table public.visit_pass_redemptions to service_role;

create or replace function public.claim_visit_pass(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.visit_pass_redemptions%rowtype;
  v_latest public.visit_pass_redemptions%rowtype;
  v_new public.visit_pass_redemptions%rowtype;
begin
  -- Serialize every redemption attempt, including two clicks arriving at once.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('golden-visit-pass-global-lock'));

  -- A retry after an email-provider error reuses the same request ID. It must
  -- resume the original redemption instead of consuming another yearly use.
  select * into v_existing
    from public.visit_pass_redemptions
    where request_id = p_request_id;

  if found then
    return pg_catalog.jsonb_build_object(
      'allowed', true,
      'request_id', v_existing.request_id,
      'status', v_existing.email_status,
      'redeemed_at', v_existing.redeemed_at,
      'already_exists', true
    );
  end if;

  select * into v_latest
    from public.visit_pass_redemptions
    order by redeemed_at desc
    limit 1;

  if found and v_latest.redeemed_at + interval '365 days' > pg_catalog.now() then
    return pg_catalog.jsonb_build_object(
      'allowed', false,
      'next_available_at', v_latest.redeemed_at + interval '365 days',
      'email_status', v_latest.email_status,
      'retry_request_id', case when v_latest.email_status <> 'sent' then v_latest.request_id else null end
    );
  end if;

  insert into public.visit_pass_redemptions (request_id, email_status)
    values (p_request_id, 'pending')
    returning * into v_new;

  return pg_catalog.jsonb_build_object(
    'allowed', true,
    'request_id', v_new.request_id,
    'status', v_new.email_status,
    'redeemed_at', v_new.redeemed_at,
    'already_exists', false
  );
end;
$$;

-- SECURITY DEFINER functions are executable by PUBLIC unless explicitly revoked.
revoke execute on function public.claim_visit_pass(uuid) from public;
revoke execute on function public.claim_visit_pass(uuid) from anon, authenticated;
grant execute on function public.claim_visit_pass(uuid) to service_role;
