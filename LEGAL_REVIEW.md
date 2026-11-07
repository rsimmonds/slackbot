# LEGAL_REVIEW.md

Items that need a lawyer's decision. The code records the facts these decisions need, but does not make the decisions. Each item names where it touches the product.

Status key: **Open** (not yet reviewed), **In review**, **Decided** (with date and outcome).

## Hiring and AI

| # | Question | Where it touches | Status |
| --- | --- | --- | --- |
| H1 | **NYC Local Law 144.** Is the Matcher an "automated employment decision tool" when a human approves every match? Scope of the annual bias audit, publication of results, and candidate notice (10 business days?). | Matcher, fairness report, candidate notice | Open |
| H2 | **EU AI Act, high-risk (Annex III, employment).** Are we a provider, a deployer, or both? Conformity assessment, EU database registration, technical documentation, post-market monitoring, and the dates that apply. | All matching; Mandate Builder if it ranks | Open |
| H3 | **GDPR Article 22.** Confirm that mandatory human approval of every match takes matching outside "solely automated" decisions. Wording of the candidate notice. | Match review, candidate notice | Open |
| H4 | **Recruitment agency status.** Do the 12% search and 15% fractional fees make us an employment agency needing a licence in any launch jurisdiction (e.g. some US states, Ontario EPA, UK Conduct of Employment Agencies Regulations)? | Paid search, fractional match | Open |
| H5 | **Protected attributes.** Confirm the list stripped before matching for each market (US federal + state, Canada, EU, UK Equality Act). | PII stripper | Open |
| H7 | **Bias audit on synthetic data.** No demographic data is collected, so the fairness report uses synthetic profiles that differ only in protected attributes (invariance), plus a four-fifths impact-ratio test on a synthetic population. Confirm this satisfies NYC LL144 (test data permitted when historical data is unavailable) and EU AI Act Art. 10. Names used as ethnicity proxies in the test data need review. | `/console/fairness`, weekly report | Open |
| H8 | **Years of experience as an age proxy.** The Matcher never receives it, and employers no longer see it (migration 0013). Talent partners still see it in the dossier. Confirm. | Matching, shortlist | Open |
| H9 | **Comp floor in hard filters.** A candidate's private comp floor (encrypted) is decrypted only inside the matching job to exclude roles that pay below it. Confirm lawful basis and notice. | Matching | Open |
| H10 | **Consent withdrawal after reveal.** Withdrawing hides identity and closes messaging immediately, but cannot undo what the employer already saw. Confirm the Consent Gate wording meets GDPR Art. 7(3). | Reveal flow | Open |
| H11 | **Search fees and invoices.** 12% of first-year cash comp and 15% of monthly retainer, 30-day terms, "accepted on behalf of the company" wording (signatory authority?), and minimum invoice content per market (tax IDs, addresses). Related: H4, C3. | Paid searches | Open |
| H6 | **Illinois AI Video Interview Act / Colorado AI Act / similar.** Any obligations if interviews include audio or video later. | Session View (future) | Open |

## Privacy and data

| # | Question | Where it touches | Status |
| --- | --- | --- | --- |
| P1 | **EU data residency.** Must EU and UK candidate data be stored in the EU/UK, or are SCCs/UK IDTA with US subprocessors enough? `data_region` is recorded per user from day one. | Database hosting, subprocessors | Open |
| P2 | **Lawful basis per purpose** (contract, consent, legitimate interest) for: profiles, matching, newsletter, analytics, Moves Tracker coverage of named people. | Privacy policy, consent flows | Open |
| P3 | **DPIA** before matching goes live (Phase 3). | Matching | Open |
| P4 | **EU and UK representative** (GDPR Art. 27). | Company setup | Open |
| P5 | **Retention.** Anonymize inactive candidate profiles after 24 months (spec). Confirm against each market and against audit-log retention needs for H1/H2. | Retention job | Open |
| P6 | **Cookie consent** standard (EU ePrivacy, UK PECR, Quebec Law 25). | Analytics, PostHog | Open |
| P7 | **Privacy policy, terms, subprocessor list, records of processing.** Drafts to be produced before Phase 1 launch. | Legal pages | Open |
| P16 | **Voyage AI as subprocessor** for embeddings. It receives blind text only (outcomes and mandate scope, no names or contact details). | Matching | Open |
| P9 | **Anthropic as subprocessor** for job descriptions and public news text sent to the Listing Parser and Moves Tracker. Add to the subprocessor list. | AI agents | Open |
| P10 | **Rate-limit IP hashing.** IPs are salted-hashed and kept in memory only, never stored. Confirm no notice is needed. | Newsletter signup | Open |
| P11 | **Deletion and the audit log.** The audit log is append-only by design. After an account is deleted, its entries keep a user ID that no longer resolves to anyone. Confirm this counts as anonymized under GDPR Art. 17. | Data rights, audit log | Open |
| P12 | **Deletion timing.** Deletion takes effect immediately (profile anonymized and hidden), with a 7-day cancellable grace period before permanent deletion, well within 30 days. Export archives are kept 30 days. Confirm both periods. | `/account/data` | Open |
| P13 | **Résumé text sent to Anthropic.** After contact details and protected attributes are scrubbed, résumé text is given to the Profile Interviewer as background. Confirm notice and lawful basis (see P9). | Profile interview | Open |
| P14 | **Comp benchmark disclosure.** The Mandate Builder shows employers aggregate comp (p25, median, p75, minimum 5 listings) drawn from other employers' live and expired listings. Confirm this is acceptable. | Mandate Builder | Open |
| P15 | **One cookie banner for all markets.** The same banner is shown everywhere and Global Privacy Control counts as a decline. Confirm this meets ePrivacy, PECR and Québec Law 25. | Cookie consent | Open |
| P8 | **Quebec Law 25** if Quebec residents are in scope (privacy impact assessments for transfers outside Quebec). | Canada | Open |

## Publishing

| # | Question | Where it touches | Status |
| --- | --- | --- | --- |
| E1 | **Moves Tracker sources.** Quotation length and attribution from press releases and newswires; terms of use of each wire. SEC EDGAR is public. No LinkedIn scraping. | Moves Tracker | Open |
| E2 | **Defamation and corrections policy** for reported departures. | Moves, editorial | Open |
| E3 | **Person JSON-LD** for public moves only: confirm this is acceptable under GDPR for EU individuals. | SEO, `/moves/[id]` | Open |
| E4 | **Feed terms.** Terms of use for each configured newsroom and press-wire feed, and how much text the Moves Tracker may store and quote. Feeds are off until listed in `MOVES_NEWSROOM_FEEDS` / `MOVES_WIRE_FEEDS`. | Moves Tracker sources | Open |
| E5 | **SEC EDGAR fair access.** Confirm the request rate and the User-Agent (`SEC_USER_AGENT`, must carry company contact details) meet SEC policy. | Moves Tracker, EDGAR adapter | Open |
| E6 | **Reader tips.** Retention and lawful basis for storing tip text and the submitter's user ID (GDPR, PIPEDA). | `/moves/submit`, `source_items` | Open |
| E7 | **Auto-created company records.** The Moves Tracker creates a minimal company record when a public source names a company we don't have. Confirm this is fine and how corrections are handled. | Moves Tracker | Open |

## Email and commerce

| # | Question | Where it touches | Status |
| --- | --- | --- | --- |
| C1 | **CASL** express consent wording and record-keeping; **CAN-SPAM** footer; **UK PECR / EU ePrivacy** for B2B email. | Newsletter, alerts | Open |
| C2 | **Pay transparency.** Comp ranges are required on every listing. Confirm format meets NYC, California, Colorado, Washington, BC, Ontario (2026) and EU Pay Transparency Directive rules. | Listings | Open |
| C3 | **Sales tax / VAT** on job posts and subscriptions across markets. Stripe automatic tax is **off** in Phase 1. | Billing, Stripe Checkout | Open |
| C4 | **Postal address in email footers** (CAN-SPAM, CASL). `COMPANY_POSTAL_ADDRESS` must be a real address before any email is sent. | All email | Open |
| C5 | **Newsletter consent wording.** Review the exact text stored with each signup (`apps/web/lib/newsletter/service.ts`). | Newsletter | Open |
| C7 | **Draft legal pages.** Privacy, terms, cookies, subprocessors and the AI notice are drafts. Each "For counsel:" marker needs a decision: legal entity, lawful bases, transfers, retention, liability, governing law, review contact. Subprocessor regions are assumed. | `/legal/*` | Open |
| C8 | **Sponsored content disclosure.** Confirm the "Sponsored" label and placement meet FTC, ASA and Competition Bureau rules. | Sponsorships | Open |
| C6 | **Job board vs agency.** Confirm that listing paid job posts (as distinct from paid search, H4) needs no licence in any launch market. | Job board | Open |
