const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
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

function run(args, env = {}) {
  try {
    const result = execFileSync(process.execPath, [CLI_PATH, ...args], {
      encoding: 'utf-8',
      env: { ...process.env, ...env },
      timeout: 5000,
    });
    return { stdout: result, stderr: '', exitCode: 0 };
  } catch (e) {
    return { stdout: e.stdout || '', stderr: e.stderr || '', exitCode: e.status };
  }
}

function runSplit(args, env = {}) {
  // Run capturing stdout and stderr separately
  const result = require('node:child_process').spawnSync(
    process.execPath, [CLI_PATH, ...args],
    { encoding: 'utf-8', env: { ...process.env, ...env }, timeout: 5000 }
  );
  return { stdout: result.stdout, stderr: result.stderr, exitCode: result.status };
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

  it('exits with error for unknown command', () => {
    const { stderr, exitCode } = runSplit(['bogus']);
    assert.equal(exitCode, 1);
    assert.ok(stderr.includes('Unknown command: bogus'));
  });
});

describe('next/prev theme cycling', () => {
  let tmpDir, configDir, themesDir;

  beforeEach(() => {
    tmpDir = createTempDir();
    configDir = path.join(tmpDir, 'config');
    themesDir = path.join(tmpDir, 'themes');
    fs.mkdirSync(configDir, { recursive: true });
    setupFakeThemes(themesDir, ['alpha', 'bravo', 'charlie']);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function env() {
    return {
      OMP_CLI_CONFIG_DIR: configDir,
      OMP_CLI_THEMES_DIR: themesDir,
      OMP_CLI_BASHRC: path.join(tmpDir, 'fake-bashrc'),
    };
  }

  it('next starts at first theme when none is set', () => {
    const { stderr, stdout, exitCode } = runSplit(['next'], env());
    assert.equal(exitCode, 0);
    assert.ok(stderr.includes('Theme: alpha'));
    assert.ok(stdout.includes('alpha.omp.json'));
  });

  it('next advances to the second theme', () => {
    // Set current to alpha
    fs.writeFileSync(path.join(configDir, 'current-theme'), path.join(themesDir, 'alpha.omp.json'));

    const { stderr } = runSplit(['next'], env());
    assert.ok(stderr.includes('Theme: bravo'));
  });

  it('next wraps around from last to first', () => {
    fs.writeFileSync(path.join(configDir, 'current-theme'), path.join(themesDir, 'charlie.omp.json'));

    const { stderr } = runSplit(['next'], env());
    assert.ok(stderr.includes('Theme: alpha'));
  });

  it('prev wraps around from first to last', () => {
    fs.writeFileSync(path.join(configDir, 'current-theme'), path.join(themesDir, 'alpha.omp.json'));

    const { stderr } = runSplit(['prev'], env());
    assert.ok(stderr.includes('Theme: charlie'));
  });

  it('previous is an alias for prev', () => {
    fs.writeFileSync(path.join(configDir, 'current-theme'), path.join(themesDir, 'bravo.omp.json'));

    const { stderr } = runSplit(['previous'], env());
    assert.ok(stderr.includes('Theme: alpha'));
  });

  it('persists theme selection to state file', () => {
    runSplit(['next'], env());
    const saved = fs.readFileSync(path.join(configDir, 'current-theme'), 'utf-8').trim();
    assert.ok(saved.endsWith('alpha.omp.json'));
  });

  it('emits shell eval commands to stdout', () => {
    const { stdout } = runSplit(['next'], env());
    assert.ok(stdout.includes('export POSH_THEME='));
    assert.ok(stdout.includes('oh-my-posh init bash --config'));
  });
});

describe('status command', () => {
  let tmpDir, configDir, themesDir;

  beforeEach(() => {
    tmpDir = createTempDir();
    configDir = path.join(tmpDir, 'config');
    themesDir = path.join(tmpDir, 'themes');
    fs.mkdirSync(configDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reports no themes when not set up', () => {
    const { stderr } = runSplit(['status'], {
      OMP_CLI_CONFIG_DIR: configDir,
      OMP_CLI_THEMES_DIR: themesDir,
      OMP_CLI_BASHRC: path.join(tmpDir, 'fake-bashrc'),
    });
    assert.ok(stderr.includes('NOT INSTALLED'));
  });

  it('reports current theme when set', () => {
    setupFakeThemes(themesDir, ['zen']);
    const themePath = path.join(themesDir, 'zen.omp.json');
    fs.writeFileSync(path.join(configDir, 'current-theme'), themePath);

    const { stderr } = runSplit(['status'], {
      OMP_CLI_CONFIG_DIR: configDir,
      OMP_CLI_THEMES_DIR: themesDir,
      OMP_CLI_BASHRC: path.join(tmpDir, 'fake-bashrc'),
    });
    assert.ok(stderr.includes('Current theme: zen'));
  });
});

describe('next/prev with no themes', () => {
  it('exits with error when no themes exist', () => {
    const tmpDir = createTempDir();
    const { stderr, exitCode } = runSplit(['next'], {
      OMP_CLI_CONFIG_DIR: path.join(tmpDir, 'config'),
      OMP_CLI_THEMES_DIR: path.join(tmpDir, 'nope'),
      OMP_CLI_BASHRC: path.join(tmpDir, 'fake-bashrc'),
    });
    assert.equal(exitCode, 1);
    assert.ok(stderr.includes('No themes found'));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
