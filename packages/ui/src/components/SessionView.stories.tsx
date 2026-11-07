import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { SessionView } from './SessionView';

const questions = [
  ['What has to be true in twelve months', 'for this hire to have been the right one?'],
  ['Who will this person disagree with most often,', 'and who should win that argument?'],
  ['What is the board most worried about', 'that marketing could change?'],
];

function Demo() {
  const [i, setI] = useState(0);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <SessionView
      sessionId="MB-7Q2K"
      index={i + 4}
      total={15}
      question={questions[i % questions.length]!}
      irisState={busy ? 'thinking' : value ? 'listening' : 'idle'}
      value={value}
      onChange={setValue}
      busy={busy}
      systemNote={i === 0 ? 'Reading your mandate. 14 signals found.' : undefined}
      onSubmit={() => {
        setBusy(true);
        setTimeout(() => {
          setBusy(false);
          setValue('');
          setI((n) => n + 1);
        }, 1400);
      }}
      onExit={() => {}}
    />
  );
}

const meta: Meta<typeof SessionView> = {
  title: 'Signature/Session View',
  component: SessionView,
  parameters: { layout: 'fullscreen' },
};
export default meta;
export const Interview: StoryObj<typeof SessionView> = { render: () => <Demo /> };
