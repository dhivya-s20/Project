-- Permit owners to correct only their own pending academic submissions.
-- Correction runs through an authenticated, RLS-respecting RPC and replaces
-- parent metadata and subject rows atomically.
do $$
declare
  certificate_table text;
begin
  foreach certificate_table in array array[
    'diploma_certificates', '10th_state_board_certificates', '10th_cbse_certificates',
    '11th_state_board_certificates', '11th_cbse_certificates',
    '12th_state_board_certificates', '12th_cbse_certificates'
  ] loop
    execute format('grant update on public.%I to authenticated', certificate_table);
    execute format('drop policy if exists %I on public.%I', certificate_table || '_update_pending_own', certificate_table);
    execute format(
      'create policy %I on public.%I for update to authenticated using (owner_id = (select auth.uid()) and verification_status = ''pending'') with check (owner_id = (select auth.uid()) and verification_status = ''pending'')',
      certificate_table || '_update_pending_own', certificate_table
    );
  end loop;
end $$;

grant delete on public.certificate_subject_marks to authenticated;
drop policy if exists certificate_subject_marks_delete_own_pending on public.certificate_subject_marks;
create policy certificate_subject_marks_delete_own_pending on public.certificate_subject_marks
for delete to authenticated using (
  (certificate_table = 'diploma_certificates' and exists (select 1 from public.diploma_certificates p where p.id = certificate_id and p.owner_id = (select auth.uid()) and p.verification_status = 'pending')) or
  (certificate_table = '10th_state_board_certificates' and exists (select 1 from public."10th_state_board_certificates" p where p.id = certificate_id and p.owner_id = (select auth.uid()) and p.verification_status = 'pending')) or
  (certificate_table = '10th_cbse_certificates' and exists (select 1 from public."10th_cbse_certificates" p where p.id = certificate_id and p.owner_id = (select auth.uid()) and p.verification_status = 'pending')) or
  (certificate_table = '11th_state_board_certificates' and exists (select 1 from public."11th_state_board_certificates" p where p.id = certificate_id and p.owner_id = (select auth.uid()) and p.verification_status = 'pending')) or
  (certificate_table = '11th_cbse_certificates' and exists (select 1 from public."11th_cbse_certificates" p where p.id = certificate_id and p.owner_id = (select auth.uid()) and p.verification_status = 'pending')) or
  (certificate_table = '12th_state_board_certificates' and exists (select 1 from public."12th_state_board_certificates" p where p.id = certificate_id and p.owner_id = (select auth.uid()) and p.verification_status = 'pending')) or
  (certificate_table = '12th_cbse_certificates' and exists (select 1 from public."12th_cbse_certificates" p where p.id = certificate_id and p.owner_id = (select auth.uid()) and p.verification_status = 'pending'))
);

create or replace function public.update_academic_certificate(
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
    raise exception using errcode = '42501', message = 'Authentication is required to correct an academic certificate.';
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
    'update public.%1$I as target
     set student_name = source.student_name,
       register_number = source.register_number,
       date_of_birth = source.date_of_birth,
       file_name = source.file_name,
       exam_year = source.exam_year,
       exam_session = source.exam_session,
       board_name = source.board_name,
       institution_name = source.institution_name,
       student_name_confidence = source.student_name_confidence,
       total_marks = source.total_marks,
       maximum_total_marks = source.maximum_total_marks,
       percentage = source.percentage,
       official_total_marks = source.official_total_marks,
       official_maximum_total_marks = source.official_maximum_total_marks,
       official_percentage = source.official_percentage,
       total_mismatch = source.total_mismatch,
       needs_review = source.needs_review,
       review_fields = source.review_fields,
       ocr_confidence = source.ocr_confidence,
       updated_at = now()
     from jsonb_populate_record(null::public.%1$I, $1) as source
     where target.id = source.id
       and target.owner_id = auth.uid()
       and target.verification_status = ''pending''
       and target.document_type = $2
       and target.file_url = source.file_url
     returning target.id', p_category
  ) into v_id using p_certificate, p_category;

  if v_id is null then
    raise exception using errcode = '42501', message = 'No editable pending certificate belonging to this user was found.';
  end if;

  delete from public.certificate_subject_marks
  where certificate_id = v_id and certificate_table = p_category;

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

revoke all on function public.update_academic_certificate(text, jsonb, jsonb) from public, anon;
grant execute on function public.update_academic_certificate(text, jsonb, jsonb) to authenticated;
