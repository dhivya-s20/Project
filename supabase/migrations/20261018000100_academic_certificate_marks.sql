-- Adds reviewed academic result fields and normalized subject-wise marks.
-- Main rows and their subject rows are inserted atomically by the RPC below.
do $$
declare
  certificate_table text;
begin
  foreach certificate_table in array array[
    'diploma_certificates', '10th_state_board_certificates', '10th_cbse_certificates',
    '11th_state_board_certificates', '11th_cbse_certificates',
    '12th_state_board_certificates', '12th_cbse_certificates'
  ] loop
    execute format('alter table public.%I
      add column if not exists exam_year smallint,
      add column if not exists exam_session text,
      add column if not exists board_name text,
      add column if not exists institution_name text,
      add column if not exists student_name_confidence numeric(5,2),
      add column if not exists total_marks numeric(9,2),
      add column if not exists maximum_total_marks numeric(9,2),
      add column if not exists percentage numeric(5,2),
      add column if not exists official_total_marks numeric(9,2),
      add column if not exists official_maximum_total_marks numeric(9,2),
      add column if not exists official_percentage numeric(5,2),
      add column if not exists total_mismatch boolean,
      add column if not exists needs_review boolean not null default false,
      add column if not exists review_fields text[] not null default ''{}'',
      add column if not exists ocr_confidence numeric(5,2)', certificate_table);
  end loop;
end $$;

create table if not exists public.certificate_subject_marks (
  id uuid primary key default gen_random_uuid(),
  certificate_id uuid not null,
  certificate_table text not null check (certificate_table in (
    'diploma_certificates', '10th_state_board_certificates', '10th_cbse_certificates',
    '11th_state_board_certificates', '11th_cbse_certificates',
    '12th_state_board_certificates', '12th_cbse_certificates'
  )),
  sort_order integer not null default 0 check (sort_order >= 0),
  subject_name text not null check (length(btrim(subject_name)) > 0),
  marks_obtained numeric(8,2) check (marks_obtained is null or marks_obtained >= 0),
  maximum_marks numeric(8,2) check (maximum_marks is null or maximum_marks > 0),
  theory_marks numeric(8,2) check (theory_marks is null or theory_marks >= 0),
  theory_maximum_marks numeric(8,2) check (theory_maximum_marks is null or theory_maximum_marks > 0),
  practical_marks numeric(8,2) check (practical_marks is null or practical_marks >= 0),
  practical_maximum_marks numeric(8,2) check (practical_maximum_marks is null or practical_maximum_marks > 0),
  result_status text not null default 'unreadable' check (result_status in ('numeric','absent','grade','unreadable')),
  grade_value text,
  raw_marks text,
  is_optional boolean not null default false,
  confidence numeric(5,2) check (confidence is null or confidence between 0 and 100),
  needs_review boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists certificate_subject_marks_parent_idx
  on public.certificate_subject_marks (certificate_table, certificate_id);

alter table public.certificate_subject_marks enable row level security;
revoke all on public.certificate_subject_marks from public, anon, authenticated;
grant select, insert on public.certificate_subject_marks to authenticated;
drop policy if exists certificate_subject_marks_select_own on public.certificate_subject_marks;
drop policy if exists certificate_subject_marks_insert_own on public.certificate_subject_marks;
create policy certificate_subject_marks_select_own on public.certificate_subject_marks
for select to authenticated using (
  (certificate_table = 'diploma_certificates' and exists (select 1 from public.diploma_certificates p where p.id = certificate_id and p.owner_id = (select auth.uid()))) or
  (certificate_table = '10th_state_board_certificates' and exists (select 1 from public."10th_state_board_certificates" p where p.id = certificate_id and p.owner_id = (select auth.uid()))) or
  (certificate_table = '10th_cbse_certificates' and exists (select 1 from public."10th_cbse_certificates" p where p.id = certificate_id and p.owner_id = (select auth.uid()))) or
  (certificate_table = '11th_state_board_certificates' and exists (select 1 from public."11th_state_board_certificates" p where p.id = certificate_id and p.owner_id = (select auth.uid()))) or
  (certificate_table = '11th_cbse_certificates' and exists (select 1 from public."11th_cbse_certificates" p where p.id = certificate_id and p.owner_id = (select auth.uid()))) or
  (certificate_table = '12th_state_board_certificates' and exists (select 1 from public."12th_state_board_certificates" p where p.id = certificate_id and p.owner_id = (select auth.uid()))) or
  (certificate_table = '12th_cbse_certificates' and exists (select 1 from public."12th_cbse_certificates" p where p.id = certificate_id and p.owner_id = (select auth.uid())))
);
create policy certificate_subject_marks_insert_own on public.certificate_subject_marks
for insert to authenticated with check (
  (certificate_table = 'diploma_certificates' and exists (select 1 from public.diploma_certificates p where p.id = certificate_id and p.owner_id = (select auth.uid()))) or
  (certificate_table = '10th_state_board_certificates' and exists (select 1 from public."10th_state_board_certificates" p where p.id = certificate_id and p.owner_id = (select auth.uid()))) or
  (certificate_table = '10th_cbse_certificates' and exists (select 1 from public."10th_cbse_certificates" p where p.id = certificate_id and p.owner_id = (select auth.uid()))) or
  (certificate_table = '11th_state_board_certificates' and exists (select 1 from public."11th_state_board_certificates" p where p.id = certificate_id and p.owner_id = (select auth.uid()))) or
  (certificate_table = '11th_cbse_certificates' and exists (select 1 from public."11th_cbse_certificates" p where p.id = certificate_id and p.owner_id = (select auth.uid()))) or
  (certificate_table = '12th_state_board_certificates' and exists (select 1 from public."12th_state_board_certificates" p where p.id = certificate_id and p.owner_id = (select auth.uid()))) or
  (certificate_table = '12th_cbse_certificates' and exists (select 1 from public."12th_cbse_certificates" p where p.id = certificate_id and p.owner_id = (select auth.uid())))
);

create or replace function public.save_academic_certificate(
  p_category text,
  p_certificate jsonb,
  p_subject_marks jsonb
) returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication is required to save an academic certificate.';
  end if;
  if p_category is null or p_category not in (
    'diploma_certificates', '10th_state_board_certificates', '10th_cbse_certificates',
    '11th_state_board_certificates', '11th_cbse_certificates',
    '12th_state_board_certificates', '12th_cbse_certificates'
  ) then
    raise exception using errcode = '22023', message = 'Unsupported academic certificate table.';
  end if;
  if p_certificate is null or p_subject_marks is null
     or jsonb_typeof(p_certificate) <> 'object' or jsonb_typeof(p_subject_marks) <> 'array' then
    raise exception using errcode = '22023', message = 'Certificate data or subject marks have an invalid structure.';
  end if;
  if p_certificate->>'owner_id' is distinct from auth.uid()::text
     or p_certificate->>'document_type' is distinct from p_category
     or p_certificate->>'verification_status' is distinct from 'pending'
     or split_part(coalesce(p_certificate->>'file_url', ''), '/', 1) is distinct from auth.uid()::text then
    raise exception using errcode = '42501', message = 'Certificate ownership or private file path does not match the signed-in user.';
  end if;

  execute format(
    'insert into public.%1$I (
       id, owner_id, student_name, register_number, date_of_birth, document_type,
       file_url, file_name, verification_status, exam_year, exam_session,
       board_name, institution_name, student_name_confidence, total_marks,
       maximum_total_marks, percentage, official_total_marks,
       official_maximum_total_marks, official_percentage, total_mismatch,
       needs_review, review_fields, ocr_confidence
     )
     select x.id, x.owner_id, x.student_name, x.register_number, x.date_of_birth,
       x.document_type, x.file_url, x.file_name, x.verification_status, x.exam_year,
       x.exam_session, x.board_name, x.institution_name, x.student_name_confidence, x.total_marks,
       x.maximum_total_marks, x.percentage, x.official_total_marks,
       x.official_maximum_total_marks, x.official_percentage, x.total_mismatch,
       x.needs_review, x.review_fields, x.ocr_confidence
     from jsonb_populate_record(null::public.%1$I, $1) as x
     returning id', p_category
  ) into v_id using p_certificate;

  insert into public.certificate_subject_marks (
    certificate_id, certificate_table, sort_order, subject_name, marks_obtained, maximum_marks,
    theory_marks, theory_maximum_marks, practical_marks, practical_maximum_marks,
    result_status, grade_value, raw_marks, is_optional, confidence, needs_review
  )
  select v_id, p_category, coalesce(s.sort_order, 0), s.subject_name, s.marks_obtained, s.maximum_marks,
    s.theory_marks, s.theory_maximum_marks, s.practical_marks, s.practical_maximum_marks,
    coalesce(s.result_status, 'unreadable'), s.grade_value, s.raw_marks,
    coalesce(s.is_optional, false), s.confidence, coalesce(s.needs_review, true)
  from jsonb_to_recordset(p_subject_marks) as s(
    sort_order integer, subject_name text, marks_obtained numeric, maximum_marks numeric,
    theory_marks numeric, theory_maximum_marks numeric, practical_marks numeric,
    practical_maximum_marks numeric, result_status text, grade_value text,
    raw_marks text, is_optional boolean, confidence numeric, needs_review boolean
  );

  return v_id;
end;
$$;

revoke all on function public.save_academic_certificate(text, jsonb, jsonb) from public, anon;
grant execute on function public.save_academic_certificate(text, jsonb, jsonb) to authenticated;
