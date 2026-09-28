/**
 * The sign-up screen's rules, in one place so the checklist and the Register
 * button can never disagree about what "valid" means.
 *
 * The limits mirror apps/api/src/validation/user.validation.js. They are
 * restated here rather than imported because the mobile app cannot depend on
 * the API package, and the API stays the authority - anything these let
 * through that it still rejects comes back as a 400 with the field named.
 */

/** usernameSchema's cap. */
export const MAX_USERNAME_LENGTH = 30;

/** nameSchema's cap, for first and last name alike. */
export const MAX_NAME_LENGTH = 50;

/**
 * bcrypt's 72-BYTE limit, which the API enforces. As a TextInput maxLength it
 * counts characters, so it is exact for ASCII and withinPasswordLimit covers
 * the rest.
 */
export const MAX_PASSWORD_LENGTH = 72;

const MIN_PASSWORD_LENGTH = 8;

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,30}$/;

/**
 * Something before the "@", and after it a name with a dot and a two-letter-or-
 * longer ending: x@uts.edu.au passes, x@uts and x@ do not.
 */
const DOMAIN_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[A-Za-z]{2,}$/;

/** Anything that is not a letter, a digit or whitespace. */
const SPECIAL_PATTERN = /[^A-Za-z0-9\s]/;

export type RegistrationCheckKey =
  | "at"
  | "domain"
  | "length"
  | "number"
  | "special"
  | "match";

export type RegistrationResults = Record<RegistrationCheckKey, boolean>;

export interface RegistrationCheck {
  key: RegistrationCheckKey;
  label: string;
}

/** Display order, grouped as the panel shows them. */
export const REGISTRATION_CHECK_GROUPS: {
  label: string;
  checks: RegistrationCheck[];
}[] = [
  {
    label: "Email",
    checks: [
      { key: "at", label: "Contains an @" },
      { key: "domain", label: "Has a domain, like example.com" },
    ],
  },
  {
    label: "Password",
    checks: [
      { key: "length", label: `At least ${MIN_PASSWORD_LENGTH} characters` },
      { key: "number", label: "At least 1 number" },
      { key: "special", label: "At least 1 special character, like ! # ? or @" },
      { key: "match", label: "Both passwords match" },
    ],
  },
];

export const REGISTRATION_CHECK_COUNT = REGISTRATION_CHECK_GROUPS.reduce(
  (total, group) => total + group.checks.length,
  0,
);

/**
 * Which of the six checks pass. The email is trimmed first, as the API does;
 * the password is not, because a space in a password is part of it.
 */
export const evaluateRegistration = (
  email: string,
  password: string,
  repeat: string,
): RegistrationResults => {
  const trimmed = email.trim();
  return {
    at: trimmed.includes("@"),
    domain: DOMAIN_PATTERN.test(trimmed),
    length: password.length >= MIN_PASSWORD_LENGTH,
    number: /[0-9]/.test(password),
    special: SPECIAL_PATTERN.test(password),
    match: repeat.length > 0 && repeat === password,
  };
};

export const countPassed = (results: RegistrationResults): number =>
  Object.values(results).filter(Boolean).length;

/** usernameSchema: 3-30 letters, digits or underscores, after a trim. */
export const isValidUsername = (username: string): boolean =>
  USERNAME_PATTERN.test(username.trim());

/** The API's bcrypt guard, in bytes rather than characters. */
export const withinPasswordLimit = (password: string): boolean => {
  try {
    return new TextEncoder().encode(password).length <= MAX_PASSWORD_LENGTH;
  } catch {
    return password.length <= MAX_PASSWORD_LENGTH;
  }
};
