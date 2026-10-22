import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  generateJoinCode,
  normalizeJoinCode,
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH,
} from "../src/services/joinCode.js";

/**
 * A join code is the whole key to a group, typed by a person: it has to be the
 * right length, from characters nobody misreads, and forgiving of how people
 * actually type a code someone read out to them.
 */
describe("generateJoinCode", () => {
  it("is six characters, all from the unambiguous alphabet", () => {
    for (let i = 0; i < 500; i += 1) {
      const code = generateJoinCode();
      assert.equal(code.length, JOIN_CODE_LENGTH);
      for (const char of code) {
        assert.ok(JOIN_CODE_ALPHABET.includes(char), `${char} is not in the alphabet`);
      }
    }
  });

  it("never uses the characters people misread", () => {
    for (const char of ["I", "1", "O", "0"]) {
      assert.equal(JOIN_CODE_ALPHABET.includes(char), false, `${char} should be left out`);
    }
    assert.equal(new Set(JOIN_CODE_ALPHABET).size, 32, "32 distinct symbols");
  });

  it("does not repeat itself", () => {
    const seen = new Set(Array.from({ length: 2000 }, generateJoinCode));
    // 2000 draws from a billion: a collision here means the generator is broken.
    assert.equal(seen.size, 2000);
  });
});

describe("normalizeJoinCode", () => {
  it("upper-cases what was typed", () => {
    assert.equal(normalizeJoinCode("k3pq7x"), "K3PQ7X");
  });

  it("drops the spaces and dashes of a code read aloud or split in two", () => {
    assert.equal(normalizeJoinCode(" K3P-Q7X "), "K3PQ7X");
    assert.equal(normalizeJoinCode("k3p q7x"), "K3PQ7X");
  });

  it("leaves everything else alone, so a bad code still fails validation", () => {
    assert.equal(normalizeJoinCode("K3P!7X"), "K3P!7X");
  });
});
