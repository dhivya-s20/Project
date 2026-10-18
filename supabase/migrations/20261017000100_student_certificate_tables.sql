-- This migration creates the student certificate tables and a private bucket.
-- Certificate records and uploaded files are scoped to their submitting user.
create table if not exists public.document_types (
  document_type text primary key,
  display_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.document_types (document_type, display_name) values
  ('diploma_certificates', 'Diploma certificate'),
  ('10th_state_board_certificates', '10th State Board certificate'),
  ('10th_cbse_certificates', '10th CBSE certificate'),
  ('11th_state_board_certificates', '11th State Board certificate'),
  ('11th_cbse_certificates', '11th CBSE certificate'),
  ('12th_state_board_certificates', '12th State Board certificate'),
  ('12th_cbse_certificates', '12th CBSE certificate'),
  ('aadhaar_cards', 'Aadhaar card'),
  ('community_certificates', 'Community certificate'),
  ('birth_certificates', 'Birth certificate'),
  ('10th_tc_certificates', '10th Transfer Certificate'),
  ('12th_tc_certificates', '12th Transfer Certificate')
on conflict (document_type) do update set display_name = excluded.display_name;

create table if not exists public.diploma_certificates (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  student_name text, register_number text, date_of_birth date,
  document_type text not null default 'diploma_certificates' check (document_type = 'diploma_certificates'),
  file_url text not null, file_name text not null,
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','rejected')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public."10th_state_board_certificates" (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  student_name text, register_number text, date_of_birth date,
  document_type text not null default '10th_state_board_certificates' check (document_type = '10th_state_board_certificates'),
  file_url text not null, file_name text not null,
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','rejected')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public."10th_cbse_certificates" (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  student_name text, register_number text, date_of_birth date,
  document_type text not null default '10th_cbse_certificates' check (document_type = '10th_cbse_certificates'),
  file_url text not null, file_name text not null,
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','rejected')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public."11th_state_board_certificates" (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  student_name text, register_number text, date_of_birth date,
  document_type text not null default '11th_state_board_certificates' check (document_type = '11th_state_board_certificates'),
  file_url text not null, file_name text not null,
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','rejected')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public."11th_cbse_certificates" (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  student_name text, register_number text, date_of_birth date,
  document_type text not null default '11th_cbse_certificates' check (document_type = '11th_cbse_certificates'),
  file_url text not null, file_name text not null,
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','rejected')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public."12th_state_board_certificates" (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  student_name text, register_number text, date_of_birth date,
  document_type text not null default '12th_state_board_certificates' check (document_type = '12th_state_board_certificates'),
  file_url text not null, file_name text not null,
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','rejected')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public."12th_cbse_certificates" (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  student_name text, register_number text, date_of_birth date,
  document_type text not null default '12th_cbse_certificates' check (document_type = '12th_cbse_certificates'),
  file_url text not null, file_name text not null,
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','rejected')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
-- Do not persist a full Aadhaar number or a community category.
create table if not exists public.aadhaar_cards (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  student_name text, date_of_birth date,
  document_type text not null default 'aadhaar_cards' check (document_type = 'aadhaar_cards'),
  file_url text not null, file_name text not null,
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','rejected')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.community_certificates (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  student_name text,
  document_type text not null default 'community_certificates' check (document_type = 'community_certificates'),
  file_url text not null, file_name text not null,
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','rejected')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.birth_certificates (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  student_name text, date_of_birth date,
  document_type text not null default 'birth_certificates' check (document_type = 'birth_certificates'),
  file_url text not null, file_name text not null,
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','rejected')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public."10th_tc_certificates" (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  student_name text, register_number text, date_of_birth date,
  document_type text not null default '10th_tc_certificates' check (document_type = '10th_tc_certificates'),
  file_url text not null, file_name text not null,
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','rejected')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public."12th_tc_certificates" (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  student_name text, register_number text, date_of_birth date,
  document_type text not null default '12th_tc_certificates' check (document_type = '12th_tc_certificates'),
  file_url text not null, file_name text not null,
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','rejected')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create index if not exists diploma_certificates_owner_created_idx on public.diploma_certificates (owner_id, created_at desc);
create index if not exists diploma_certificates_register_idx on public.diploma_certificates (register_number) where register_number is not null;
create index if not exists "10th_state_board_certificates_owner_created_idx" on public."10th_state_board_certificates" (owner_id, created_at desc);
create index if not exists "10th_state_board_certificates_register_idx" on public."10th_state_board_certificates" (register_number) where register_number is not null;
create index if not exists "10th_cbse_certificates_owner_created_idx" on public."10th_cbse_certificates" (owner_id, created_at desc);
create index if not exists "10th_cbse_certificates_register_idx" on public."10th_cbse_certificates" (register_number) where register_number is not null;
create index if not exists "11th_state_board_certificates_owner_created_idx" on public."11th_state_board_certificates" (owner_id, created_at desc);
create index if not exists "11th_state_board_certificates_register_idx" on public."11th_state_board_certificates" (register_number) where register_number is not null;
create index if not exists "11th_cbse_certificates_owner_created_idx" on public."11th_cbse_certificates" (owner_id, created_at desc);
create index if not exists "11th_cbse_certificates_register_idx" on public."11th_cbse_certificates" (register_number) where register_number is not null;
create index if not exists "12th_state_board_certificates_owner_created_idx" on public."12th_state_board_certificates" (owner_id, created_at desc);
create index if not exists "12th_state_board_certificates_register_idx" on public."12th_state_board_certificates" (register_number) where register_number is not null;
create index if not exists "12th_cbse_certificates_owner_created_idx" on public."12th_cbse_certificates" (owner_id, created_at desc);
create index if not exists "12th_cbse_certificates_register_idx" on public."12th_cbse_certificates" (register_number) where register_number is not null;
create index if not exists aadhaar_cards_owner_created_idx on public.aadhaar_cards (owner_id, created_at desc);
create index if not exists community_certificates_owner_created_idx on public.community_certificates (owner_id, created_at desc);
create index if not exists birth_certificates_owner_created_idx on public.birth_certificates (owner_id, created_at desc);
create index if not exists "10th_tc_certificates_owner_created_idx" on public."10th_tc_certificates" (owner_id, created_at desc);
create index if not exists "10th_tc_certificates_register_idx" on public."10th_tc_certificates" (register_number) where register_number is not null;
create index if not exists "12th_tc_certificates_owner_created_idx" on public."12th_tc_certificates" (owner_id, created_at desc);
create index if not exists "12th_tc_certificates_register_idx" on public."12th_tc_certificates" (register_number) where register_number is not null;

-- No admin/role model exists in the current app. Authenticated users can only
-- insert and read their own submissions; verification status remains immutable
-- to ordinary clients until a trusted admin workflow is implemented.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'diploma_certificates', '10th_state_board_certificates', '10th_cbse_certificates',
    '11th_state_board_certificates', '11th_cbse_certificates',
    '12th_state_board_certificates', '12th_cbse_certificates', 'aadhaar_cards',
    'community_certificates', 'birth_certificates', '10th_tc_certificates', '12th_tc_certificates'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    execute format('grant select, insert on public.%I to authenticated', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_select_own', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_insert_own', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_owner_boundary', table_name);
    execute format('create policy %I on public.%I for select to authenticated using (owner_id = (select auth.uid()))', table_name || '_select_own', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (owner_id = (select auth.uid()) and verification_status = ''pending'' and file_url like (select auth.uid())::text || ''/%%'')', table_name || '_insert_own', table_name);
    execute format('create policy %I on public.%I as restrictive for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()) and verification_status = ''pending'' and file_url like (select auth.uid())::text || ''/%%'')', table_name || '_owner_boundary', table_name);
  end loop;
end $$;

alter table public.document_types enable row level security;
revoke all on public.document_types from public, anon, authenticated;
grant select on public.document_types to anon, authenticated;
drop policy if exists document_types_read on public.document_types;
create policy document_types_read on public.document_types for select to anon, authenticated using (is_active);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-certificates', 'student-certificates', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists student_certificates_insert_own on storage.objects;
drop policy if exists student_certificates_select_own on storage.objects;
drop policy if exists student_certificates_owner_boundary on storage.objects;
create policy student_certificates_insert_own on storage.objects
for insert to authenticated
with check (bucket_id = 'student-certificates' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy student_certificates_select_own on storage.objects
for select to authenticated
using (bucket_id = 'student-certificates' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy student_certificates_owner_boundary on storage.objects
as restrictive for all to anon, authenticated
using (bucket_id <> 'student-certificates' or (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id <> 'student-certificates' or (storage.foldername(name))[1] = (select auth.uid())::text);
