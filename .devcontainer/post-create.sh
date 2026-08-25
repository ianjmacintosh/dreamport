#!/bin/bash
set -e

# Claude Code splits its login state across two paths: ~/.claude/ (the
# mounted pillbug-claude-code-auth volume — .credentials.json lives here and
# already survives rebuilds) and a sibling ~/.claude.json (oauthAccount,
# userID, onboarding state) that sits directly in the ephemeral home dir and
# gets wiped every rebuild, forcing a re-login despite valid credentials
# sitting untouched next door. Move it into the volume once, then symlink it
# there permanently so both halves persist together from now on.
if [ -f ~/.claude.json ] && [ ! -L ~/.claude.json ] && [ ! -f ~/.claude/claude.json ]; then
  mv ~/.claude.json ~/.claude/claude.json
fi
if [ ! -L ~/.claude.json ]; then
  rm -f ~/.claude.json
  ln -s ~/.claude/claude.json ~/.claude.json
fi

# Download Playwright's browser binaries. The playwright-deps feature installs
# the OS-level libraries (libnss3, libatk, etc.) but not the browsers
# themselves, so `playwright test` fails with "Executable doesn't exist"
# unless this also runs.
npx playwright install chromium

# Copy tmux config (No sudo required)
cp .devcontainer/.tmux.conf ~/.tmux.conf

# herdr (terminal multiplexer). Installs to a user-writable path, so no sudo
# needed and it doesn't survive a rebuild on its own — reinstall here every
# time, same as the npm globals below. devcontainer.json's SHELL/ENV vars
# assume it's present and fall back to a dumb /bin/sh when it isn't.
curl -fsSL https://herdr.dev/install.sh | sh

# Claude Code itself, plus agent-ergonomic CLI wrappers (AXI protocol, see
# firstmate project). Installed as node (not via a devcontainer feature,
# which would install as root) so the global npm dir stays node-owned and
# Claude Code's own auto-updater can write to it later. Global npm packages
# live outside the ~/.claude volume, so they don't survive a rebuild on
# their own — reinstall them here every time instead. Claude Code's
# SessionStart hooks (~/.claude/settings.json) call the AXI wrappers directly.
npm install -g @anthropic-ai/claude-code gh-axi chrome-devtools-axi lavish-axi tasks-axi