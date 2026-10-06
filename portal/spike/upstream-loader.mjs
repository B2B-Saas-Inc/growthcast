// Execute the pinned upstream TypeScript routes without installing the monorepo.
// Only external infrastructure is replaced. Authorization and HTTP route code
// are loaded unchanged from the read-only upstream checkout.
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = '/upstream/documenso/';
const files = JSON.parse(readFileSync('/spike/source-hashes.json', 'utf8'));
for (const [path, expected] of Object.entries(files)) {
  const actual = createHash('sha256').update(readFileSync(root + path)).digest('hex');
  if (actual !== expected) throw new Error(`Upstream source changed: ${path}`);
}
const fixture = new URL('./infrastructure-fixture.mjs', import.meta.url).href;
const replacements = new Set([
  '@documenso/prisma',
  '@documenso/auth/server/lib/utils/get-session',
  '@documenso/lib/server-only/embedding-presign/verify-embedding-presign-token',
  '@documenso/lib/universal/crypto',
  '@documenso/lib/universal/upload/get-file.server',
  '../files.helpers',
]);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.startsWith('file://' + root)) {
      if (replacements.has(specifier)) return { url: fixture, shortCircuit: true };
      if (specifier === './get-envelope-item-pdf') {
        return { url: new URL('./get-envelope-item-pdf.ts', context.parentURL).href, shortCircuit: true };
      }
      if (['hono', 'zod', '@hono/standard-validator'].includes(specifier)) {
        return nextResolve(specifier, { ...context, parentURL: import.meta.url });
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith('file://' + root) && url.endsWith('.ts')) {
      const source = readFileSync(fileURLToPath(url), 'utf8');
      return { format: 'module', source: stripTypeScriptTypes(source), shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});
