/**
 * Creates server/.env from server/.env.example on first setup.
 *
 * The JWT secret and the demo password are generated randomly so that no
 * real secret or password is committed to source control. The generated demo
 * password is printed once and stored in server/.env.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const serverEnvPath = fileURLToPath(new URL('../server/.env', import.meta.url));
const examplePath = fileURLToPath(new URL('../server/.env.example', import.meta.url));

function generateDemoPassword() {
  // URL-safe characters, long enough for bcrypt and easy to copy.
  return randomBytes(15).toString('base64url');
}

if (existsSync(serverEnvPath)) {
  console.log('server/.env already exists - leaving it unchanged.');
  process.exit(0);
}

if (!existsSync(examplePath)) {
  console.error('Could not find server/.env.example');
  process.exit(1);
}

const jwtSecret = randomBytes(48).toString('hex');
const demoPassword = generateDemoPassword();

const envContents = readFileSync(examplePath, 'utf8')
  .replace('replace-with-a-long-random-secret', jwtSecret)
  .replace('change-me-demo-password', demoPassword);

writeFileSync(serverEnvPath, envContents, 'utf8');

console.log('Created server/.env');
console.log(`Generated demo password: ${demoPassword}`);
console.log('Use this password for every seeded demo account (see README).');
