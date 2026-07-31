# Assisted Capture — Agent Security

## Non-negotiables

- Visible Chromium only (Playwright persistent context profile dir `assisted_google_capture`).
- **No** personal Chrome profile reuse.
- **No** stealth plugins, proxies, auto-scroll, auto-next-page, or auto type/search loops.
- Agent opens `session.searchUrl` exactly; operator may refine results manually in the browser.
- Consent / captcha / login → `manual_action_required`; agent waits; **does not bypass**.
- Upload organic structured results only. Never upload HTML, DOM, cookies, passwords, storageState, screenshots.

## Capture triggers

1. Terminal stdin line: `capture`
2. Browser flag polled every 1s: `window.__JSK_CAPTURE_VISIBLE__ = true`

## Auth

- Discovery agent: `X-Discovery-Agent-Token`
- Assisted session: `X-Assisted-Session-Token` (delivered once on `/claim`, stored hashed server-side)

## Token handling

- Session API responses never return plain tokens or `tokenHash`.
- Plain token lives briefly in DiscoveryAgentJob.metadata.pendingSessionToken until claim, then cleared.

## Profile / local data

- Profile path under `tools/discovery-agent/profiles/assisted_google_capture`
- Clear with: `node src/index.js clear-profile --source assisted_google_capture`
