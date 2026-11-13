import {localClients,createSyntheticAccounts} from './local-fixtures.mjs'
try {
 if(process.argv.length!==2)throw new Error('Local seeding accepts no target flags or input backups.')
 const clients=await localClients()
 await createSyntheticAccounts(clients)
 console.log('Created two synthetic local accounts with AO3/universal stories and reader access. Reset only the synthetic local stack to clear them.')
}catch{console.error('Synthetic local seed refused or failed. No hosted target or data import is supported.');process.exitCode=1}
