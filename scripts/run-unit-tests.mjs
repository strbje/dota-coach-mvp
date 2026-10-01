import { readdirSync, rmSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { relative, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const temp = join(root, '.tmp-unit-tests');

function collectTypeScript(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collectTypeScript(path) : entry.name.endsWith('.ts') ? [path] : [];
  });
}

const sourceFiles = [
  ...collectTypeScript(join(root, 'src/lib/dota')),
  ...collectTypeScript(join(root, 'src/lib/i18n')),
  join(root, 'src/app/api/pre-game/analyze/handler.ts'),
  join(root, 'src/app/api/pre-game/analyze/handler.test.ts')
];
const tests = [
  'lib/dota/selection/matchPlayers.test.js',
  'lib/dota/normalize/economyByPhase.test.js',
  'lib/dota/normalize/goldReasons.test.js',
  'lib/dota/adapters/normalizeOpenDotaMatch.test.js',
  'lib/dota/adapters/normalizeOptionalNumber.test.js',
  'lib/dota/async/withTimeout.test.js',
  'lib/dota/validation/postMatchResponse.test.js',
  'app/api/pre-game/analyze/handler.test.js',
  'lib/dota/clients/opendota.test.js',
  'lib/dota/providers/opendotaProvider.test.js',
  'lib/dota/adapters/normalizeBenchmarks.test.js',
  'lib/dota/data/itemPopularity.test.js',
  'lib/dota/data/itemConstants.test.js',
  'lib/i18n/preGameCopy.test.js',
  'lib/i18n/uiCopy.test.js',
  'lib/dota/errors/postMatchError.test.js',
  'lib/dota/role/detectRole.test.js',
  'lib/dota/rules/roleRules/carryRules.test.js'
].map((path) => join(temp, path));

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
}

rmSync(temp, { recursive: true, force: true });
mkdirSync(temp, { recursive: true });
try {
  writeFileSync(join(temp, 'tsconfig.json'), JSON.stringify({
    extends: '../tsconfig.json',
    compilerOptions: {
      noEmit: false,
      incremental: false,
      outDir: '.',
      rootDir: '../src',
      module: 'commonjs',
      moduleResolution: 'node',
      target: 'es2022',
      esModuleInterop: true,
      skipLibCheck: true
    },
    files: sourceFiles.map((path) => relative(temp, path)),
    include: []
  }));
  run(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', join(temp, 'tsconfig.json')]);
  const aliasScope = join(temp, 'node_modules/@');
  mkdirSync(aliasScope, { recursive: true });
  symlinkSync(join(temp, 'lib'), join(aliasScope, 'lib'), 'junction');
  run(process.execPath, ['--test', ...tests]);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
