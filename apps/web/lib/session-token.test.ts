import { signSession, verifySession } from './session-token';

const secret = 'x'.repeat(48);

describe('session token', () => {
  it('round-trips a valid session', async () => {
    const t = await signSession(
      { uid: 'u1', roles: ['editor'], exp: Date.now() / 1000 + 60 },
      secret,
    );
    expect(await verifySession(t, secret)).toMatchObject({ uid: 'u1', roles: ['editor'] });
  });

  it('rejects a tampered payload', async () => {
    const t = await signSession(
      { uid: 'u1', roles: ['reader'], exp: Date.now() / 1000 + 60 },
      secret,
    );
    const [, sig] = t.split('.');
    const forged = btoa(JSON.stringify({ uid: 'u1', roles: ['admin'], exp: 9e9 })).replace(
      /=+$/,
      '',
    );
    expect(await verifySession(`${forged}.${sig}`, secret)).toBeNull();
  });

  it('rejects a wrong secret and an expired session', async () => {
    const t = await signSession(
      { uid: 'u1', roles: ['reader'], exp: Date.now() / 1000 + 60 },
      secret,
    );
    expect(await verifySession(t, 'y'.repeat(48))).toBeNull();
    const old = await signSession(
      { uid: 'u1', roles: ['reader'], exp: Date.now() / 1000 - 1 },
      secret,
    );
    expect(await verifySession(old, secret)).toBeNull();
  });
});
