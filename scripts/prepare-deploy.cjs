// Publica una instantánea de HEAD sin cambiar main ni el índice de trabajo.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const git = (args, options = {}) => execFileSync('git', args, { encoding: 'utf8', ...options });
const source = git(['rev-parse', 'HEAD']).trim();
const records = git(['ls-tree', '-r', '-z', source]).split('\0').filter(Boolean);
const allowed = name => name === 'index.html'
  || (/^admin\/.+\.(html|css|js)$/.test(name))
  || (/^css\/.+\.css$/.test(name))
  || (/^js\/.+\.js$/.test(name) && !/(?:^|\/)[^/]*\.(local|example)\.js$/.test(name))
  || name === 'js/vendor/supabase.LICENSE'
  || /^assets\/.+\.(png|jpe?g|webp|avif|svg|ico|woff2?)$/.test(name);
const selected = records.map(record => {
  const tab = record.indexOf('\t');
  const [mode, type, oid] = record.slice(0, tab).split(' ');
  return { mode, type, oid, name: record.slice(tab + 1) };
}).filter(file => allowed(file.name));

for (const file of selected) {
  if (file.type !== 'blob' || !['100644', '100755'].includes(file.mode)) {
    throw new Error('No se admiten enlaces ni submódulos: ' + file.name);
  }
  if (file.name.split('/').some(part => part.startsWith('.'))) {
    throw new Error('No se admiten rutas ocultas: ' + file.name);
  }
}
for (const required of ['index.html', 'admin/index.html', 'admin/recover.html', 'js/config.js', 'js/vendor/supabase.js']) {
  if (!selected.some(file => file.name === required)) throw new Error('Falta archivo público: ' + required);
}

// El padre pertenece únicamente al historial de deploy, nunca al de main.
let parent;
for (const ref of ['refs/heads/deploy', 'refs/remotes/origin/deploy']) {
  try { parent = git(['rev-parse', '--verify', ref], { stdio: ['pipe', 'pipe', 'ignore'] }).trim(); break; }
  catch { /* Primera publicación: la rama todavía no existe. */ }
}
const indexPath = path.join(os.tmpdir(), `calefica-deploy-${process.pid}-${Date.now()}.index`);
const env = { ...process.env, GIT_INDEX_FILE: indexPath };
try {
  git(['read-tree', '--empty'], { env });
  git(['update-index', '-z', '--index-info'], {
    env, input: selected.map(file => `${file.mode} ${file.oid}\t${file.name}\0`).join(''),
  });
  const tree = git(['write-tree'], { env }).trim();
  if (parent && git(['rev-parse', `${parent}^{tree}`]).trim() === tree) {
    git(['update-ref', 'refs/heads/deploy', parent]);
    console.log(`deploy sin cambios: ${parent} (${selected.length} archivos públicos)`);
  } else {
    const commit = git(['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', `Publish website from ${source}`]).trim();
    git(['update-ref', 'refs/heads/deploy', commit]);
    console.log(`deploy preparada: ${commit} (${selected.length} archivos públicos)`);
  }
} finally {
  if (fs.existsSync(indexPath)) fs.unlinkSync(indexPath);
}
