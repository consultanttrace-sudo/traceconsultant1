import fs from 'node:fs';

const source = fs.readFileSync('src/app/main.tsx', 'utf8');
const forbidden = [
  "auditDiff({status:'draft',owner:'unknown'},{status:'approved',owner:'leader'})",
  "diagnoseBusiness({current:{period:'—'",
  "id:'demo-001'",
  "summarizeCollaboration([])"
];
const failures = forbidden.filter(x => source.includes(x));
if (failures.length) {
  console.error('FAIL React truthfulness guard:', failures.join(', '));
  process.exit(1);
}
if (!source.includes('Audit data belum terhubung')) throw new Error('Missing explicit audit unavailable state');
if (!source.includes('diagnoseBusiness(compareFinancePeriods(records,period,effectivePrevious||undefined),[])')) throw new Error('Diagnosis is not wired to finance evidence');
if (!source.includes('Pilih periode untuk mulai diagnosis.')) throw new Error('Missing explicit diagnosis data-required state');
if (!source.includes("amount:''")) throw new Error('Finance entry still starts from a fabricated numeric value');
console.log('PASS React truthfulness guard');
