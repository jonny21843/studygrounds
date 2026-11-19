# StudyGrounds copyright and age release checklist
- Policy added: /copyright.html. It is a draft until the legal operator finishes DMCA designated agent registration, publishes agent contact details and validates the inbound mailbox.
- The operator confirmed email routing is working for privacy@joinstudygrounds.com, copyright@joinstudygrounds.com, and support@joinstudygrounds.com, forwarding to the administrator inbox. Confirm ongoing deliverability and establish an appropriate outbound reply mechanism. DMCA designated-agent registration is still pending.
- The Terms now set a 13+ minimum. The legal acceptance screen explicitly asks each authenticated user to affirm that they are at least 13. The server rejects a missing or false affirmation, with immutable acceptance record on the Terms version 1.1.
- Cognito Hosted UI can create an account prior to reaching the StudyGrounds legal gate. Before production, determine whether to add an appropriate pre-signup age gate to avoid collecting under-13 personal data in the first place; this current acceptance screen does not constitute identity or age verification.
- Determine a response process for discovered under-13 accounts and ensure deletion requests are actually fulfilled.
- DMCA process must include real incoming notice intake, timely disablement, uploader notices, valid counter-notices, forwarding, case tracking, restoration rules and repeat-infringer enforcement.
- Register designated agent through https://www.copyright.gov/dmca-directory/. Registration and renewal are operator tasks and may expose the required designated-agent contact details publicly.
- Preserve dated historical policy copies and review/version changes before main promotion. Terms v1.1 is still draft.
- The existing moderation UI is not a complete DMCA case-management implementation; do not claim legal compliance from this draft page alone.
