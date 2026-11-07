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
| P8 | **Quebec Law 25** if Quebec residents are in scope (privacy impact assessments for transfers outside Quebec). | Canada | Open |

## Publishing

| # | Question | Where it touches | Status |
| --- | --- | --- | --- |
| E1 | **Moves Tracker sources.** Quotation length and attribution from press releases and newswires; terms of use of each wire. SEC EDGAR is public. No LinkedIn scraping. | Moves Tracker | Open |
| E2 | **Defamation and corrections policy** for reported departures. | Moves, editorial | Open |
| E3 | **Person JSON-LD** for public moves only: confirm this is acceptable under GDPR for EU individuals. | SEO | Open |

## Email and commerce

| # | Question | Where it touches | Status |
| --- | --- | --- | --- |
| C1 | **CASL** express consent wording and record-keeping; **CAN-SPAM** footer; **UK PECR / EU ePrivacy** for B2B email. | Newsletter, alerts | Open |
| C2 | **Pay transparency.** Comp ranges are required on every listing. Confirm format meets NYC, California, Colorado, Washington, BC, Ontario (2026) and EU Pay Transparency Directive rules. | Listings | Open |
| C3 | **Sales tax / VAT** on job posts and subscriptions across markets (Stripe Tax?). | Billing | Open |
