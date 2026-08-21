import type { Request, Response } from 'express';

import { requireSendAuth, SEND_TOKEN_HEADER, tokensMatch } from '../handlers/auth';
import { SECRET_ENV_VAR } from '../config/secret';
import { parseSecretFile } from '../config/secret';

const SECRET = 'a'.repeat(64);

function mockReq(headers: Record<string, string> = {}): Request {
  const lower = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  );
  return { get: (name: string) => lower[name.toLowerCase()] } as unknown as Request;
}

function mockRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

describe('tokensMatch', () => {
  it('accepts an exact match', () => {
    expect(tokensMatch(SECRET, SECRET)).toBe(true);
  });

  it('rejects a different token of the same length', () => {
    expect(tokensMatch('b'.repeat(64), SECRET)).toBe(false);
  });

  it('rejects tokens of differing length without throwing', () => {
    // crypto.timingSafeEqual throws on length mismatch if called naively.
    expect(tokensMatch('short', SECRET)).toBe(false);
    expect(tokensMatch('', SECRET)).toBe(false);
  });
});

describe('parseSecretFile', () => {
  it('takes the first non-comment, non-blank line', () => {
    expect(parseSecretFile(`# a comment\n\n  ${SECRET}  \n# trailing`)).toBe(SECRET);
  });

  it('returns null when the file is only comments', () => {
    expect(parseSecretFile('# nothing here\n\n')).toBeNull();
  });
});

describe('requireSendAuth', () => {
  const original = process.env[SECRET_ENV_VAR];

  beforeEach(() => {
    process.env[SECRET_ENV_VAR] = SECRET;
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (original === undefined) delete process.env[SECRET_ENV_VAR];
    else process.env[SECRET_ENV_VAR] = original;
  });

  it('calls next() when the token matches', () => {
    const next = jest.fn();
    requireSendAuth(mockReq({ [SEND_TOKEN_HEADER]: SECRET }), mockRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('is case-insensitive about the header name, as HTTP requires', () => {
    const next = jest.fn();
    requireSendAuth(mockReq({ 'X-SMS-Bridge-Token': SECRET }), mockRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('401s when the header is missing', () => {
    const res = mockRes();
    const next = jest.fn();
    requireSendAuth(mockReq(), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('401s when the token is wrong', () => {
    const res = mockRes();
    const next = jest.fn();
    requireSendAuth(mockReq({ [SEND_TOKEN_HEADER]: 'nope' }), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('fails closed with 503 when no secret is configured', () => {
    // The important case: an unconfigured deployment must be unavailable, not
    // silently unauthenticated.
    delete process.env[SECRET_ENV_VAR];
    jest.resetModules();
    const res = mockRes();
    const next = jest.fn();

    // Point the loader at a directory with no dotfile.
    jest.spyOn(require('fs'), 'readFileSync').mockImplementation(() => {
      throw new Error('ENOENT');
    });

    requireSendAuth(mockReq({ [SEND_TOKEN_HEADER]: SECRET }), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(503);
  });
});
