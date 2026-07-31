# Known Limitations

1. **Unique company KPI (Phase 15)** approximates unique entities from ExtractedLead duplicate flags — not a full graph census.
2. **Market coverage** is against the known discovered universe — never market share.
3. **assertNoSecrets** is strongest in Phases 13–16; earlier phases rely on provider secret utilities and sanitized responses.
4. **Communication frequency** returns `HISTORY_UNAVAILABLE` when CommunicationHistory has no rows / query unavailable — does not invent history.
5. **Marketing language** stores draft language + personalization; not a full translation TMS.
6. **Discovery agent routes** use agent token auth, not CRM `checkPermission`.
7. **Task soft-cancel** loads Task by id inside company-scoped sales workflow rollback path.
8. **Phase 16** does not send email/WhatsApp; handoff is non-executable.
9. **Git working tree** may contain large unrelated local artifacts (e.g. WhatsApp auth deletes); Phase work must not clean/reset them.