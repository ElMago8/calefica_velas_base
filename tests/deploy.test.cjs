const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('deploy publica solo archivos públicos, separa el historial y retira archivos borrados', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'calefica-deploy-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const write = (name, content = 'fixture') => {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), content);
  };
  git('init', '-b', 'main');
  git('config', 'user.name', 'Deploy test');
  git('config', 'user.email', 'deploy@example.test');
  const publicFiles = ['index.html', 'admin/index.html', 'admin/recover.html', 'js/config.js', 'js/vendor/supabase.js', 'js/vendor/supabase.LICENSE', 'assets/img/logo.svg'];
  for (const file of [...publicFiles, 'js/config.local.js', 'js/config.example.js', 'supabase/schema.sql', 'tests/internal.cjs', 'credentials/private.json', '.env']) write(file);
  git('add', '.');
  git('commit', '-m', 'Initial fixture');
  const main = git('rev-parse', 'HEAD');
  const run = () => execFileSync(process.execPath, [path.resolve(__dirname, '../scripts/prepare-deploy.cjs')], { cwd: root, encoding: 'utf8' });
  run();
  assert.deepEqual(git('ls-tree', '-r', '--name-only', 'deploy').split('\n').sort(), publicFiles.sort());
  assert.equal(git('rev-list', '--count', 'deploy'), '1');
  assert.equal(git('rev-parse', 'HEAD'), main);
  assert.equal(git('status', '--porcelain'), '');
  const first = git('rev-parse', 'deploy');
  run();
  assert.equal(git('rev-parse', 'deploy'), first);

  fs.unlinkSync(path.join(root, 'assets/img/logo.svg'));
  write('index.html', 'Updated page');
  git('add', '-A');
  git('commit', '-m', 'Update website');
  run();
  assert.equal(git('rev-parse', 'deploy^'), first);
  assert.equal(git('show', 'deploy:index.html'), 'Updated page');
  assert.ok(!git('ls-tree', '-r', '--name-only', 'deploy').includes('logo.svg'));
  assert.equal(git('branch', '--show-current'), 'main');
  assert.equal(git('status', '--porcelain'), '');
});
