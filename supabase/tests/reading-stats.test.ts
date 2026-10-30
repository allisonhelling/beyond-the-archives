// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
// @ts-expect-error Shared database harness.
import { createTestDatabase } from '../../scripts/test-database.mjs'
let db: PGlite
const alice='10000000-0000-0000-0000-000000000001',bob='10000000-0000-0000-0000-000000000002'
beforeAll(async()=>{
 db=await createTestDatabase()
 await db.exec(`insert into auth.users values('${alice}'),('${bob}');
 insert into public.works(ao3_work_id,title,summary,published_chapters) values(8001,'Stats Work','Large summary excluded from statistics',2);
 insert into public.library_entries(id,user_id,work_id,original_url,reading_status,personal_rating,notes)
 select '20000000-0000-0000-0000-000000000001','${alice}',id,'https://archiveofourown.org/works/8001','reading',4,'Private note excluded' from public.works;
 insert into public.reading_records(id,user_id,ao3_work_id,original_url,reading_status,last_read_chapter,created_at,reading_history,metadata)
 values('20000000-0000-0000-0000-000000000002','${alice}',8002,'https://archiveofourown.org/works/8002','did_not_finish',1,now(),'[]','{"title":"Archived Work","authors":["Author"]}');
 set role authenticated;set request.jwt.claim.sub='${alice}';`)
},30000)
afterAll(async()=>{await db?.close()})
it('projects compact active and archived statistics with owner scope and stable cursor pages',async()=>{
 type Work={id:string;key:string;metadata:{title:string;summary?:string};archived:boolean;personal_rating:number|null}
 const first=(await db.query<{result:Work[]}>('select public.reading_stats_works(null,1) result')).rows[0].result
 expect(first).toHaveLength(1)
 expect(first[0]).toMatchObject({key:'ao3:8001',metadata:{title:'Stats Work'},archived:false,personal_rating:4})
 expect(first[0].metadata).not.toHaveProperty('summary')
 expect(first[0]).not.toHaveProperty('notes')
 const second=(await db.query<{result:Work[]}>('select public.reading_stats_works($1,1) result',[first[0].id])).rows[0].result
 expect(second[0]).toMatchObject({key:'ao3:8002',metadata:{title:'Archived Work'},archived:true,personal_rating:null})
 expect((await db.query<{result:Work[]}>('select public.reading_stats_works($1,1) result',[second[0].id])).rows[0].result).toEqual([])
 await db.exec(`set request.jwt.claim.sub='${bob}'`)
 expect((await db.query<{result:Work[]}>('select public.reading_stats_works() result')).rows[0].result).toEqual([])
 await db.exec('reset role;reset request.jwt.claim.sub;set role anon')
 await expect(db.query('select public.reading_stats_works()')).rejects.toThrow('permission denied')
})
