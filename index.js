#!/usr/bin/env node

const { parseArgs } = require('node:util');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

// --- Paths (overridable via env for testing) ---
const HOME = process.env.HOME || process.env.USERPROFILE;
const CONFIG_DIR = process.env.OMP_CLI_CONFIG_DIR || path.join(HOME, '.config', 'omp-cli');
const THEMES_DIR = process.env.OMP_CLI_THEMES_DIR || path.join(CONFIG_DIR, 'themes');
const STATE_FILE = path.join(CONFIG_DIR, 'current-theme');
const BASHRC = process.env.OMP_CLI_BASHRC || path.join(HOME, '.bashrc');
const REPO_URL = 'https://github.com/JanDeDobbeleer/oh-my-posh.git';
const SELF_PATH = path.resolve(__filename);

// --- Helpers ---

/** Write to stderr (visible to user, not captured by eval) */
function info(msg) {
  process.stderr.write(msg + '\n');
}

/** Write to stdout (captured by eval in the shell function) */
function shellOutput(msg) {
  process.stdout.write(msg + '\n');
}

function ensureConfigDir() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

function getSortedThemes() {
  if (!fs.existsSync(THEMES_DIR)) {
    return [];
  }
  return fs.readdirSync(THEMES_DIR)
    .filter(f => f.endsWith('.omp.json'))
    .sort()
    .map(f => path.join(THEMES_DIR, f));
}

function getCurrentTheme() {
  if (fs.existsSync(STATE_FILE)) {
    const saved = fs.readFileSync(STATE_FILE, 'utf-8').trim();
    if (saved && fs.existsSync(saved)) {
      return saved;
    }
  }
  return null;
}

function saveCurrentTheme(themePath) {
  ensureConfigDir();
  fs.writeFileSync(STATE_FILE, themePath + '\n');
}

function themeName(themePath) {
  return path.basename(themePath, '.omp.json');
}

function emitThemeSwitch(themePath) {
  saveCurrentTheme(themePath);
  info(`Theme: ${themeName(themePath)}`);
  shellOutput(`export POSH_THEME="${themePath}"; eval "$(oh-my-posh init bash --config '${themePath}')"`);
}

// --- Commands ---

function cmdSetup() {
  ensureConfigDir();

  // 1. Clone themes via sparse checkout if not present
  if (!fs.existsSync(THEMES_DIR)) {
    info('Downloading Oh My Posh themes...');
    try {
      execSync(`git clone --depth 1 --filter=blob:none --sparse "${REPO_URL}" "${path.join(CONFIG_DIR, 'repo')}"`, { stdio: 'pipe' });
      execSync('git sparse-checkout set themes', { cwd: path.join(CONFIG_DIR, 'repo'), stdio: 'pipe' });
    } catch (e) {
      info(`Error cloning themes repo: ${e.message}`);
      process.exit(1);
    }

    // Symlink the themes directory for easy access
    const repoThemes = path.join(CONFIG_DIR, 'repo', 'themes');
    fs.symlinkSync(repoThemes, THEMES_DIR);
    info(`Themes installed to ${THEMES_DIR}`);
  } else {
    info('Themes already installed.');
  }

  // 2. Set initial theme if none selected
  const themes = getSortedThemes();
  if (themes.length === 0) {
    info('Error: No themes found after setup.');
    process.exit(1);
  }

  let current = getCurrentTheme();
  if (!current) {
    current = themes[0];
    saveCurrentTheme(current);
    info(`Default theme set to: ${themeName(current)}`);
  } else {
    info(`Current theme: ${themeName(current)}`);
  }

  // 3. Configure .bashrc
  const bashrcContent = fs.readFileSync(BASHRC, 'utf-8');
  const ompFuncBlock = [
    '# --- omp-cli integration (managed by omp-cli, do not edit) ---',
    `export POSH_THEME="$(cat "${STATE_FILE}" 2>/dev/null || echo "${current}")"`,
    `omp() { eval "$(node "${SELF_PATH}" "$@")"; }`,
    `eval "$(oh-my-posh init bash --config "$POSH_THEME")"`,
    '# --- end omp-cli integration ---',
  ].join('\n');

  const startMarker = '# --- omp-cli integration (managed by omp-cli, do not edit) ---';
  const endMarker = '# --- end omp-cli integration ---';

  if (bashrcContent.includes(startMarker)) {
    // Replace existing block
    const regex = new RegExp(
      startMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      '[\\s\\S]*?' +
      endMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    );
    const updated = bashrcContent.replace(regex, ompFuncBlock);
    fs.writeFileSync(BASHRC, updated);
    info('Updated existing omp-cli block in .bashrc');
  } else {
    // Remove bare oh-my-posh init line if present, replace with our block
    const bareInit = /^eval "\$\(oh-my-posh init bash\)"$/m;
    let updated;
    if (bareInit.test(bashrcContent)) {
      updated = bashrcContent.replace(bareInit, ompFuncBlock);
      info('Replaced bare oh-my-posh init in .bashrc with omp-cli integration.');
    } else {
      updated = bashrcContent + '\n' + ompFuncBlock + '\n';
      info('Added omp-cli integration to .bashrc');
    }
    fs.writeFileSync(BASHRC, updated);
  }

  info('');
  info('Setup complete! Run `source ~/.bashrc` to activate, then use:');
  info('  omp next       - switch to next theme');
  info('  omp prev       - switch to previous theme');
  info('  omp update     - update themes from GitHub');
  info('  omp status     - check installation status');
}

function cmdNext() {
  const themes = getSortedThemes();
  if (themes.length === 0) {
    info('No themes found. Run `omp setup` first.');
    process.exit(1);
  }

  const current = getCurrentTheme();
  let idx = current ? themes.indexOf(current) : -1;
  idx = (idx + 1) % themes.length;

  emitThemeSwitch(themes[idx]);
}

function cmdPrev() {
  const themes = getSortedThemes();
  if (themes.length === 0) {
    info('No themes found. Run `omp setup` first.');
    process.exit(1);
  }

  const current = getCurrentTheme();
  let idx = current ? themes.indexOf(current) : 0;
  idx = (idx - 1 + themes.length) % themes.length;

  emitThemeSwitch(themes[idx]);
}

function cmdUpdate() {
  const repoDir = path.join(CONFIG_DIR, 'repo');
  if (!fs.existsSync(repoDir)) {
    info('Themes repo not found. Run `omp setup` first.');
    process.exit(1);
  }

  info('Updating themes...');
  try {
    const output = execSync('git pull', { cwd: repoDir, encoding: 'utf-8' });
    info(output.trim());
  } catch (e) {
    info(`Error updating: ${e.message}`);
    process.exit(1);
  }
}

function cmdStatus() {
  info('=== omp-cli status ===');
  info('');

  // Check themes
  const repoDir = path.join(CONFIG_DIR, 'repo');
  if (fs.existsSync(repoDir)) {
    info(`Themes repo: ${repoDir}`);
    try {
      execSync('git fetch --dry-run', { cwd: repoDir, stdio: 'pipe' });
      const local = execSync('git rev-parse HEAD', { cwd: repoDir, encoding: 'utf-8' }).trim();
      const remote = execSync('git rev-parse @{u}', { cwd: repoDir, encoding: 'utf-8', stdio: 'pipe' }).trim();
      if (local === remote) {
        info('Themes repo: up to date');
      } else {
        info('Themes repo: updates available (run `omp update`)');
      }
    } catch {
      info('Themes repo: unable to check remote status');
    }
    const themes = getSortedThemes();
    info(`Themes available: ${themes.length}`);
  } else {
    info('Themes repo: NOT INSTALLED (run `omp setup`)');
  }

  info('');

  // Check current theme
  const current = getCurrentTheme();
  if (current) {
    info(`Current theme: ${themeName(current)}`);
    info(`Theme path: ${current}`);
  } else {
    info('Current theme: none set');
  }

  info('');

  // Check .bashrc integration
  if (fs.existsSync(BASHRC)) {
    const content = fs.readFileSync(BASHRC, 'utf-8');
    if (content.includes('# --- omp-cli integration')) {
      info('.bashrc: omp-cli integration found');
    } else if (content.includes('oh-my-posh init bash')) {
      info('.bashrc: bare oh-my-posh init found (run `omp setup` to integrate)');
    } else {
      info('.bashrc: no oh-my-posh configuration found');
    }
  }

  info('');

  // Check env vars
  info(`POSH_THEME env: ${process.env.POSH_THEME || 'not set'}`);
  info(`POSH_SHELL env: ${process.env.POSH_SHELL || 'not set'}`);
}

// --- Main ---

const args = process.argv.slice(2);

if (args.length === 0) {
  info('Usage: omp <command>');
  info('');
  info('Commands:');
  info('  setup      - install themes and configure .bashrc');
  info('  next       - switch to next theme');
  info('  prev       - switch to previous theme');
  info('  previous   - switch to previous theme');
  info('  update     - update themes from GitHub');
  info('  status     - check installation status');
  process.exit(0);
}

const command = args[0].toLowerCase();

switch (command) {
  case 'setup':
    cmdSetup();
    break;
  case 'next':
    cmdNext();
    break;
  case 'prev':
  case 'previous':
    cmdPrev();
    break;
  case 'update':
    cmdUpdate();
    break;
  case 'status':
    cmdStatus();
    break;
  default:
    info(`Unknown command: ${command}`);
    info('Run `omp` with no arguments for usage.');
    process.exit(1);
}
