#!/bin/sh
# Installs the git hook that bumps public/version.json on every commit.
root=$(git rev-parse --show-toplevel)
cp "$root/scripts/pre-commit" "$root/.git/hooks/pre-commit"
chmod +x "$root/.git/hooks/pre-commit"
echo "Installed: each commit now bumps public/version.json"
