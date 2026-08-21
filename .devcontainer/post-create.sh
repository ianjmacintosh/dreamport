#!/bin/bash
set -e

# Download Playwright's browser binaries. The playwright-deps feature installs
# the OS-level libraries (libnss3, libatk, etc.) but not the browsers
# themselves, so `playwright test` fails with "Executable doesn't exist"
# unless this also runs.
npx playwright install chromium

# Copy tmux config (No sudo required)
cp .devcontainer/.tmux.conf ~/.tmux.conf

# Agent-ergonomic CLI wrappers (AXI protocol, see firstmate project). Global
# npm packages live outside the ~/.claude volume, so they don't survive a
# rebuild on their own — reinstall them here every time instead. Claude
# Code's SessionStart hooks (~/.claude/settings.json) call these directly.
npm install -g gh-axi chrome-devtools-axi lavish-axi tasks-axi