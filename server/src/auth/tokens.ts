import jwt from 'jsonwebtoken';

const TOKEN_TTL = '30d';

export interface TokenPayload {
    uid: string;
    username: string;
}

/**
 * Reads the signing secret. Throws when JWT_SECRET is unset so a misconfigured
 * server rejects everything loudly instead of signing with a guessable key.
 */
const getSecret = (): string => {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET is not set');
    return secret;
};

export const signAuthToken = (payload: TokenPayload): string =>
    jwt.sign(payload, getSecret(), { expiresIn: TOKEN_TTL });

export const verifyAuthToken = (token: string): TokenPayload =>
    jwt.verify(token, getSecret()) as TokenPayload;

/** True when the failure was a missing secret rather than a bad token, so callers can report 500 vs 403. */
export const isMissingSecret = (error: unknown): boolean =>
    error instanceof Error && error.message === 'JWT_SECRET is not set';
