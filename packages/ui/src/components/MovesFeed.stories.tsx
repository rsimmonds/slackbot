import type { Meta, StoryObj } from '@storybook/react-vite';
import { MovesFeed, type MoveItem } from './MovesFeed';

const moves: MoveItem[] = [
  {
    id: '1',
    at: '2026-11-07T14:02:00Z',
    type: 'appointed',
    person: 'Mara Ellison',
    title: 'Chief Marketing Officer',
    company: 'Halden Freight (sample)',
  },
  {
    id: '2',
    at: '2026-11-07T11:40:00Z',
    type: 'departed',
    person: 'Teo Ravelli',
    title: 'CMO',
    company: 'Lumen Grid (sample)',
  },
  {
    id: '3',
    at: '2026-11-06T16:15:00Z',
    type: 'promoted',
    person: 'Ines Okafor',
    title: 'Chief Growth Officer',
    company: 'Northwind Robotics (sample)',
  },
  {
    id: '4',
    at: '2026-11-06T09:05:00Z',
    type: 'appointed',
    person: 'Callum Reyes',
    title: 'Fractional CMO',
    company: 'Brightwell Health (sample)',
  },
];

const meta: Meta<typeof MovesFeed> = { title: 'Signature/Moves Feed', component: MovesFeed };
export default meta;
type Story = StoryObj<typeof MovesFeed>;
export const Live: Story = {
  args: { moves },
  render: (a) => (
    <div className="max-w-2xl">
      <MovesFeed {...a} />
    </div>
  ),
};
export const Empty: Story = { args: { moves: [] } };
