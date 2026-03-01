// @ts-nocheck
/**
 * TEST-CASE FILE
 * Этот файл документирует конкретные проверки для уровня: unit/integration/e2e.
 * Комментарии оставлены намеренно подробно для портфолио-защиты.
 */
import { describe, expect, it } from "vitest";
import { Position } from "../../domain/Position.js";

describe("Position unit", () => {
  it("clone returns independent instance with same coordinates", () => {
    const source = new Position(2, 3);
    const cloned = source.clone();

    expect(cloned).not.toBe(source);
    expect(cloned.equal(source)).toBe(true);
  });

  it("equal returns false for different coordinates", () => {
    const a = new Position(1, 1);
    const b = new Position(2, 1);

    expect(a.equal(b)).toBe(false);
  });
});


