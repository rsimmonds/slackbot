import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button';
import { MatchDossier, type MatchDossierProps } from './MatchDossier';

const base: MatchDossierProps = {
  mandate: {
    heading: 'CMO to rebuild a category after a pivot',
    facts: [
      { label: 'Stage', value: 'Series C' },
      { label: 'Team', value: '42' },
      { label: 'Reports to', value: 'CEO' },
      { label: 'Comp', value: '$380K–$450K' },
    ],
    points: [
      'Reposition from SMB to mid-market in 3 quarters',
      'Build a demand engine the board trusts',
      'Hire a head of product marketing',
    ],
  },
  profile: {
    heading: 'Growth-stage CMO, B2B infrastructure',
    facts: [
      { label: 'Years', value: '17' },
      { label: 'Largest team', value: '60' },
      { label: 'Stage range', value: 'B–IPO' },
      { label: 'Work type', value: 'Full-time' },
    ],
    points: [
      'Led a repositioning that lifted ACV 2.4x',
      'Took sourced pipeline from 18% to 46%',
      'Built PMM from zero to 9',
    ],
  },
  scoreLow: 64,
  scoreHigh: 79,
  rationale: [
    { reason: 'Has led a comparable upmarket repositioning, with metrics.', direction: 'for' },
    { reason: 'Built a demand engine at the same stage.', direction: 'for' },
    { reason: 'No direct experience reporting to a founder-CEO.', direction: 'against' },
  ],
  status: 'proposed',
};

const meta: Meta<typeof MatchDossier> = {
  title: 'Signature/Match Dossier',
  component: MatchDossier,
  args: base,
};
export default meta;
type Story = StoryObj<typeof MatchDossier>;

export const Proposed: Story = {
  args: {
    actions: (
      <>
        <Button variant="human">Approve match</Button>
        <Button variant="secondary">Edit rationale</Button>
        <Button variant="danger">Reject</Button>
      </>
    ),
  },
};
export const Approved: Story = {
  args: { status: 'approved', review: { reviewer: 'Talent partner (sample)', at: '2026-11-05' } },
};
