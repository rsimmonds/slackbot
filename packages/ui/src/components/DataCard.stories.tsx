import type { Meta, StoryObj } from '@storybook/react-vite';
import { DataCard } from './DataCard';

const meta: Meta<typeof DataCard> = { title: 'Signature/Data Card', component: DataCard };
export default meta;
type Story = StoryObj<typeof DataCard>;

export const Tenure: Story = {
  args: {
    value: '4.1',
    unit: 'yrs',
    label: 'Median CMO tenure',
    series: [4.6, 4.5, 4.4, 4.4, 4.2, 4.1],
    footnote: 'Sample data',
  },
  render: (a) => (
    <div className="max-w-sm">
      <DataCard {...a} />
    </div>
  ),
};
export const Grid: Story = {
  render: () => (
    <div className="grid max-w-4xl grid-cols-3 gap-4">
      <DataCard value="4.1" unit="yrs" label="Median CMO tenure" series={[4.6, 4.4, 4.2, 4.1]} />
      <DataCard value="128" label="Moves this quarter" series={[90, 104, 111, 128]} />
      <DataCard value="$412K" label="Median CMO base, US" series={[380, 392, 401, 412]} />
    </div>
  ),
};
