import type { Meta, StoryObj } from '@storybook/react-vite';
import { CommandPalette, type CommandItem } from './CommandPalette';

const items: CommandItem[] = [
  { id: 'jobs', label: 'Jobs', group: 'Navigate', hint: 'G J' },
  { id: 'moves', label: 'CMO Moves', group: 'Navigate', hint: 'G M' },
  { id: 'data', label: 'Data', group: 'Navigate' },
  { id: 'post', label: 'Post a job', group: 'Employer' },
  {
    id: 'mandate',
    label: 'Start a Mandate Builder session',
    group: 'Employer',
    keywords: ['interview', 'ai'],
  },
  { id: 'visibility', label: 'Profile visibility', group: 'Candidate' },
];

const meta: Meta<typeof CommandPalette> = {
  title: 'Signature/Command Palette',
  component: CommandPalette,
};
export default meta;
export const Open: StoryObj<typeof CommandPalette> = {
  args: { items, open: true, onSelect: () => {} },
  render: (a) => (
    <div>
      <p className="label-mono">Press ⌘K to toggle</p>
      <CommandPalette {...a} />
    </div>
  ),
};
