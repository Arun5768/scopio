// Check tracked/staged source only; never print credential contents.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

const files = execFileSync('git', ['ls-files', '-z'], {encoding: 'utf8'}).split('\0').filter(Boolean);
const forbidden = [
  /(^|\/)(?:\.env(?:\..*)?|\.dev\.vars(?:\..*)?)$/,
  /^(?:\.wrangler|dist|node_modules|work|outputs|backups|exports|recordings|private|secrets)\//,
  /\.(?:pem|key|p12|pfx|sqlite(?:-wal|-shm)?|sqlite3|db(?:-wal|-shm)?|log|har|mp4|webm|zip|bak)$/i,
  /(?:client_secret|credentials|service-account).*\.json$/i,
  /^wrangler\.jsonc?$/,
  /^scripts\/deploy-(?:google|email|gmail)\.mjs$/,
];
const issues = files.filter(file => file !== '.dev.vars.example' && forbidden.some(rule => rule.test(file))).map(file => `${file}: private/generated path`);
const patterns = [
  'GOCSPX-[A-Za-z0-9_-]{16,}',
  'gh[pousr]_[A-Za-z0-9]{25,}',
  'github_pat_[A-Za-z0-9_]{30,}',
  '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----',
  're_[A-Za-z0-9_-]{30,}',
  'AIza[A-Za-z0-9_-]{30,}',
  'ya29[.][A-Za-z0-9_-]{30,}',
  'xox[baprs]-[A-Za-z0-9-]{20,}',
];
try {
  const args = ['grep', '--cached', '-I', '-l', '-E', ...patterns.flatMap(pattern => ['-e', pattern]), '--'];
  const matches = execFileSync('git', args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
  issues.push(...matches.trim().split('\n').filter(Boolean).map(file => `${file}: credential pattern`));
} catch (error) {
  if (error.status !== 1) throw error;
}
for (const line of readFileSync('.dev.vars.example', 'utf8').split(/\r?\n/)) {
  if (/^(?:GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET|RESEND_API_KEY|GMAIL_TOKEN_KEY|RESEND_WEBHOOK_SECRET|GMAIL_OWNER_EMAIL|EMAIL_TEST_RECIPIENT)=\s*\S/.test(line)) {
    issues.push('.dev.vars.example: example credential/account value must be blank');
  }
}
const config = JSON.parse(readFileSync('wrangler.example.jsonc', 'utf8'));
if (config.account_id || config.d1_databases?.some(db => db.database_id !== '00000000-0000-0000-0000-000000000000')) {
  issues.push('wrangler.example.jsonc: use placeholder account/resource identifiers');
}
if (issues.length) {
  console.error('Publication check failed:\n' + issues.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Publication check passed for ${files.length} tracked files. No forbidden paths or supported credential patterns found.`);
}
