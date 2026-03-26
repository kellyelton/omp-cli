# oh-my-posh-cli

Cycle through [Oh My Posh](https://ohmyposh.dev/) themes from the command line. Your prompt updates instantly and your selection persists across sessions.

## Requirements

- Linux or macOS (WSL works)
- [Oh My Posh](https://ohmyposh.dev/docs/installation/linux) installed
- Node.js 18+
- Git
- Bash

## Install

```bash
npm install -g oh-my-posh-cli
omp setup
source ~/.bashrc
```

If you already have a themes folder, point setup at it:

```bash
omp setup ~/my-themes
```

## Usage

```
omp next         Switch to the next theme
omp prev         Switch to the previous theme
omp update       Update themes from GitHub
omp status       Check installation status
omp setup        Re-run setup (or point to a custom themes folder)
```
