import { test } from "node:test";
import assert from "node:assert/strict";
import { scenarioClock, scenarioTariff, simulateDay, solarPower, SCENARIO_DEMAND } from "./operator-simulation";

test("supplied scenario tariffs retain all interval boundaries", () => {
  for (const [hour, rate] of [[0, 0.55], [16.9, 0.55], [17, 0.85], [17.9, 0.85], [18, 1.2], [20.9, 1.2], [21, 0.85], [21.9, 0.85], [22, 0.55], [23.9, 0.55]]) assert.equal(scenarioTariff(hour).rate, rate);
});
test("solar peaks at 30 kW at noon and is absent at night", () => {
  assert.equal(solarPower(12), 30);
  assert.equal(solarPower(6), 0);
  assert.equal(solarPower(18), 0);
});
test("smart mode shifts exactly 35% of peak demand and preserves daily energy", () => {
  const day = simulateDay(true);
  for (const hour of [18, 19, 20]) assert.equal(day[hour].load, SCENARIO_DEMAND[hour] * 0.65);
  assert.equal(day[22].load, 12 + (44 + 40 + 32) * 0.35 / 2);
  assert.equal(day[23].load, 5 + (44 + 40 + 32) * 0.35 / 2);
  assert.ok(Math.abs(day.reduce((sum, p) => sum + p.load, 0) - SCENARIO_DEMAND.reduce((a, b) => a + b, 0)) < 1e-9);
});
test("battery obeys 40 kWh capacity, 15 kW power and 4 kWh discharge reserve", () => {
  for (const point of simulateDay(true)) {
    assert.ok(point.stored >= 4 && point.stored <= 40);
    assert.ok(Math.abs(point.battery) <= 15);
    assert.ok(Math.abs(point.solar + point.battery + point.grid - point.load - Math.max(0, point.solar - point.load + Math.min(0, point.battery))) < 1e-9);
  }
});
test("playback clock correctly shows minutes without rounding to the next hour", () => {
  assert.equal(scenarioClock(12.9), "12:54");
  assert.equal(scenarioClock(23.9), "23:54");
});