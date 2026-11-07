/**
 * Twelve sample articles. Every person, company and figure is fictional and exists only to give the
 * publication templates realistic shape. Each row is flagged is_sample.
 */
export interface SampleArticle {
  slug: string;
  type: 'story' | 'interview' | 'report';
  title: string;
  dek: string;
  daysAgo: number;
  chapters?: { title: string; at: number }[];
  media?: Record<string, unknown>;
  body: string;
}

export const sampleArticles: SampleArticle[] = [
  {
    slug: 'the-eighteen-month-seat',
    type: 'story',
    title: 'The eighteen-month seat',
    dek: 'Why boards keep hiring CMOs for jobs that were never defined, and what the few long tenures have in common.',
    daysAgo: 2,
    body: `Every board says it wants a growth leader. Fewer can say what growth means for the next eight quarters.

That gap shows up in tenure. In our sample index of 400 fictional CMO appointments, the median seat lasted **4.1 years** for leaders hired against a written mandate, and **1.6 years** for those hired against a job description alone.

## What a written mandate changes

A mandate is not a longer job description. It names the two or three outcomes the business needs, the constraints the CMO inherits, and the decisions the CMO will own outright.

At Halvard Systems, the board wrote one before it spoke to a single candidate. "We argued for three weeks about whether this was a brand job or a pipeline job," said a director involved in the search. "It was both. But we agreed on the order."

The CMO they hired, Imogen Castellane, now in her fourth year, says the document did more for her than the offer letter. "I knew which fight I was hired to win first."

## Three patterns in the long tenures

1. **The CEO co-wrote the scorecard.** Not HR, not the search firm.
2. **Comp tracked the mandate.** Where the job was a turnaround, the equity was weighted to year three.
3. **The first 90 days were measured on learning, not launches.**

> "I knew which fight I was hired to win first."

## What it means for the next search

None of this is new advice. What is new is how quickly a company can now get to a first draft. A structured interview with the CEO, followed by a human review, turns weeks of argument into a document the board can mark up in an afternoon.

The argument still has to happen. It just starts from something written down.`,
  },
  {
    slug: 'mandate-interview-adaeze-okonkwo-hale',
    type: 'interview',
    title: '“The board hired me to say no.” Adaeze Okonkwo-Hale on the turnaround mandate',
    dek: 'The Mandate, episode 14. The CMO of Brightwater Ledger on cutting half the programme in her first quarter.',
    daysAgo: 5,
    chapters: [
      { title: 'The brief she was given', at: 0 },
      { title: 'Cutting half the programme', at: 412 },
      { title: 'Rebuilding trust with sales', at: 1105 },
      { title: 'What she would do differently', at: 1760 },
    ],
    media: { kind: 'audio', durationSec: 2280, src: null },
    body: `Adaeze Okonkwo-Hale joined Brightwater Ledger as CMO when the company had grown headcount faster than revenue for six straight quarters. She talked to us about the first 90 days.

## The brief

**What were you actually hired to do?**

The search firm brief said "scale brand and demand." The board conversation was different. The chair said, more or less, "We have forty programmes and we can't tell you which ten work. We need someone who will stop thirty of them."

**Did you believe that?**

Not fully. Boards say they want cuts and then flinch when a familiar campaign disappears. So I asked them to write down which outcomes they'd judge me on at day 90, and I put a copy in every board pack.

## Cutting half the programme

**How did you decide what to stop?**

We traced every dollar to a stage in the funnel and asked one question: if this vanished tomorrow, which number moves, and who would notice? About half the spend had no answer.

> "If this vanished tomorrow, which number moves, and who would notice?"

**What happened to pipeline?**

It dipped for six weeks, then recovered above the old line by the end of the second quarter. Acquisition cost fell by about a third.

## Sales

**You've said the hardest part wasn't the cuts.**

It was sales. They'd been promised a lot by marketing over the years. I stopped promising volume and started publishing a weekly one-page note: what we shipped, what it produced, what we killed.

## In hindsight

**What would you change?**

I would have brought finance into the room in week one rather than week six. The mandate was a financial one. I treated it as a marketing one for too long.`,
  },
  {
    slug: 'state-of-the-cmo-seat-preview',
    type: 'report',
    title: 'State of the CMO Seat: a first look at the numbers',
    dek: 'Tenure, comp and mandate data from our sample index across the US, Canada, the UK and Europe.',
    daysAgo: 9,
    body: `This is a preview of the annual State of the CMO Seat report. All figures below come from a fictional sample index used to build the report templates.

## Tenure

Median tenure across the index sits at **3.4 years**. It is shortest in venture-backed B2B software (2.6 years) and longest in public consumer goods (4.8 years).

| Segment | Median tenure |
| --- | --- |
| Venture-backed B2B software | 2.6 years |
| Fintech | 3.1 years |
| Public consumer goods | 4.8 years |
| Private equity-backed | 2.9 years |

## Comp

Base salary ranges for full-time CMOs, by market:

- **United States:** $350k to $550k
- **Canada:** C$260k to C$420k
- **United Kingdom:** £200k to £340k
- **Euro area:** €220k to €380k

Fractional CMO retainers ranged from $12k to $25k a month in the US, with equivalent bands elsewhere.

## The mandate gap

Only **31%** of the sample roles had a written mandate at the point of hire. Those that did saw tenures roughly two and a half times longer.

## AI in the job description

Mentions of AI in CMO job descriptions tripled across the sample year. Few defined what the CMO was expected to do with it. The most common phrasing was some version of "AI-native mindset," which tells a candidate very little.

## Methodology

The full report will publish the method in detail, including how we classify a move, how we source public filings, and what we exclude. Every number is reviewed by an editor before it appears on the site.`,
  },
  {
    slug: 'fractional-cmo-is-not-a-cheaper-cmo',
    type: 'story',
    title: 'A fractional CMO is not a cheaper CMO',
    dek: 'Companies that treat fractional as a budget option get the worst of both. The ones that scope it tightly get a lot.',
    daysAgo: 12,
    body: `Fractional marketing leadership has gone from an odd arrangement to a standard line in a seed or Series A plan. The results vary more than the pitch suggests.

## Where it works

The fractional engagements that work in our sample share one trait: a **narrow, time-boxed mandate**. Build the first demand engine. Hire the first full-time head of marketing. Reposition before a fundraise.

Soren Lindqvist has run seven fractional engagements across the Nordics and the UK. "If the founder can't tell me what done looks like in six months, I don't take it," he said. "Otherwise I become an expensive part-time employee doing everything badly."

## Where it fails

It fails when a company hires fractional because it cannot afford, or cannot decide on, a full-time CMO, then expects full-time outcomes. The fractional leader gets pulled into weekly operations and has no time left for the structural work they were hired to do.

> "If the founder can't tell me what done looks like in six months, I don't take it."

## How to scope it

- Write the mandate as if hiring full-time, then cut it to the one outcome that matters most.
- Agree the handover in advance: who takes over, and when.
- Price the retainer against the outcome, not the hours.

## The comp picture

In our sample, fractional retainers clustered between **$12k and $25k a month** in the US, **€9k to €18k** in the euro area, and **£8k to £16k** in the UK. Engagements tied to a single outcome ran a median of seven months.`,
  },
  {
    slug: 'mandate-interview-henrik-vandermeer',
    type: 'interview',
    title: 'Henrik Vandermeer on building marketing for two continents at once',
    dek: 'The Mandate, episode 13. Rheinwerk Logistik’s CMO on launching in North America without breaking Europe.',
    daysAgo: 16,
    chapters: [
      { title: 'Why expand now', at: 0 },
      { title: 'One brand, two buyers', at: 520 },
      { title: 'Hiring the first US team', at: 1240 },
    ],
    media: { kind: 'video', durationSec: 1980, src: null },
    body: `Henrik Vandermeer has led marketing at Rheinwerk Logistik for five years. Last year the company opened in North America.

## Why now

**What changed the board's mind about expansion?**

Our three largest European customers opened US warehouses in the same year. They asked us to follow. That's the best market-entry research there is.

## One brand, two buyers

**Is the buyer the same?**

The job title is the same. The buying process isn't. In Germany a logistics director will read a forty-page technical document. In the US the same person wants a reference call and a pilot in thirty days.

> "The job title is the same. The buying process isn't."

**So you built two playbooks?**

One brand, two playbooks. We kept the identity and the core claims identical and rewrote everything downstream of the first meeting.

## The first US team

**Who did you hire first?**

A product marketer, not a demand person. I needed someone who could translate what we do into how an American operations leader thinks about risk. Demand came second, once we knew what to say.

**What about AI?**

We use it heavily for localisation and research. We don't let it write anything a customer reads without a person signing it off. Logistics buyers notice when copy is generic.`,
  },
  {
    slug: 'moves-quarterly-q3',
    type: 'report',
    title: 'CMO moves, quarter in review',
    dek: 'Appointments outpaced departures for the first time in a year. Most new seats came with a new title.',
    daysAgo: 21,
    body: `This review covers moves logged in the CMO Moves tracker over the quarter. Every move in the tracker cites at least one public source and passes an editor before it appears. Figures here reflect the fictional sample dataset.

## Headline numbers

- **142** appointments, **118** departures, **27** internal promotions.
- **38%** of new appointments carried a title other than CMO, most often Chief Growth Officer.
- **21%** of appointments went to leaders moving across industries.

## The title drift

The rise of the Chief Growth Officer title continued. In most cases the scope included revenue operations or customer success alongside marketing. In a handful it was a straight rename.

## Where seats opened

Fintech and digital health together accounted for more than a third of departures, consistent with the funding pressure in both sectors through the year.

## Canada and Europe

Canadian appointments rose for a third straight quarter, led by fintech in Toronto and climate tech in Calgary. In Europe, the strongest activity was in the Netherlands and the Nordics, much of it tied to North American expansion plans.

## What we watch next quarter

1. Whether the Chief Growth Officer title keeps absorbing revenue operations.
2. How many PE-backed companies replace their CMO within a year of a buyout.
3. The share of new seats with AI explicitly in the mandate.`,
  },
  {
    slug: 'what-ai-native-cmo-means',
    type: 'story',
    title: 'What “AI-native CMO” should mean in a job description',
    dek: 'The phrase appears in a third of new CMO postings. Here is how to make it mean something.',
    daysAgo: 25,
    body: `"AI-native" has become the new "data-driven": a phrase that signals intent and specifies nothing.

We read 300 fictional sample CMO job descriptions that used some version of it. Fewer than one in ten said what the CMO would actually do differently.

## Three things it can mean

**1. The operating model.** The CMO redesigns how the team works, with agents and automation handling research, production and routing. Measure it in cycle time and cost per asset.

**2. The product.** The company sells an AI product and the CMO must explain it to buyers who are sceptical, regulated or both. Measure it in win rate and sales cycle length.

**3. The market.** Buyers now find vendors through AI answers as well as search. The CMO must make the company a cited source. Measure it in share of answer for the category's core questions.

> Most job descriptions conflate all three. Most candidates are strong in one.

## Write the version you mean

If you mean the operating model, say what share of the work you expect to be automated in a year. If you mean the product, describe the buyer's main objection. If you mean the market, name the questions you want to be the answer to.

## For candidates

Treat the phrase as an invitation to ask which of the three it means. If nobody in the room can answer, the mandate isn't written yet.`,
  },
  {
    slug: 'mandate-interview-marisol-jaramillo',
    type: 'interview',
    title: 'Marisol Jaramillo: “Fractional was the best way to find out what the job was”',
    dek: 'The Mandate, episode 12. Why Solvento Pagos hired its CMO as a fractional leader first.',
    daysAgo: 30,
    chapters: [
      { title: 'Starting fractional', at: 0 },
      { title: 'The conversion conversation', at: 640 },
      { title: 'Advice for founders', at: 1320 },
    ],
    media: { kind: 'audio', durationSec: 1700, src: null },
    body: `Marisol Jaramillo joined Solvento Pagos as a two-day-a-week fractional CMO. Nine months later she took the full-time role.

## Starting fractional

**Why not go straight to full-time?**

Neither side knew what the job was. The founders thought they needed brand. I thought they needed product marketing. We agreed I'd spend three months finding out, with one deliverable: a written mandate for whoever took the job full-time.

**And you wrote yourself into it?**

Not deliberately. The mandate said the company needed someone who'd led a payments launch in Spain and Latin America. That turned out to be a short list.

> "We agreed I'd spend three months finding out what the job was."

## Converting

**How did the conversation go?**

The CEO read the mandate and asked if I'd do it. I said yes, on the condition that the board approved the document first, so the job couldn't drift.

## Advice

**What should a founder take from this?**

Use fractional to answer a question, not to save money. If you know exactly what you need, hire it. If you don't, pay someone senior to find out and write it down.`,
  },
  {
    slug: 'confidential-search-why-sitting-cmos-stay-hidden',
    type: 'story',
    title: 'Why sitting CMOs stay hidden, and what would bring them out',
    dek: 'The best candidates for most CMO searches are employed and unwilling to be seen looking. Confidentiality is the product.',
    daysAgo: 34,
    body: `Ask a search partner where the best CMO candidates are and the answer is always the same: in a CMO seat, not looking.

That creates a problem for every platform that wants to help them move. A sitting executive will not put a profile anywhere their CEO, their board or their competitors might see it.

## What they fear

We spoke to a dozen fictional sample executives about what would make them create a private profile. Their concerns were consistent:

- Their current employer seeing it.
- A recruiter forwarding it without permission.
- An algorithm deciding they were not a fit based on their age, school or name.

## What would change their minds

**Visible to no one by default.** Not "private" with exceptions in the small print. No one.

**A blocklist they control.** Their current employer and any company they name should never see them, in any search, ever.

**Consent before every reveal.** An employer sees an anonymous summary and a rationale. The candidate decides whether their name follows.

**A human in the loop.** "I'm comfortable with software suggesting a match," one said. "I'm not comfortable with software making the introduction."

> "I'm comfortable with software suggesting a match. I'm not comfortable with software making the introduction."

## The test

A platform earns this trust slowly and loses it once. The design question is not how to get more profiles. It is how to make a sitting CMO certain that nothing happens without their say.`,
  },
  {
    slug: 'comp-benchmarks-canada-uk-europe',
    type: 'report',
    title: 'CMO comp outside the US: Canada, the UK and Europe',
    dek: 'Base, bonus and equity patterns from the sample index, and where the gaps with the US are closing.',
    daysAgo: 40,
    body: `US CMO comp dominates the conversation. This report looks at the other three markets in our sample index. All figures are fictional and illustrative.

## Base salary bands

| Market | Median base | Typical range |
| --- | --- | --- |
| Canada | C$330k | C$260k to C$420k |
| United Kingdom | £255k | £200k to £340k |
| Euro area | €290k | €220k to €380k |

## Bonus and equity

Annual bonus targets were similar across markets, between 30% and 50% of base. Equity was where the gap opened. Venture-backed companies in Canada and the UK offered grants comparable to US peers at Series B and C. In the euro area, equity was smaller and more often tied to a liquidity event.

## Where the gap is closing

Companies with a US expansion plan increasingly benchmark their CMO comp against the US market regardless of headquarters. In the sample, euro-area companies with more than 30% of revenue from North America paid a median base 18% above their peers.

## Fractional retainers

- Canada: C$14k to C$28k a month
- UK: £8k to £16k a month
- Euro area: €9k to €18k a month

## Notes for employers

Publishing a comp range is now legally required for many roles in parts of the US and Canada and is becoming expected in the UK and EU. Every listing on this board shows comp, in the currency of the role.`,
  },
  {
    slug: 'first-90-days-scorecard',
    type: 'story',
    title: 'The 90-day scorecard that boards actually read',
    dek: 'Most CMO onboarding plans are activity lists. The ones that last measure what the new leader learned.',
    daysAgo: 47,
    body: `New CMOs usually arrive with a 30-60-90 plan. Boards usually ignore it. The fictional sample leaders who lasted longest used a different format.

## Learning before launching

The strongest scorecards in our sample set the first 30 days entirely around learning, with named outputs:

- A written view of the three customer segments that matter, tested with twenty customer conversations.
- A map of every marketing dollar to a stage of the funnel.
- A short list of what to stop.

## Day 60: decisions

By day 60, the scorecard asked for decisions rather than findings. Which programmes end. Which hires come first. Which single metric the board should watch.

## Day 90: one visible result

Only at day 90 did the scorecard ask for a shipped result, and only one. Teams that tried to ship three usually shipped none well.

> Teams that tried to ship three usually shipped none well.

## Who writes it

The CEO and the new CMO, together, in the first week. The board approves it. That shared authorship is what makes it hard to rewrite later when priorities shift, which they will.

## A template

Our Mandate Builder produces a 90-day scorecard in this format from a structured conversation with the CEO. It is a starting draft. A person edits and approves every line before anyone else sees it.`,
  },
  {
    slug: 'mandate-interview-nikhil-nakashima',
    type: 'interview',
    title: 'Nikhil Nakashima on hiring a CMO as a first-time CEO',
    dek: 'The Mandate, episode 11. Fieldnote’s CEO on the search that failed and the one that worked.',
    daysAgo: 55,
    chapters: [
      { title: 'The first search', at: 0 },
      { title: 'What went wrong', at: 480 },
      { title: 'Writing the mandate', at: 1010 },
      { title: 'The second hire', at: 1590 },
    ],
    media: { kind: 'audio', durationSec: 2040, src: null },
    body: `Nikhil Nakashima founded Fieldnote and has hired two heads of marketing. The first left after eleven months.

## The first search

**What did you look for the first time?**

Logos. I wanted someone from a company I admired. I hired someone excellent who had run a 200-person marketing team at a public company. We were forty people.

**What went wrong?**

Nothing they did was wrong. They built a plan for a company we weren't. They needed a team to delegate to and I'd given them two people and a budget for a third.

> "They built a plan for a company we weren't."

## The mandate

**What did you do differently?**

I wrote down, before talking to anyone, what the job had to produce in a year and what resources it came with. Then I asked our two most senior board members to edit it. They disagreed with each other, which was useful.

**What was in it?**

Two things. Get pipeline from founder-led to repeatable. Hire a team of five that could run without the CMO in the room.

## The second hire

**Who did you hire?**

Someone who had been the first marketing hire twice. Less impressive on paper. Exactly right for the mandate. Two years in, it's working.`,
  },
];
