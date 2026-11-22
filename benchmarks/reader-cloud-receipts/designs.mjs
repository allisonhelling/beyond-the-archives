export const schema = 'receipt_bench'
export const designs = [
  { name: 'baseline', columns: 'result jsonb not null', insert: 'result', selected: 's.result', written: 'result', replay: 'r.result' },
  { name: 'structured', fallback: 100 },
  { name: 'hybrid_05', fallback: 5 },
  { name: 'hybrid_25', fallback: 25 },
  { name: 'hybrid_50', fallback: 50 },
  {
    name: 'text_pglz', keyColumn: true, columns: 'key text not null, payload text not null',
    insert: 'key,payload', selected: 's.key,s.result::text', written: 'p_key,result::text', replay: 'r.payload::jsonb',
  },
  {
    name: 'gzip', keyColumn: true, columns: 'key text not null, payload bytea not null',
    insert: 'key,payload', selected: 's.key,(select payload from receipt_bench.packed p where p.n=s.n)',
    replay: 'r.payload',
  },
].map(design => design.fallback === undefined ? design : {
  ...design,
  keyColumn: true,
  columns: `key text not null, accepted_revision bigint not null,
    outcome smallint not null, protocol_version smallint not null, payload jsonb${design.fallback === 100 ? ' not null' : ', input_hash bytea'}`,
  insert: 'key,accepted_revision,outcome,protocol_version,payload' + (design.fallback === 100 ? '' : ',input_hash'),
  selected: 's.key,s.revision,1,1,' + (design.fallback === 100 ? 's.value' :
    `case when s.n % 100 < ${design.fallback} then s.value end,
     case when s.n % 100 >= ${design.fallback} then sha256(convert_to(s.value::text,'UTF8')) end`),
  written: "result->>'key',(result->>'revision')::bigint,1,1," + (design.fallback === 100 ? "result->'value'" :
    `case when request_value::text is distinct from (result->'value')::text then result->'value' end,
     case when request_value::text is not distinct from (result->'value')::text then sha256(convert_to(request_value::text,'UTF8')) end`),
  replay: `jsonb_build_object('key',r.key,'revision',r.accepted_revision,'value',${design.fallback === 100 ? 'r.payload' :
    "case when r.payload is not null then r.payload when r.key = p_key and r.input_hash = sha256(convert_to(p_value::text,'UTF8')) then p_value end"})`,
})

export function tableDDL(design) {
  const name = `${schema}.${design.name}`
  return `
    create table ${name} (
      user_id uuid not null references auth.users(id) on delete cascade,
      id uuid not null, ${design.columns}, primary key(user_id,id)
    );
    alter table ${name} enable row level security;
    alter table ${name} force row level security;
    ${design.name === 'gzip' ? `alter table ${name} alter column payload set storage external;` : ''}
    ${design.keyColumn ? `create index on ${name} (user_id,(split_part(key,'/',1)));` : ''}
  `
}

export function purgePredicate(design, book = '$2', owner = '$1', alias = '') {
  const prefix = alias ? `${alias}.` : ''
  const key = prefix + (design.keyColumn ? 'key' : "result->>'key'")
  return `${prefix}user_id=${owner} and ${design.keyColumn ? `split_part(${key},'/',1)=${book} and ` : ''}
    starts_with(${key},${book}||'/')`
}
