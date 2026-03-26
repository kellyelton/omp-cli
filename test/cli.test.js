const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const CLI_PATH = path.resolve(__dirname, '..', 'index.js');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'omp-cli-test-'));
}

function setupFakeThemes(themesDir, names) {
  fs.mkdirSync(themesDir, { recursive: true });
  for (const name of names) {
    fs.writeFileSync(path.join(themesDir, `${name}.omp.json`), '{}');
  }
}

function runSplit(args, env = {}) {
  const result = require('node:child_process').spawnSync(
    process.execPath, [CLI_PATH, ...args],
    { encoding: 'utf-8', env: { ...process.env, ...env }, timeout: 10000 }
  );
  return { stdout: result.stdout, stderr: result.stderr, exitCode: result.status };
}

/** Create a fully configured test environment (themes + bashrc) so auto-setup doesn't trigger */
function createConfiguredEnv(tmpDir, themeNames = ['alpha', 'bravo', 'charlie']) {
  const configDir = path.join(tmpDir, 'config');
  const themesDir = path.join(tmpDir, 'themes');
  const bashrcPath = path.join(tmpDir, 'fake-bashrc');
  fs.mkdirSync(configDir, { recursive: true });
  setupFakeThemes(themesDir, themeNames);
  fs.writeFileSync(bashrcPath, '# --- omp-cli integration (managed by omp-cli, do not edit) ---\n# --- end omp-cli integration ---\n');
  return {
    configDir,
    themesDir,
    bashrcPath,
    env: () => ({
      OMP_CLI_CONFIG_DIR: configDir,
      OMP_CLI_THEMES_DIR: themesDir,
      OMP_CLI_BASHRC: bashrcPath,
    }),
  };
}

describe('help output', () => {
  it('shows usage when called with no arguments', () => {
    const { stderr, exitCode } = runSplit([]);
    assert.equal(exitCode, 0);
    assert.ok(stderr.includes('Usage: omp <command>'));
    assert.ok(stderr.includes('setup'));
    assert.ok(stderr.includes('next'));
    assert.ok(stderr.includes('prev'));
    assert.ok(stderr.includes('update'));
    assert.ok(stderr.includes('status'));
  });

  it('shows setup path option in help', () => {
    const { stderr } = runSplit([]);
    assert.ok(stderr.includes('setup [path]'));
  });

  it('exits with error for unknown command', () => {
    const { stderr, exitCode } = runSplit(['bogus']);
    assert.equal(exitCode, 1);
    assert.ok(stderr.includes('Unknown command: bogus'));
  });
});

describe('next/prev theme cycling', () => {
  let tmpDir, ctx;

  beforeEach(() => {
    tmpDir = createTempDir();
    ctx = createConfiguredEnv(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('next starts at first theme when none is set', () => {
    const { stderr, stdout, exitCode } = runSplit(['next'], ctx.env());
    assert.equal(exitCode, 0);
    assert.ok(stderr.includes('Theme: alpha'));
    assert.ok(stdout.includes('alpha.omp.json'));
  });

  it('next advances to the second theme', () => {
    fs.writeFileSync(path.join(ctx.configDir, 'current-theme'), path.join(ctx.themesDir, 'alpha.omp.json'));
    const { stderr } = runSplit(['next'], ctx.env());
    assert.ok(stderr.includes('Theme: bravo'));
  });

  it('next wraps around from last to first', () => {
    fs.writeFileSync(path.join(ctx.configDir, 'current-theme'), path.join(ctx.themesDir, 'charlie.omp.json'));
    const { stderr } = runSplit(['next'], ctx.env());
    assert.ok(stderr.includes('Theme: alpha'));
  });

  it('prev wraps around from first to last', () => {
    fs.writeFileSync(path.join(ctx.configDir, 'current-theme'), path.join(ctx.themesDir, 'alpha.omp.json'));
    const { stderr } = runSplit(['prev'], ctx.env());
    assert.ok(stderr.includes('Theme: charlie'));
  });

  it('previous is an alias for prev', () => {
    fs.writeFileSync(path.join(ctx.configDir, 'current-theme'), path.join(ctx.themesDir, 'bravo.omp.json'));
    const { stderr } = runSplit(['previous'], ctx.env());
    assert.ok(stderr.includes('Theme: alpha'));
  });

  it('persists theme selection to state file', () => {
    runSplit(['next'], ctx.env());
    const saved = fs.readFileSync(path.join(ctx.configDir, 'current-theme'), 'utf-8').trim();
    assert.ok(saved.endsWith('alpha.omp.json'));
  });

  it('emits shell eval commands to stdout', () => {
    const { stdout } = runSplit(['next'], ctx.env());
    assert.ok(stdout.includes('export POSH_THEME='));
    assert.ok(stdout.includes('oh-my-posh init bash --config'));
  });
});

describe('setup with custom themes path', () => {
  let tmpDir;

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('links to a custom themes directory', () => {
    tmpDir = createTempDir();
    const configDir = path.join(tmpDir, 'config');
    const customThemes = path.join(tmpDir, 'my-themes');
    const bashrcPath = path.join(tmpDir, 'bashrc');
    fs.mkdirSync(configDir, { recursive: true });
    setupFakeThemes(customThemes, ['custom1', 'custom2']);
    fs.writeFileSync(bashrcPath, '');

    const { stderr, exitCode } = runSplit(['setup', customThemes], {
      OMP_CLI_CONFIG_DIR: configDir,
      OMP_CLI_THEMES_DIR: path.join(configDir, 'themes'),
      OMP_CLI_BASHRC: bashrcPath,
    });
    assert.equal(exitCode, 0);
    assert.ok(stderr.includes('2 themes found'));
    assert.ok(stderr.includes('Setup complete'));
  });

  it('errors on nonexistent custom path', () => {
    tmpDir = createTempDir();
    const configDir = path.join(tmpDir, 'config');
    fs.mkdirSync(configDir, { recursive: true });

    const { stderr, exitCode } = runSplit(['setup', '/nonexistent/path'], {
      OMP_CLI_CONFIG_DIR: configDir,
      OMP_CLI_THEMES_DIR: path.join(configDir, 'themes'),
      OMP_CLI_BASHRC: path.join(tmpDir, 'bashrc'),
    });
    assert.equal(exitCode, 1);
    assert.ok(stderr.includes('does not exist'));
  });

  it('errors when custom path has no theme files', () => {
    tmpDir = createTempDir();
    const configDir = path.join(tmpDir, 'config');
    const emptyDir = path.join(tmpDir, 'empty');
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(emptyDir, { recursive: true });

    const { stderr, exitCode } = runSplit(['setup', emptyDir], {
      OMP_CLI_CONFIG_DIR: configDir,
      OMP_CLI_THEMES_DIR: path.join(configDir, 'themes'),
      OMP_CLI_BASHRC: path.join(tmpDir, 'bashrc'),
    });
    assert.equal(exitCode, 1);
    assert.ok(stderr.includes('no .omp.json files'));
  });
});

describe('auto-setup', () => {
  let tmpDir;

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('triggers setup when bashrc is not configured', () => {
    tmpDir = createTempDir();
    const configDir = path.join(tmpDir, 'config');
    const themesDir = path.join(tmpDir, 'themes');
    const bashrcPath = path.join(tmpDir, 'bashrc');
    fs.mkdirSync(configDir, { recursive: true });
    setupFakeThemes(themesDir, ['delta']);
    fs.writeFileSync(bashrcPath, '# empty bashrc\n');

    const { stderr, exitCode } = runSplit(['next'], {
      OMP_CLI_CONFIG_DIR: configDir,
      OMP_CLI_THEMES_DIR: themesDir,
      OMP_CLI_BASHRC: bashrcPath,
    });
    assert.equal(exitCode, 0);
    // Should have run setup and then switched theme
    assert.ok(stderr.includes('Setup complete'));
    assert.ok(stderr.includes('Theme: delta'));
    // bashrc should now have the integration block
    const bashrc = fs.readFileSync(bashrcPath, 'utf-8');
    assert.ok(bashrc.includes('omp-cli integration'));
  });
});

describe('status command', () => {
  let tmpDir;

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reports no themes when not set up', () => {
    tmpDir = createTempDir();
    const { stderr } = runSplit(['status'], {
      OMP_CLI_CONFIG_DIR: path.join(tmpDir, 'config'),
      OMP_CLI_THEMES_DIR: path.join(tmpDir, 'themes'),
      OMP_CLI_BASHRC: path.join(tmpDir, 'fake-bashrc'),
    });
    assert.ok(stderr.includes('NOT INSTALLED'));
  });

  it('reports current theme when set', () => {
    tmpDir = createTempDir();
    const ctx = createConfiguredEnv(tmpDir, ['zen']);
    const themePath = path.join(ctx.themesDir, 'zen.omp.json');
    fs.writeFileSync(path.join(ctx.configDir, 'current-theme'), themePath);

    const { stderr } = runSplit(['status'], ctx.env());
    assert.ok(stderr.includes('Current theme: zen'));
  });
});
