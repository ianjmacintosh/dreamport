# docker exec sessions don't inherit locale from the container environment,
# so LANG is empty. Set it explicitly so tmux enables UTF-8 (client_utf8=1)
# and renders Unicode characters correctly.
# Upstream now sets LANG=C.UTF-8 in the base image itself
# (devcontainers/images#1926), but the floating :24 tag hadn't picked that up
# as of 2026-07-28. Safe to drop this export once it has.
export LANG=en_US.UTF-8

# If the terminal type isn't known to this container (e.g. xterm-ghostty from
# a direct docker exec), fall back to xterm-256color so programs don't see an
# unknown TERM and degrade their output.
if ! infocmp "$TERM" &>/dev/null 2>&1; then
    export TERM=xterm-256color
fi