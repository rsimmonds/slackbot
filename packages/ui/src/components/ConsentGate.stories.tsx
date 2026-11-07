import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Button } from './Button';
import { ConsentGate } from './ConsentGate';

function Demo() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Button variant="human" onClick={() => setOpen(true)}>
        Reveal identity
      </Button>
      <ConsentGate
        open={open}
        onOpenChange={setOpen}
        title="Reveal your identity to Halden Freight?"
        consequence="The hiring team will see who you are and can contact you directly. Nothing else in your profile changes."
        disclosures={[
          {
            recipient: 'Halden Freight hiring team (3 people)',
            fields: ['Full name', 'Email', 'Current title', 'Current company'],
          },
          { recipient: 'Your talent partner', fields: ['Your decision', 'Timestamp'] },
        ]}
        onConfirm={() => new Promise((r) => setTimeout(r, 600))}
      />
    </>
  );
}

const meta: Meta<typeof ConsentGate> = { title: 'Signature/Consent Gate', component: ConsentGate };
export default meta;
export const Reveal: StoryObj<typeof ConsentGate> = { render: () => <Demo /> };
