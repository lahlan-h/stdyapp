import { randomInt } from "node:crypto";

/**
 * Study group join codes: six characters that are the whole key to a group.
 *
 * Pure apart from the random source, so it is tested directly
 * (test/joinCode.test.js). studyGroup.service.js generates with it and
 * normalises what people type with it; the database's unique index on
 * study_groups.joinCode is what makes a code name exactly one group.
 *
 * WHY THIS ALPHABET. A code is read off one screen and typed into another, often
 * across a desk. I and 1, O and 0 are the pairs people misread, so all four are
 * left out: 24 letters and 8 digits, 32 symbols, 32^6 - just over a billion
 * codes. Against POST /api/groups/join's rate limit that is no space to guess
 * in, which matters because a code alone now admits someone to a group.
 *
 * WHY crypto.randomInt. The old generator was Math.random, which is not built to
 * be unpredictable; a code that is a key should come from the CSPRNG.
 */
export const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const JOIN_CODE_LENGTH = 6;

/** A fresh code. Not checked for uniqueness - the caller retries on a collision. */
export const generateJoinCode = () => {
  let code = "";
  for (let i = 0; i < JOIN_CODE_LENGTH; i += 1) {
    code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)];
  }
  return code;
};

/**
 * What someone typed, as the code it means: upper case, with the spaces and
 * dashes people add when they read a code aloud or split it in two dropped.
 *
 * Upper-casing widens nothing a guesser can use: every stored code is upper
 * case, so "k3pq7x" can only ever match the one group "K3PQ7X" already names.
 *
 * @param {string} input
 * @returns {string}
 */
export const normalizeJoinCode = (input) => input.replace(/[\s-]+/g, "").toUpperCase();
