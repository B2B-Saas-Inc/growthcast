/* eslint-disable @typescript-eslint/no-require-imports -- Runs inside the upstream CommonJS image bootstrap. */
const fs = require('node:fs');
const path = require('node:path');
const root = '/app/apps/remix/build/client';
const assets = [];
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) walk(file);
    else if (/\.(m?js|css|woff2?|ttf|png|svg|ico)$/.test(file)) assets.push('/' + path.relative(root, file));
  }
}
walk(root);
fs.writeFileSync('/runtime/assets.json', JSON.stringify(assets));
fs.chmodSync('/runtime', 0o777); // Disposable synthetic fixture outputs only.
