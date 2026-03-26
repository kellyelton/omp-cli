# omp-cli

A simple CLI tool for cycling through [Oh My Posh](https://ohmyposh.dev/) themes in bash.

## Features

- Browse themes with `omp next` and `omp prev` — the prompt updates instantly
- Themes persist across terminal sessions
- Automatically downloads themes via sparse git checkout (minimal disk usage)
- Self-configuring `.bashrc` integration
- Zero dependencies — just Node.js 18+

## Install

```bash
git clone https://github.com/kellyelton/omp-cli.git
cd omp-cli
node index.js setup
source ~/.bashrc
```

## Usage

```
omp next       Switch to the next theme
omp prev       Switch to the previous theme
omp update     Update themes from GitHub
omp status     Check installation status
omp setup      Install themes and configure .bashrc
```

## How It Works

The `setup` command clones the Oh My Posh [themes directory](https://github.com/JanDeDobbeleer/oh-my-posh/tree/main/themes) and adds a bash function to your `.bashrc` that wraps the CLI. When you run `omp next` or `omp prev`, the Node process outputs shell commands to stdout which the bash function `eval`s in your current session, updating the prompt immediately.

## Requirements

- [Oh My Posh](https://ohmyposh.dev/docs/installation/linux) installed
- Node.js 18+
- Git
- Bash
