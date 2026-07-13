/**
 * Fails the build when something is used but never imported.
 *
 * Two gates, because they catch two different bugs.
 *
 * 1. TS2304/TS2552 - an identifier that does not exist at all. `vite build` does
 *    not type-check, so without this a missing import reaches production as a
 *    white screen.
 *
 * 2. DOM-global components - the nastier one. `Lock`, `Text`, `Image`, `File`
 *    and friends are REAL globals declared in lib.dom. Drop the lucide import
 *    for `Lock` and the code still type-checks and still builds, because `Lock`
 *    genuinely exists: it is the Web Locks API interface. At runtime React
 *    renders the browser interface as a component and Chrome throws
 *    "Illegal constructor" - a white screen with a minified stack pointing into
 *    react-dom that tells you nothing.
 *
 *    That is exactly how the landing page broke, so it gets its own gate.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/* Gate 1: undefined identifiers */

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

/* Gate 2: components that are secretly DOM globals */

const DOM_GLOBALS = [
  'Lock', 'Text', 'Image', 'Option', 'Comment', 'Range', 'Audio', 'File',
  'Notification', 'Selection', 'Screen', 'History', 'Location', 'Navigator',
  'Performance', 'Plugin', 'MimeType', 'Element', 'Node', 'Document', 'Window',
  'Attr', 'Event', 'Request', 'Response', 'Headers', 'Worker', 'Path2D',
];

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.tsx$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

const problems = [];

for (const file of walk('src')) {
  const src = fs.readFileSync(file, 'utf8');

  for (const name of DOM_GLOBALS) {
    // A generic (useState<File | null>, Record<Text, x>) has an identifier right
    // before the angle bracket. JSX never does: it follows whitespace, "(", "{"
    // or ">". That single character is what separates a type from an element.
    const usedAsComponent =
      new RegExp(`(^|[\\s({>=,])<${name}[\\s/>]`, 'm').test(src) ||
      new RegExp(`\\bIcon:\\s*${name}\\b`).test(src) ||
      new RegExp(`\\bicon:\\s*${name}\\b`).test(src);

    if (!usedAsComponent) continue;

    const imported = new RegExp(
      `import[^;]*\\{[^}]*\\b${name}\\b[^}]*\\}[^;]*from`, 's'
    ).test(src);
    const declared = new RegExp(`(const|let|var|function|class)\\s+${name}\\b`).test(src);

    if (!imported && !declared) {
      problems.push(
        `${file}\n    <${name}> is rendered but never imported. It resolves to the DOM ` +
        `global "${name}" and throws "Illegal constructor" at runtime.`
      );
    }
  }
}

if (problems.length) {
  console.error('\nBuild blocked: a DOM global is being rendered as a component.\n');
  problems.forEach((p) => console.error('  ' + p + '\n'));
  console.error('Import it from lucide-react (or wherever it belongs), then build again.\n');
  process.exit(1);
}

console.log('Reference check passed.');
