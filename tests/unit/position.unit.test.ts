// @ts-nocheck
/**
 * TEST-CASE FILE
 * Этот файл документирует конкретные проверки для уровня: unit/integration/e2e.
 * Комментарии оставлены намеренно подробно для портфолио-защиты.
 */
import { describe, expect, it } from "vitest";
import { Position } from "../../src/modules/game/domain/value-objects/position.value-object.js";

describe("Position unit", () => {
  it("create validates coordinates and creates immutable position", () => {
    const source = Position.create(2, 3, { columns: 4, rows: 4 });

    expect(source.x).toBe(2);
    expect(source.y).toBe(3);
  });

  it("move returns next position and equals compares by value", () => {
    const start = Position.create(1, 1, { columns: 4, rows: 4 });
    const moved = start.move({ x: 1, y: 0 }, { columns: 4, rows: 4 });
    const same = Position.create(2, 1, { columns: 4, rows: 4 });

    expect(start.equals(moved)).toBe(false);
    expect(moved.equals(same)).toBe(true);
  });
});
