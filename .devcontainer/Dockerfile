# For format details, see https://containers.dev/guide/dockerfile
FROM mcr.microsoft.com/devcontainers/javascript-node:24

# Baked in at build time (root) rather than appended to a single user's
# ~/.bashrc by post-create.sh (which runs as the non-root remoteUser, and
# can no longer touch root-owned files now that sudo has been stripped).
# /etc/bash.bashrc is sourced by every user's interactive non-login shell,
# including a plain `docker exec -it <container> bash` that lands as root.
COPY bash-terminal-fixes.sh /tmp/bash-terminal-fixes.sh
RUN cat /tmp/bash-terminal-fixes.sh >> /etc/bash.bashrc && rm /tmp/bash-terminal-fixes.sh

# Read via $ENV (see devcontainer.json) — dash's own documented mechanism
# for an interactive-shell rc file, since it has no ~/.bashrc equivalent.
# Warns if something lands a session in dash despite SHELL=/bin/bash.
COPY dash-warning.sh /etc/dash-warning.sh

RUN mkdir -p /home/node/.claude && chown -R node:node /home/node/.claude
USER node