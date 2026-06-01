import { describe, it, expect } from 'vitest';
import { stripPageSecrets, stripPagesSecrets, stripConnectionSecrets } from './sanitize-page';

const SECRETS = ['accessToken', 'refreshToken', 'oauthToken', 'oauthTokenSecret'] as const;

const makePage = () => ({
  _id: '1',
  name: 'p',
  connections: [
    {
      platform: 'twitter',
      platformUsername: 'x',
      accessToken: 'AT',
      refreshToken: 'RT',
      oauthToken: 'OT',
      oauthTokenSecret: 'OTS',
      isActive: true,
    },
  ],
});

describe('sanitize-page', () => {
  it('strips every secret field from connections', () => {
    const out = stripPageSecrets(makePage());
    const firstConn = out.connections[0];
    expect(firstConn).toBeDefined();
    const conn = firstConn as Record<string, unknown>;
    for (const field of SECRETS) expect(field in conn).toBe(false);
    expect(conn.platformUsername).toBe('x');
  });

  it('does not mutate the input', () => {
    const page = makePage();
    stripPageSecrets(page);
    const [conn] = page.connections;
    expect(conn).toBeDefined();
    expect(conn!.accessToken).toBe('AT');
  });

  it('strips across a list of pages', () => {
    const out = stripPagesSecrets([makePage()]);
    const firstPage = out[0];
    expect(firstPage).toBeDefined();
    const firstConn = firstPage!.connections[0];
    expect(firstConn).toBeDefined();
    // firstConn is provably defined — asserted above
    expect('accessToken' in (firstConn! as object)).toBe(false);
  });

  it('passes through null and connection-less inputs', () => {
    expect(stripPageSecrets(null as unknown as { connections?: unknown })).toBeNull();
    expect(
      stripPageSecrets({ connections: undefined } as { connections?: unknown }).connections
    ).toBeUndefined();
  });

  it('stripConnectionSecrets removes secrets but keeps other fields', () => {
    const conn = stripConnectionSecrets({ accessToken: 'x', keep: 'y' } as Record<string, unknown>);
    expect('accessToken' in conn).toBe(false);
    expect((conn as Record<string, unknown>).keep).toBe('y');
  });
});
