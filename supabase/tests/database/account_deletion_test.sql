-- Run only in isolated Supabase. These are synthetic accounts and requests.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

select has_table('public', 'account_deletion_requests', 'private request queue exists');
insert into auth.users (id, email) values
  ('30000000-0000-0000-0000-000000000001', 'requester@example.invalid'),
  ('30000000-0000-0000-0000-000000000002', 'other-requester@example.invalid');

set local role anon;
select throws_ok($$select id from public.account_deletion_requests$$, '42501', null,
  'visitors cannot read requests');
select throws_ok($$select * from public.request_account_deletion()$$, '42501', null,
  'visitors cannot submit requests');
reset role;
select set_config('request.jwt.claim.sub', '', true);
set local role authenticated;
select throws_ok($$select * from public.request_account_deletion()$$, '42501', null,
  'authenticated role without an identity cannot submit');
reset role;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
set local role authenticated;

select results_eq($$select count(*) from public.request_account_deletion()$$,
  array[1::bigint], 'requester receives one receipt');
select results_eq($$select id, created_at, status from public.request_account_deletion()$$,
  $$select id, created_at, status from public.account_deletion_requests$$,
  'retry preserves receipt timestamp and status');
select results_eq($$select count(*) from public.account_deletion_requests$$,
  array[1::bigint], 'one account has one request');
select throws_ok($$select user_id from public.account_deletion_requests$$, '42501', null,
  'clients cannot read internal identity columns');
select throws_ok($$insert into public.account_deletion_requests (user_id) values ('30000000-0000-0000-0000-000000000002')$$,
  '42501', null, 'clients cannot forge another accounts request');
select throws_ok($$update public.account_deletion_requests set status = 'in_review'$$,
  '42501', null, 'clients cannot choose processing status');
select throws_ok($$delete from public.account_deletion_requests$$, '42501', null,
  'clients cannot erase the request queue');

reset role;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select results_eq($$select count(*) from public.account_deletion_requests$$,
  array[0::bigint], 'another account cannot read the existing request');
select results_eq($$select count(*) from public.request_account_deletion()$$,
  array[1::bigint], 'another account can submit its own request');
select results_eq($$select count(*) from public.account_deletion_requests$$,
  array[1::bigint], 'each account reads only its own receipt');

reset role;
select results_eq($$select count(*) from public.account_deletion_requests$$,
  array[2::bigint], 'privileged maintenance sees both synthetic requests');
delete from auth.users where id = '30000000-0000-0000-0000-000000000001';
select results_eq($$select count(*) from public.account_deletion_requests where user_id = '30000000-0000-0000-0000-000000000001'$$,
  array[0::bigint], 'request metadata is removed with the Auth account');
select * from finish();
rollback;
