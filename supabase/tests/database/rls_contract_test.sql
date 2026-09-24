-- Authorization contract for an isolated local Supabase database.
-- It covers visitor, authenticated user, author, operator and Storage access.

begin;

create extension if not exists pgtap with schema extensions;

select plan(68);

select has_table('public', 'reports', 'reports table exists');
select has_table('public', 'votes', 'votes table exists');
select has_table('public', 'push_tokens', 'push_tokens table exists');
select has_table('public', 'operator_users', 'operator_users table exists');
select has_table('public', 'report_status_history', 'status history table exists');

insert into auth.users (id, email) values
  ('20000000-0000-0000-0000-000000000001', 'author@example.invalid'),
  ('20000000-0000-0000-0000-000000000002', 'other@example.invalid'),
  ('20000000-0000-0000-0000-000000000003', 'operator@example.invalid');

insert into public.reports (
  id, category, title, description, ra, address, lat, lng, status,
  confirmations, author_id, author_name
) values
  (
    '10000000-0000-0000-0000-000000000001', 'buraco',
    'Other user report', 'Test data', 'Plano Piloto', 'Test address',
    -15.79, -47.88, 'aberto', 0,
    '20000000-0000-0000-0000-000000000002', 'Cidadão'
  ),
  (
    '10000000-0000-0000-0000-000000000002', 'buraco',
    'Author report', 'Test data', 'Plano Piloto', 'Test address',
    -15.79, -47.88, 'aberto', 0,
    '20000000-0000-0000-0000-000000000001', 'Cidadão'
  ),
  (
    '10000000-0000-0000-0000-000000000003', 'lixo',
    'Report to delete', 'Test data', 'Plano Piloto', 'Test address',
    -15.80, -47.89, 'aberto', 0,
    '20000000-0000-0000-0000-000000000001', 'Cidadão'
  );

insert into public.votes (report_id, device_id, user_id) values (
  '10000000-0000-0000-0000-000000000001',
  'rls-other-device',
  '20000000-0000-0000-0000-000000000002'
);

-- Populate private data before testing denied reads: an empty table cannot
-- distinguish working RLS from an accidentally permissive policy.
insert into public.report_status_history (
  report_id, from_status, to_status, reason, changed_by
) values (
  '10000000-0000-0000-0000-000000000002', 'andamento', 'aberto',
  'Historical fixture for authorization tests.',
  '20000000-0000-0000-0000-000000000003'
);

insert into public.push_tokens (user_id, token, platform) values (
  '20000000-0000-0000-0000-000000000002',
  'synthetic-test-token-not-a-real-device', 'android'
);

insert into storage.objects (bucket_id, name, owner_id) values (
  'report-photos',
  '20000000-0000-0000-0000-000000000002/other.jpg',
  '20000000-0000-0000-0000-000000000002'
);

select results_eq(
  $$select count(*) from pg_constraint where conrelid = 'public.reports'::regclass and confrelid = 'auth.users'::regclass and contype = 'f'$$,
  array[1::bigint],
  'reports has an Auth user foreign key'
);

select results_eq(
  $$select count(*) from pg_constraint where conrelid = 'public.votes'::regclass and confrelid = 'auth.users'::regclass and contype = 'f'$$,
  array[1::bigint],
  'votes has an Auth user foreign key'
);

select results_eq(
  $$select count(*) from pg_policies where schemaname = 'public' and tablename = 'reports'$$,
  array[4::bigint],
  'reports has only the four explicit policies'
);

select results_eq(
  $$select count(*) from pg_policies where schemaname = 'public' and tablename = 'votes'$$,
  array[1::bigint],
  'votes has only its own-row read policy'
);

select results_eq(
  $$select confirmations from public.reports where id = '10000000-0000-0000-0000-000000000001'$$,
  array[1],
  'the vote trigger updates the materialized count in the same transaction'
);

set local role anon;

select results_eq(
  $$select count(*) from public.reports where id = '10000000-0000-0000-0000-000000000001'$$,
  array[1::bigint],
  'visitors may read public report fields'
);

select throws_ok(
  $$select author_id from public.reports limit 1$$,
  '42501', null,
  'visitors cannot read internal report authorship'
);

select throws_ok(
  $$insert into public.reports (category, title, description, ra, address, lat, lng) values ('buraco', 'Forged report', 'Test data', 'Plano Piloto', 'Test address', -15.79, -47.88)$$,
  '42501', null,
  'visitors cannot create reports'
);

select throws_ok(
  $$update public.reports set title = 'Anonymous update' where id = '10000000-0000-0000-0000-000000000001'$$,
  '42501', null,
  'visitors cannot update reports'
);

select throws_ok(
  $$delete from public.reports where id = '10000000-0000-0000-0000-000000000001'$$,
  '42501', null,
  'visitors cannot delete reports'
);

select throws_ok(
  $$select count(*) from public.push_tokens$$,
  '42501', null,
  'visitors cannot read push tokens'
);

select throws_ok(
  $$select count(*) from public.votes$$,
  '42501', null,
  'visitors cannot read vote identities'
);

select throws_ok(
  $$select count(*) from public.operator_users$$,
  '42501', null,
  'visitors cannot inspect operator membership'
);

select throws_ok(
  $$select count(*) from public.report_status_history$$,
  '42501', null,
  'visitors cannot read operational history'
);

select throws_ok(
  $$select count(*) from public.get_my_reports(-16, -48, -15, -47, null, null, 10)$$,
  '42501', null,
  'visitors cannot call the private ownership query'
);

select throws_ok(
  $$select public.set_report_vote('10000000-0000-0000-0000-000000000001', true, 'anonymous-device')$$,
  '42501', null,
  'visitors cannot call the vote RPC'
);

select results_eq(
  $$select count(*) from storage.objects where bucket_id = 'report-photos'$$,
  array[0::bigint],
  'visitors cannot list public bucket object metadata'
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id) values ('report-photos', 'anonymous/photo.jpg', null)$$,
  '42501', null,
  'visitors cannot upload report photos'
);

reset role;
select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-0000-0000-000000000001',
  true
);
set local role authenticated;

select results_eq(
  $$select count(*) from public.push_tokens$$,
  array[0::bigint],
  'authenticated users may query only push token rows allowed by RLS'
);

select results_eq(
  $$select public.current_user_is_operator()$$,
  array[false],
  'ordinary authenticated users are not operators'
);

select results_eq(
  $$select count(*) from public.report_status_history$$,
  array[0::bigint],
  'ordinary users receive an empty status history through RLS'
);

select throws_ok(
  $$select author_id from public.reports limit 1$$,
  '42501', null,
  'authenticated users cannot enumerate internal report authorship'
);

select throws_ok(
  $$update public.reports set status = 'andamento' where id = '10000000-0000-0000-0000-000000000002'$$,
  '42501', null,
  'ordinary users cannot change report status directly'
);

select throws_ok(
  $$select public.change_report_status('10000000-0000-0000-0000-000000000002', 'andamento', 'Equipe iniciou a análise.')$$,
  '42501', null,
  'ordinary users cannot change report status through the RPC'
);

select lives_ok(
  $$insert into public.reports (category, title, description, ra, address, lat, lng) values ('buraco', 'New own report', 'Test data', 'Plano Piloto', 'Test address', -15.79, -47.88)$$,
  'authenticated users may create reports without choosing the author'
);

select results_eq(
  $$select report_id from public.get_my_report_ids(array['10000000-0000-0000-0000-000000000002'::uuid, '10000000-0000-0000-0000-000000000001'::uuid]) order by report_id$$,
  $$values ('10000000-0000-0000-0000-000000000002'::uuid)$$,
  'the ownership RPC returns only the current users report IDs'
);

select results_eq(
  $$select count(*) from public.get_my_reports(-16, -48, -15, -47, array['buraco'], 'aberto', 10)$$,
  array[2::bigint],
  'the owned report query applies actor, viewport and filters in the database'
);

select throws_ok(
  $$insert into public.reports (category, title, description, ra, address, lat, lng, author_id) values ('buraco', 'Forged author', 'Test data', 'Plano Piloto', 'Test address', -15.79, -47.88, '20000000-0000-0000-0000-000000000002')$$,
  '42501', null,
  'authenticated users cannot choose a report author'
);

select lives_ok(
  $$update public.reports set title = 'Updated own report' where id = '10000000-0000-0000-0000-000000000002'$$,
  'authors may edit an allowed field on their own reports'
);

select results_eq(
  $$with changed as (update public.reports set title = 'Forged update' where id = '10000000-0000-0000-0000-000000000001' returning id) select count(*) from changed$$,
  array[0::bigint],
  'authors cannot update another users report'
);

select results_eq(
  $$with removed as (delete from public.reports where id = '10000000-0000-0000-0000-000000000001' returning id) select count(*) from removed$$,
  array[0::bigint],
  'authors cannot delete another users report'
);

select throws_ok(
  $$update public.reports set confirmations = 99 where id = '10000000-0000-0000-0000-000000000002'$$,
  '42501', null,
  'clients cannot update the materialized confirmation count'
);

select throws_ok(
  $$update public.reports set author_id = '20000000-0000-0000-0000-000000000002' where id = '10000000-0000-0000-0000-000000000002'$$,
  '42501', null,
  'clients cannot transfer report authorship'
);

select results_eq(
  $$with removed as (delete from public.reports where id = '10000000-0000-0000-0000-000000000003' returning id) select count(*) from removed$$,
  array[1::bigint],
  'authors may delete their own reports'
);

select throws_ok(
  $$insert into public.votes (report_id, device_id, user_id) values ('10000000-0000-0000-0000-000000000002', 'rls-own-device', '20000000-0000-0000-0000-000000000001')$$,
  '42501', null,
  'authenticated users cannot insert votes directly'
);

select throws_ok(
  $$delete from public.votes where report_id = '10000000-0000-0000-0000-000000000001'$$,
  '42501', null,
  'authenticated users cannot delete votes directly'
);

select results_eq(
  $$select * from public.set_report_vote('10000000-0000-0000-0000-000000000002', true, 'rls-own-device')$$,
  $$values (true, 1)$$,
  'the RPC creates the authenticated users vote'
);

select results_eq(
  $$select * from public.set_report_vote('10000000-0000-0000-0000-000000000002', true, 'second-device-value')$$,
  $$values (true, 1)$$,
  'repeating the desired vote is idempotent'
);

select results_eq(
  $$select count(*) from public.votes where report_id = '10000000-0000-0000-0000-000000000002'$$,
  array[1::bigint],
  'one account creates only one vote per report'
);

select results_eq(
  $$select confirmations from public.reports where id = '10000000-0000-0000-0000-000000000002'$$,
  array[1],
  'the materialized count follows the inserted vote'
);

select results_eq(
  $$select report_id from public.votes where report_id = '10000000-0000-0000-0000-000000000002'$$,
  $$values ('10000000-0000-0000-0000-000000000002'::uuid)$$,
  'authenticated users can read their own vote report ID'
);

select throws_ok(
  $$select user_id from public.votes limit 1$$,
  '42501', null,
  'authenticated users cannot read vote identity columns'
);

select results_eq(
  $$select * from public.set_report_vote('10000000-0000-0000-0000-000000000002', false, 'rls-own-device')$$,
  $$values (false, 0)$$,
  'the RPC removes the authenticated users vote'
);

select results_eq(
  $$select * from public.set_report_vote('10000000-0000-0000-0000-000000000002', false, 'rls-own-device')$$,
  $$values (false, 0)$$,
  'repeating vote removal is idempotent'
);

select results_eq(
  $$select count(*) from public.votes where report_id = '10000000-0000-0000-0000-000000000002'$$,
  array[0::bigint],
  'idempotent removal leaves no user vote'
);

select results_eq(
  $$select confirmations from public.reports where id = '10000000-0000-0000-0000-000000000002'$$,
  array[0],
  'the materialized count follows vote removal'
);

select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner_id) values ('report-photos', '20000000-0000-0000-0000-000000000001/own.jpg', '20000000-0000-0000-0000-000000000001')$$,
  'authenticated users may upload into their own folder'
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id) values ('report-photos', '20000000-0000-0000-0000-000000000002/wrong-folder.jpg', '20000000-0000-0000-0000-000000000001')$$,
  '42501', null,
  'authenticated users cannot upload into another users folder'
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id) values ('report-photos', '20000000-0000-0000-0000-000000000001/forged-owner.jpg', '20000000-0000-0000-0000-000000000002')$$,
  '42501', null,
  'authenticated users cannot forge Storage ownership'
);

select results_eq(
  $$select count(*) from storage.objects where bucket_id = 'report-photos'$$,
  array[1::bigint],
  'authenticated users may list only their own report photos'
);

reset role;

select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-0000-0000-000000000001',
  true
);
set local role authenticated;

select results_eq(
  $$select count(*) from storage.objects where name like '%other.jpg'$$,
  array[0::bigint],
  'another users photo metadata is hidden by Storage RLS'
);

select results_eq(
  $$with removed as (delete from storage.objects where name like '%other.jpg' returning id) select count(*) from removed$$,
  array[0::bigint],
  'users cannot remove another users photo'
);

select results_eq(
  $$with removed as (delete from storage.objects where name like '%own.jpg' returning id) select count(*) from removed$$,
  array[1::bigint],
  'users may remove their own photo'
);

reset role;

insert into public.operator_users (user_id) values (
  '20000000-0000-0000-0000-000000000003'
);

select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-0000-0000-000000000003',
  true
);
set local role authenticated;

select results_eq(
  $$select public.current_user_is_operator()$$,
  array[true],
  'explicitly provisioned users are operators'
);

select results_eq(
  $$with changed as (update public.reports set title = 'Operator content edit' where id = '10000000-0000-0000-0000-000000000001' returning id) select count(*) from changed$$,
  array[0::bigint],
  'operators do not receive implicit permission to edit report content'
);

select throws_ok(
  $$select public.change_report_status('10000000-0000-0000-0000-000000000001', 'andamento', 'curto')$$,
  '22023', null,
  'operator transitions require an adequate reason'
);

select lives_ok(
  $$select public.change_report_status('10000000-0000-0000-0000-000000000001', 'andamento', 'Equipe iniciou a análise.')$$,
  'operators may start work through the RPC'
);

select results_eq(
  $$select status from public.reports where id = '10000000-0000-0000-0000-000000000001'$$,
  array['andamento'::text],
  'the status RPC updates the report'
);

select results_eq(
  $$select count(*) from public.report_status_history where report_id = '10000000-0000-0000-0000-000000000001'$$,
  array[1::bigint],
  'the transition creates one history entry'
);

select results_eq(
  $$select changed_by from public.report_status_history where report_id = '10000000-0000-0000-0000-000000000001'$$,
  array['20000000-0000-0000-0000-000000000003'::uuid],
  'the history records the authenticated operator'
);

select lives_ok(
  $$select public.change_report_status('10000000-0000-0000-0000-000000000001', 'resolvido', 'Equipe confirmou a resolução.')$$,
  'operators may resolve work in progress'
);

select throws_ok(
  $$select public.change_report_status('10000000-0000-0000-0000-000000000001', 'andamento', 'Tentativa de transição inválida.')$$,
  '22023', null,
  'resolved reports cannot move directly to work in progress'
);

select throws_ok(
  $$select public.change_report_status('10000000-0000-0000-0000-000000000001', 'resolvido', 'Tentativa de repetir o mesmo status.')$$,
  '22023', null,
  'the RPC rejects no-op transitions'
);

reset role;
select * from finish();
rollback;
