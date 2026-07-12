/**
 * Fails the build when something is used but never imported.
 *
 * This exists because a component was rendered without its import and reached
 * production as a white screen: `vite build` does not type-check, so nothing
 * caught it. Only undefined identifiers (TS2304/TS2552) are treated as fatal.
 * The rest of the type noise here is pre-existing and does not break the app.
 */
import { execSync } from 'node:child_process';

let out = '';
try {
  execSync('npx tsc --noEmit', { encoding: 'utf8', stdio: 'pipe' });
} catch (e) {
  out = (e.stdout || '') + (e.stderr || '');
}

const fatal = out.split('\n').filter((l) => /error TS(2304|2552):/.test(l));

if (fatal.length) {
  console.error('\nBuild blocked: used but never imported.\n');
  fatal.forEach((l) => console.error('  ' + l.trim()));
  console.error('\nAdd the missing import, then build again.\n');
  process.exit(1);
}
console.log('Reference check passed.');
