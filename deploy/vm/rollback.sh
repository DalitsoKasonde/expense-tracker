#!/usr/bin/env bash
# Manual rollback entry point for use on the VM:
#
#   sudo -u deploy /opt/apps/expense-tracker/deploy/vm/rollback.sh
#
# Delegates to the installed forced-command wrapper so that the git checkout is
# synced to the previous tag by a script that lives outside the checkout.
# CI does the same thing via `workflow_dispatch` with rollback=true.
set -euo pipefail

WRAPPER=${WRAPPER:-/usr/local/bin/expense-tracker-deploy}

if [[ ! -x "$WRAPPER" ]]; then
  echo "ERROR: $WRAPPER is not installed; see deploy/vm/ssh-forced-command.sh" >&2
  exit 1
fi

SSH_ORIGINAL_COMMAND="rollback" exec "$WRAPPER"
