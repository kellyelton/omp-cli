# omp-cli

A zero-dependency Node.js CLI tool for cycling through Oh My Posh themes in bash.

**IMPORTANT: This file and CLAUDE.md must always stay in sync. When updating one, update the other to match.**

## Purpose

Replaces manual theme switching with simple `omp next` / `omp prev` commands. Manages theme downloads, shell integration, and theme state persistence.

## Architecture

- **Single-file CLI** (`index.js`) — no build step, no dependencies, uses `node:util.parseArgs`
- **Shell integration** via a bash function that `eval`s stdout from the Node process. Informational output goes to stderr so it displays without being eval'd.
- **Themes** are obtained via sparse git checkout of the oh-my-posh repo, stored at `~/.config/omp-cli/`
- **State** (current theme) is persisted in `~/.config/omp-cli/current-theme`

## Commands

| Command | Description |
|---------|-------------|
| `omp setup` | Download themes, configure `.bashrc` with alias and oh-my-posh init |
| `omp next` | Switch to the next theme alphabetically (wraps around) |
| `omp prev` / `omp previous` | Switch to the previous theme (wraps around) |
| `omp update` | Pull latest themes from GitHub |
| `omp status` | Check repo state, `.bashrc` integration, env vars, current theme |

## Key Design Decisions

- **stdout vs stderr**: `next`/`prev` emit shell commands to stdout (for `eval`), everything else goes to stderr. This is critical to the shell integration pattern.
- **Sparse checkout**: The oh-my-posh repo is ~37MB. We clone only the `themes/` directory to save space and bandwidth.
- **No global install**: `setup` adds a bash function directly to `.bashrc` that invokes `node <path>/index.js`.

## Development Notes

- Node.js 18+ required (uses `node:util` parseArgs)
- Cross-platform line endings handled via `.gitattributes`
- Config directory: `~/.config/omp-cli/`
- Themes symlinked from `~/.config/omp-cli/repo/themes/` to `~/.config/omp-cli/themes/`
