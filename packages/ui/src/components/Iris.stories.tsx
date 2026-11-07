import type { Meta, StoryObj } from '@storybook/react-vite';
import { Iris } from './Iris';

const meta: Meta<typeof Iris> = {
  title: 'Signature/Iris',
  component: Iris,
  args: { size: 120, level: 0.6 },
  argTypes: {
    state: { control: 'inline-radio', options: ['idle', 'listening', 'thinking', 'speaking'] },
  },
};
export default meta;
type Story = StoryObj<typeof Iris>;

export const Idle: Story = { args: { state: 'idle' } };
export const Listening: Story = { args: { state: 'listening' } };
export const Thinking: Story = { args: { state: 'thinking' } };
export const Speaking: Story = { args: { state: 'speaking', level: 0.9 } };
export const AllStates: Story = {
  render: () => (
    <div className="flex gap-12">
      {(['idle', 'listening', 'thinking', 'speaking'] as const).map((s) => (
        <div key={s} className="flex flex-col items-center gap-3">
          <Iris state={s} size={96} />
          <span className="label-mono">{s}</span>
        </div>
      ))}
    </div>
  ),
};
