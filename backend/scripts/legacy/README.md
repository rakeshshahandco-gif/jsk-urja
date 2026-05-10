Legacy one-off backend scripts
==============================

This folder centralizes old ad-hoc `.cjs` and `.js` maintenance/debug scripts that were previously in `backend/` root.

No runtime application code imports these files. The production API still runs from `backend/src/index.js`.

Run a script from project root:

`node backend/scripts/legacy/<script-name>.cjs`

or

`node backend/scripts/legacy/<script-name>.js`

Or from `backend/`:

`node scripts/legacy/<script-name>.cjs`

or

`node scripts/legacy/<script-name>.js`
