import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Button } from './Button';
import { Field, Input } from './Field';
import { Resolve } from './Resolve';
import { SignalLine } from './SignalLine';
import { Status } from './Status';
import { ThemeToggle, type ThemePreference } from './ThemeToggle';

const meta: Meta = { title: 'Foundations/Primitives' };
export default meta;

export const Buttons: StoryObj = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Button>Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="machine">Ask the assistant</Button>
      <Button variant="human">Approve</Button>
      <Button variant="danger">Delete</Button>
    </div>
  ),
};

export const Statuses: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-3">
      <Status tone="machine">Drafting</Status>
      <Status tone="human">Approved by editor</Status>
      <Status tone="good">Published</Status>
      <Status tone="critical">Failed · sent to human queue</Status>
      <Status>Archived</Status>
    </div>
  ),
};

export const Fields: StoryObj = {
  render: () => (
    <div className="max-w-sm">
      <Field label="Work email" hint="We send a sign-in link. No passwords.">
        {(id) => <Input id={id} placeholder="you@company.com" />}
      </Field>
    </div>
  ),
};

export const Signal: StoryObj = {
  render: () => (
    <div className="flex max-w-md flex-col gap-8">
      <SignalLine label="Loading" />
      <SignalLine value={0.42} label="Matching" />
    </div>
  ),
};

export const ResolveText: StoryObj = {
  render: () => (
    <Resolve
      className="max-w-xl text-h4 text-text"
      lines={['I matched 6 leaders.', 'A human will review them before anyone is contacted.']}
    />
  ),
};

export const Typography: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-4">
      <p className="font-serif text-display">The seat, redefined</p>
      <p className="font-serif text-h1">Who should fill it next</p>
      <p className="font-serif text-h2">Forty CMOs on the first 90 days</p>
      <p className="text-h3">Interface heading, 28</p>
      <p className="text-h4">Interface heading, 20</p>
      <p className="max-w-prose text-body text-text-2">
        Body copy at 16 on 1.6. Calm, precise, quietly self-aware. Numbers are tabular: 1,284 · 4.1
        · $412K.
      </p>
      <p className="text-small text-text-2">Small, 14</p>
      <p className="label-mono">System label · 11px · 0.12em</p>
    </div>
  ),
};

function ToggleDemo() {
  const [v, setV] = useState<ThemePreference>('auto');
  return <ThemeToggle value={v} onChange={setV} />;
}
export const Theme: StoryObj = { render: () => <ToggleDemo /> };
