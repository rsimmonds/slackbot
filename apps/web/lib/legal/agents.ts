/**
 * Plain-language description of every AI agent (spec 7, 9.7). Drives /legal/ai and the AiNotice
 * component, so the notice stays in step with what the agents actually do.
 */
export interface AgentNotice {
  name: string;
  what: string;
  /** What the agent receives. */
  receives: string;
  /** Who checks its work before it reaches anyone. */
  humanCheck: string;
}

export const agentNotices: AgentNotice[] = [
  {
    name: 'Moves Tracker',
    what: 'Reads company newsrooms, press wires and SEC filings, and drafts CMO appointments and departures.',
    receives: 'Public announcements only. Never LinkedIn or private sources.',
    humanCheck: 'An editor checks every draft against its sources before anything is published.',
  },
  {
    name: 'Listing Parser',
    what: 'Turns a pasted job description into a structured mandate.',
    receives: 'The job description an employer pastes or links.',
    humanCheck: 'The employer edits and confirms it; staff review every post before it goes live.',
  },
  {
    name: 'Mandate Builder',
    what: 'Interviews a CEO or board member to define what the CMO role really needs to achieve.',
    receives: "The employer's answers about the role.",
    humanCheck: 'The employer edits the result; staff review it for paid searches.',
  },
  {
    name: 'Profile Interviewer',
    what: 'Interviews a candidate to build a proof-of-outcomes profile and their ideal next role.',
    receives: "The candidate's answers and any résumé they upload.",
    humanCheck: 'The candidate approves every line before it is saved.',
  },
  {
    name: 'Matcher',
    what: 'Suggests which leaders fit a mandate and explains why, as a range rather than a score.',
    receives:
      'Outcomes, scope and preferences only. Names, photos, age, gender, pronouns, nationality and graduation years are removed first.',
    humanCheck:
      'A talent partner approves every match before an employer sees it. Identity is revealed only with the candidate’s consent.',
  },
  {
    name: 'Editorial Assistant',
    what: 'Suggests headlines, summaries and newsletter drafts.',
    receives: 'Draft articles and approved moves.',
    humanCheck: 'An editor rewrites and approves everything.',
  },
];
