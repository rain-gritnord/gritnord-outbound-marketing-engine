import { readFileSync } from 'fs';
const env = readFileSync('.env', 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m) process.env[m[1]] = m[2];
}

const { fireSequenceStep } = await import('./engine/uc-sequencer.js');
const { getUCCandidates } = await import('./engine/db.js');

const candidates = getUCCandidates();
const rain = candidates.find(c => c.firstName === 'Rain');
if (!rain) { console.log('Rain not found'); process.exit(1); }

console.log('Candidate:', rain.firstName, rain.lastName, '| Language:', rain.dossier?.language?.name);
console.log('Firing D7...\n');

// Override Resend so we don't send a real email
process.env.RESEND_API_KEY = '';

const result = await fireSequenceStep(rain, rain.dossier, 7);
console.log('Channel:', result.channel);
console.log('Skipped:', result.skipped);
console.log('Subject:', result.subject);
console.log('\nEmail HTML preview:');
console.log(result.html || '(email sent via Resend — check result.id)');
console.log('\nFull result:', JSON.stringify(result, null, 2));
