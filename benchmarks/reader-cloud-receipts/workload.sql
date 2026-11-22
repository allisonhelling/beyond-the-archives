-- Synthetic accepted receipts. No application tables are populated here.
create table receipt_bench.source as
with rows as (
  select n, case when seq < 20743 then seq % 367
                 else 367 + (seq - 20743) % 160 end as slot
  from generate_series(1,23817) n
  cross join lateral (select (n * 7919) % 23817 as seq) draw
), books as (
  select *, case when slot >= 367 then 500 + (slot - 367) / 7
                 when slot % 4 = 1 then slot - 1 else slot end as book_number
  from rows
), mapped as (
  select *, md5('account:' || (book_number % 12))::uuid as user_id,
    md5('book:' || book_number) || md5('epub:' || book_number) as book,
    case when slot < 367 then case when slot % 4 = 0 then 'position' else 'manifest' end
         else (array['progress','favorite','rec','status','completed','notes','deleted'])[1 + slot % 7] end as field
  from books
), numbered as (
  select *, book || '/' || field as key
  from mapped
), values_by_key as (
  select *, row_number() over (partition by user_id,key order by n) as revision,
    case when field = 'manifest' then case when n % 1999 = 0 then 50200
      else 4200 + n % 2310 end end as bytes
  from numbered
), payloads as (
  select n,user_id,md5('request:' || n)::uuid id,key,revision,
    case field
      when 'manifest' then jsonb_build_object('id',book,'workId',(8000+slot)::text,'metadata',
        jsonb_build_object('title','Synthetic EPUB ' || slot,'authors',jsonb_build_array('Synthetic Author'),
                          'summary',left(summary.body, bytes)), 'chapters',
        jsonb_build_array(jsonb_build_object('id',md5('chapter:' || slot),'title','Chapter One','words',500 + n)))
      when 'position' then jsonb_build_object('chapter',md5('chapter:' || slot),'fraction',(position_step % 997)/997.0,'textOffset',position_step)
      when 'progress' then to_jsonb((n % 79)::integer)
      when 'favorite' then to_jsonb(n % 3 = 0)
      when 'rec' then to_jsonb(n % 5 = 0)
      when 'status' then to_jsonb((array['reading','finished','re_reading'])[1 + n % 3])
      when 'completed' then jsonb_build_array(md5('first:' || n),md5('second:' || n))
      when 'notes' then to_jsonb('Synthetic note ' || n || ' ' || md5('note:' || n))
      when 'deleted' then to_jsonb(revision % 2 = 1)
    end as value
  from values_by_key
  cross join lateral (select case when slot = 0 and revision <= 16 then 0 else n end position_step) position
  left join lateral (
    select string_agg(md5('content:' || n || ':' || fragment),'' order by fragment) as body
    from generate_series(1, (bytes+31)/32) fragment
  ) summary on bytes is not null
)
select *, jsonb_build_object('key',key,'revision',revision,'value',value) as result
from payloads order by n;
alter table receipt_bench.source add primary key (n);
analyze receipt_bench.source;
