// @ts-nocheck
/**
 * TEST-CASE FILE
 * Этот файл документирует конкретные проверки для уровня: unit/integration/e2e.
 * Комментарии оставлены намеренно подробно для портфолио-защиты.
 */
import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "../../observer/EventEmitter.js";

describe("EventEmitter unit", () => {
  it("emit calls subscriber with payload", () => {
    const emitter = new EventEmitter();
    const callback = vi.fn();

    emitter.on("change", callback);
    emitter.emit("change", { status: "ok" });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ status: "ok" });
  });

  it("unsubscribe function removes callback", () => {
    const emitter = new EventEmitter();
    const callback = vi.fn();

    const unsubscribe = emitter.subscribe("evt", callback);
    unsubscribe();
    emitter.emit("evt", { a: 1 });

    expect(callback).not.toHaveBeenCalled();
  });
});


