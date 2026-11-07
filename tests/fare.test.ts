import { describe, it, expect } from "vitest";
import { calculateFare } from "../src/lib/fare";
import { fare, options } from "./fixtures";

describe("fare model", () => {
  it("charges no fare or call fee for no movement", () =>
    expect(calculateFare(0, fare, { margin: 10, callFee: true }).total).toBe(
      0,
    ));
  it("applies base fare through 1,350m and steps above the boundary", () => {
    expect(calculateFare(1, fare, options).total).toBe(4000);
    expect(calculateFare(1350, fare, options).total).toBe(4000);
    expect(calculateFare(1350.001, fare, options).total).toBe(4100);
    expect(calculateFare(1435, fare, options).total).toBe(4100);
    expect(calculateFare(1435.001, fare, options).total).toBe(4200);
  });
  it("uses combined step units without applying the composite surcharge twice", () => {
    expect(calculateFare(4000, fare, options).total).toBe(7200);
    expect(calculateFare(4080, fare, options).total).toBe(7300);
    expect(calculateFare(4800, fare, options).total).toBe(8200);
  });
  it("applies call fee and budget reserve per ride with 100-won rounding", () => {
    expect(calculateFare(1000, fare, { margin: 10, callFee: true })).toEqual({
      base: 4000,
      distance: 0,
      call: 1000,
      reserve: 500,
      total: 5500,
    });
    expect(calculateFare(1400, fare, { margin: 5, callFee: false }).total).toBe(
      4400,
    );
    expect(
      [500, 500, 500].reduce(
        (n, d) => n + calculateFare(d, fare, options).total,
        0,
      ),
    ).toBe(12000);
  });
  it("rejects invalid distance and margins", () => {
    for (const distance of [-1, Infinity, NaN])
      expect(() => calculateFare(distance, fare, options)).toThrow();
    expect(() =>
      calculateFare(100, fare, { margin: -1, callFee: false }),
    ).toThrow();
  });
});
