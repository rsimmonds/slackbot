import { emailConfig } from './config';
import { unsubscribeHeaders } from './send';
import { newsletterConfirmEmail, newsletterWelcomeEmail } from './templates/newsletter';

const env = {
  SITE_URL: 'https://cmobeat.test/',
  COMPANY_POSTAL_ADDRESS: '1 Sample Street, Halifax, NS',
};

describe('email config', () => {
  it('defaults to the outbox and refuses Resend without a key', () => {
    expect(emailConfig({}).provider).toBe('outbox');
    expect(emailConfig(env).siteUrl).toBe('https://cmobeat.test');
    expect(() => emailConfig({ EMAIL_PROVIDER: 'resend' })).toThrow(/RESEND_API_KEY/);
  });
});

describe('newsletter templates', () => {
  beforeAll(() => Object.assign(process.env, env));

  it('renders the confirmation email with html, text, the link and a compliant footer', async () => {
    const token = 'a'.repeat(64);
    const mail = await newsletterConfirmEmail('reader@example.com', token);
    expect(mail.template).toBe('newsletter-confirm');
    expect(mail.subject).toMatch(/Confirm/);
    expect(mail.html).toContain(`https://cmobeat.test/newsletter/confirm?token=${token}`);
    expect(mail.text).toContain(`/newsletter/confirm?token=${token}`);
    expect(mail.text).toContain('1 Sample Street, Halifax, NS');
    expect(mail.text).toMatch(/If it wasn.t you/);
    expect(mail.unsubscribeUrl).toBeUndefined();
  });

  it('renders the welcome email with preference and one-click unsubscribe links', async () => {
    const token = 'b'.repeat(64);
    const mail = await newsletterWelcomeEmail('reader@example.com', token);
    expect(mail.html).toContain(`/newsletter/preferences?token=${token}`);
    expect(mail.html).toContain(`/newsletter/unsubscribe?token=${token}`);
    expect(mail.unsubscribeUrl).toBe(
      `https://cmobeat.test/api/newsletter/unsubscribe?token=${token}`,
    );
  });
});

describe('unsubscribe headers', () => {
  it('follows RFC 8058', () => {
    expect(unsubscribeHeaders('https://x.test/u?t=1')).toEqual({
      'List-Unsubscribe': '<https://x.test/u?t=1>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
    expect(unsubscribeHeaders()).toBeUndefined();
  });
});
