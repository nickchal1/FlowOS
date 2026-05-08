import { describe, it, expect, beforeEach } from "vitest";
import { ensureDatabase } from "@flowos/db";
import { recordAppActivation, getFrictionScore, getFrictionLeaderboard } from "./frictionStore.js";

let db: ReturnType<typeof ensureDatabase>;

beforeEach(() => { db = ensureDatabase(":memory:"); });

describe("recordAppActivation", () => {
  it("inserts a new row on first activation", () => {
    recordAppActivation(db, "com.spotify.client", 30);
    const row = db.prepare("SELECT * FROM app_behavior WHERE bundle_id = 'com.spotify.client'").get() as Record<string, unknown>;
    expect(row).toBeDefined();
    expect(row["total_activations"]).toBe(1);
    expect(row["low_focus_activations"]).toBe(1);
  });

  it("does not count high-focus activations as low-focus", () => {
    recordAppActivation(db, "com.microsoft.VSCode", 90);
    const row = db.prepare("SELECT * FROM app_behavior WHERE bundle_id = 'com.microsoft.VSCode'").get() as Record<string, unknown>;
    expect(row["low_focus_activations"]).toBe(0);
    expect(row["total_activations"]).toBe(1);
  });

  it("accumulates multiple activations", () => {
    recordAppActivation(db, "com.tinyspeck.slackmacgap", 25);
    recordAppActivation(db, "com.tinyspeck.slackmacgap", 20);
    recordAppActivation(db, "com.tinyspeck.slackmacgap", 80);
    const row = db.prepare("SELECT * FROM app_behavior WHERE bundle_id = 'com.tinyspeck.slackmacgap'").get() as Record<string, unknown>;
    expect(row["total_activations"]).toBe(3);
    expect(row["low_focus_activations"]).toBe(2);
  });

  it("updates last_focus_score on each call", () => {
    recordAppActivation(db, "com.apple.Safari", 40);
    recordAppActivation(db, "com.apple.Safari", 85);
    const row = db.prepare("SELECT last_focus_score FROM app_behavior WHERE bundle_id = 'com.apple.Safari'").get() as Record<string, unknown>;
    expect(row["last_focus_score"]).toBe(85);
  });
});

describe("getFrictionScore", () => {
  it("returns 0 for an unknown app", () => {
    expect(getFrictionScore(db, "com.unknown.app")).toBe(0);
  });

  it("returns 1.0 for always-distraction app", () => {
    for (let i = 0; i < 5; i++) recordAppActivation(db, "com.spotify.client", 20);
    expect(getFrictionScore(db, "com.spotify.client")).toBe(1);
  });

  it("returns 0 for always-productive app", () => {
    for (let i = 0; i < 5; i++) recordAppActivation(db, "com.microsoft.VSCode", 90);
    expect(getFrictionScore(db, "com.microsoft.VSCode")).toBe(0);
  });

  it("returns fractional score for mixed usage", () => {
    recordAppActivation(db, "com.apple.Safari", 30);
    recordAppActivation(db, "com.apple.Safari", 80);
    const score = getFrictionScore(db, "com.apple.Safari");
    expect(score).toBeCloseTo(0.5, 1);
  });
});

describe("getFrictionLeaderboard", () => {
  it("returns apps sorted by friction score descending", () => {
    for (let i = 0; i < 5; i++) recordAppActivation(db, "com.spotify.client", 20);
    for (let i = 0; i < 3; i++) recordAppActivation(db, "com.apple.Safari", 30);
    recordAppActivation(db, "com.apple.Safari", 80);
    for (let i = 0; i < 5; i++) recordAppActivation(db, "com.microsoft.VSCode", 90);
    const board = getFrictionLeaderboard(db, 10);
    expect(board.at(-1)?.bundleId).toBe("com.microsoft.VSCode");
  });

  it("requires minimum 3 activations to appear in leaderboard", () => {
    recordAppActivation(db, "com.rare.app", 20);
    const board = getFrictionLeaderboard(db, 10);
    expect(board.find((r) => r.bundleId === "com.rare.app")).toBeUndefined();
  });

  it("returns FrictionRow with all expected fields", () => {
    for (let i = 0; i < 4; i++) recordAppActivation(db, "com.hnc.Discord", 15);
    const board = getFrictionLeaderboard(db, 10);
    const discord = board.find((r) => r.bundleId === "com.hnc.Discord");
    expect(discord).toBeDefined();
    expect(discord?.frictionScore).toBe(1);
    expect(discord?.totalActivations).toBe(4);
    expect(discord?.lowFocusActivations).toBe(4);
    expect(discord?.lastSeen).toBeTruthy();
  });

  it("respects limit parameter", () => {
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 4; j++) recordAppActivation(db, `com.app.${i}`, 20);
    }
    const board = getFrictionLeaderboard(db, 3);
    expect(board).toHaveLength(3);
  });
});
