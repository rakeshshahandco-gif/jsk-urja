# Assisted Capture — Manual Test Checklist

Prereqs: company has Data Extractor enabled; user has assisted_capture start/view/manage + query open + raw ingest; Discovery Agent token created.

1. Create/approve SearchQuery with `searchUrl` like `https://www.google.com/search?q=home+automation`.
2. POST assisted-captures session (JWT). Confirm response has no token fields.
3. Run agent: `node tools/discovery-agent/src/index.js assisted-capture --session <id>`  
   (or `run-job` with `sourceMode=assisted_google_capture`).
4. Browser opens the Google search URL (dedicated profile).
5. If consent/captcha/login appears, resolve manually; do not ask agent to bypass.
6. When organic results are visible, either:
   - type `capture` in the agent terminal, or
   - DevTools: `window.__JSK_CAPTURE_VISIBLE__ = true`
7. Confirm CRM event → RawCapture rows; no ExtractedLead.
8. Complete/cancel session; further events rejected.
9. Cross-company access returns 404; missing permissions 403.
