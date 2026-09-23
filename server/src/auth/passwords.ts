import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * Hashes a password with a fresh random salt.
 * Stored format is `scrypt$<salt-hex>$<key-hex>`, so the salt travels with the hash
 * and the scheme is identifiable if it ever needs to change.
 */
export const hashPassword = (password: string): string => {
    const salt = randomBytes(SALT_LENGTH);
    const key = scryptSync(password, salt, KEY_LENGTH);
    return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
};

/** Constant-time comparison. Returns false for malformed stored hashes rather than throwing. */
export const verifyPassword = (password: string, stored: string): boolean => {
    const parts = stored.split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;

    const salt = Buffer.from(parts[1], 'hex');
    const expected = Buffer.from(parts[2], 'hex');
    if (salt.length !== SALT_LENGTH || expected.length !== KEY_LENGTH) return false;

    const actual = scryptSync(password, salt, KEY_LENGTH);
    return timingSafeEqual(actual, expected);
};
