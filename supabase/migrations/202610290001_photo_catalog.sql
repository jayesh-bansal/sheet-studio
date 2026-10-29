create table if not exists public.photo_assets (
  pathname text primary key,
  name text not null,
  template_id text not null,
  job_id text not null,
  size bigint not null default 0,
  content_type text not null default 'image/jpeg',
  uploaded_at timestamptz not null default now(),
  batch_id uuid
);

create index if not exists photo_assets_uploaded_at_idx on public.photo_assets (uploaded_at);
create index if not exists photo_assets_template_job_idx on public.photo_assets (template_id, job_id);

create table if not exists public.photo_batches (
  id uuid primary key,
  template_id text not null,
  job_id text not null,
  count integer not null check (count > 0),
  pathnames jsonb not null,
  completed_at timestamptz not null default now()
);

create index if not exists photo_batches_completed_at_idx on public.photo_batches (completed_at);

create table if not exists public.photo_sequences (
  template_id text not null,
  job_id text not null,
  next_number bigint not null default 1 check (next_number > 0),
  primary key (template_id, job_id)
);

create table if not exists public.app_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.photo_assets enable row level security;
alter table public.photo_batches enable row level security;
alter table public.photo_sequences enable row level security;
alter table public.app_state enable row level security;

revoke all on public.photo_assets, public.photo_batches, public.photo_sequences, public.app_state from anon, authenticated;
grant all on public.photo_assets, public.photo_batches, public.photo_sequences, public.app_state to service_role;

create or replace function public.reserve_photo_number(p_template_id text, p_job_id text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  allocated bigint;
begin
  insert into public.photo_sequences (template_id, job_id, next_number)
  values (p_template_id, p_job_id, 2)
  on conflict (template_id, job_id)
  do update set next_number = public.photo_sequences.next_number + 1
  returning next_number - 1 into allocated;
  return allocated;
end;
$$;

revoke all on function public.reserve_photo_number(text, text) from public, anon, authenticated;
grant execute on function public.reserve_photo_number(text, text) to service_role;

create or replace function public.advance_photo_sequence(p_template_id text, p_job_id text, p_next_number bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.photo_sequences (template_id, job_id, next_number)
  values (p_template_id, p_job_id, greatest(1, p_next_number))
  on conflict (template_id, job_id)
  do update set next_number = greatest(public.photo_sequences.next_number, excluded.next_number);
$$;

revoke all on function public.advance_photo_sequence(text, text, bigint) from public, anon, authenticated;
grant execute on function public.advance_photo_sequence(text, text, bigint) to service_role;
