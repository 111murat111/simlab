// simlab.zip üretir: çalışmaya hazır dist/ + kaynak kod (node_modules hariç).
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || path.join(ROOT, 'simlab.zip');
const py = `
import os, sys, zipfile
root, out = sys.argv[1], sys.argv[2]
skip_dirs = {'node_modules', 'shots', '.git'}
n = 0
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for d, dirs, files in os.walk(root):
        dirs[:] = sorted(x for x in dirs if x not in skip_dirs)
        for f in sorted(files):
            p = os.path.join(d, f)
            if os.path.abspath(p) == os.path.abspath(out) or f.endswith('.tmp') or f.endswith('.zip'):
                continue
            z.write(p, os.path.join('simlab', os.path.relpath(p, root)))
            n += 1
print(n, 'dosya ->', out, round(os.path.getsize(out) / 1e6, 2), 'MB')
`;
execFileSync('python3', ['-c', py, ROOT, out], { stdio: 'inherit' });
