Backend log artifacts
=====================

This folder stores archived debug/startup/log output that was previously at `backend/` root.

Current archive location:

`backend/logs/archive/`

Notes:
- Runtime scripts may recreate some files (for example `debug_ledger.json`) at `backend/` root when those debug paths are executed.
- If a command expects a specific log filename in root, create or copy that file temporarily.
