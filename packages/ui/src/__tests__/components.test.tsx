import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConsentGate } from '../components/ConsentGate';
import { DataCard } from '../components/DataCard';
import { Iris } from '../components/Iris';
import { MatchDossier, type MatchDossierProps } from '../components/MatchDossier';
import { SignalLine } from '../components/SignalLine';

const dossier: MatchDossierProps = {
  mandate: {
    heading: 'CMO, Series C fintech',
    facts: [{ label: 'Team', value: '40' }],
    points: ['Rebuild brand'],
  },
  profile: {
    heading: 'Growth-stage CMO',
    facts: [{ label: 'Years', value: '18' }],
    points: ['Scaled pipeline 3x'],
  },
  scoreLow: 62,
  scoreHigh: 78,
  rationale: [{ reason: 'Has rebuilt a brand after a pivot', direction: 'for' }],
  status: 'proposed',
};

describe('MatchDossier', () => {
  it('shows no human seal while a match is only proposed', () => {
    render(<MatchDossier {...dossier} review={{ reviewer: 'A. Partner', at: '2026-11-01' }} />);
    expect(screen.queryByText('Human review')).not.toBeInTheDocument();
    expect(screen.getByText(/awaiting human review/i)).toBeInTheDocument();
  });

  it('shows the seal once a person approves', () => {
    render(
      <MatchDossier
        {...dossier}
        status="approved"
        review={{ reviewer: 'A. Partner', at: '2026-11-01' }}
      />,
    );
    expect(screen.getByText('Human review')).toBeInTheDocument();
    expect(screen.getByText(/A\. Partner/)).toBeInTheDocument();
  });

  it('presents fit as a range, never a single score', () => {
    render(<MatchDossier {...dossier} />);
    expect(
      screen.getByRole('img', { name: 'Estimated fit between 62 and 78 out of 100' }),
    ).toBeInTheDocument();
  });
});

describe('ConsentGate', () => {
  it('keeps confirm disabled until the person acknowledges, then confirms', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <ConsentGate
        open
        onOpenChange={() => {}}
        title="Reveal your identity to Northwind?"
        consequence="They will see your name and contact details."
        disclosures={[{ recipient: 'Northwind hiring team', fields: ['Full name', 'Email'] }]}
        onConfirm={onConfirm}
      />,
    );
    const confirm = screen.getByRole('button', { name: 'I consent' });
    expect(confirm).toBeDisabled();
    expect(screen.getByText('Northwind hiring team')).toBeInTheDocument();
    expect(screen.getByText('Full name')).toBeInTheDocument();

    await user.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole('checkbox'));
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});

describe('Iris', () => {
  it('describes its state accessibly', () => {
    render(<Iris state="thinking" />);
    expect(screen.getByRole('img', { name: 'Assistant thinking' })).toHaveAttribute(
      'data-state',
      'thinking',
    );
  });
});

describe('SignalLine', () => {
  it('reports determinate progress', () => {
    render(<SignalLine value={0.4} label="Matching" />);
    expect(screen.getByRole('progressbar', { name: 'Matching' })).toHaveAttribute(
      'aria-valuenow',
      '40',
    );
  });
});

describe('DataCard', () => {
  it('renders value and label', () => {
    render(<DataCard value="4.1" unit="yrs" label="Median CMO tenure" series={[4.4, 4.3, 4.1]} />);
    expect(screen.getByText('Median CMO tenure')).toBeInTheDocument();
    expect(screen.getByText('4.1')).toBeInTheDocument();
  });
});
