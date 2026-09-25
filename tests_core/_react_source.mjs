// Shared helper: React UI source is split across src/app/main.tsx and src/app/views/*.tsx.
// Static tests must inspect the whole UI surface, not only the shell file.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function readReactSource() {
  const files = [path.join(root, 'src/app/main.tsx')];
  const dir = path.join(root, 'src/app/views');
  for (const f of fs.readdirSync(dir).sort()) if (f.endsWith('.tsx')) files.push(path.join(dir, f));
  return files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
}
