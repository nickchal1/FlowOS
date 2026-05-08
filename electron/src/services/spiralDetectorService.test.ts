import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSpiralDetectorService } from "./spiralDetectorService.js";

vi.useFakeTimers();

const UNPRODUCTIVE = ["com.tinyspeck.slackmacgap", "com.spotify.client", "com.apple.iChat"];
const PRODUCTIVE   = ["com.microsoft.VSCode", "com.apple.Terminal"];

describe("createSpiralDetectorService", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let onSpiral: any;

  beforeEach(() => {
    vi.clearAllTimers();
    onSpiral = vi.fn();
  });

  it("does not fire on fewer than 3 unproductive switches", () => {
    const svc = createSpiralDetectorService({ onSpiralDetected: onSpiral });
    svc.recordSwitch(UNPRODUCTIVE[0]!, "communication");
    svc.recordSwitch(UNPRODUCTIVE[1]!, "media");
    expect(onSpiral).not.toHaveBeenCalled();
  });

  it("fires after 3 unproductive switches within window", () => {
    const svc = createSpiralDetectorService({ onSpiralDetected: onSpiral });
    for (const id of UNPRODUCTIVE) svc.recordSwitch(id, "communication");
    expect(onSpiral).toHaveBeenCalledOnce();
    expect(onSpiral.mock.calls[0][0].appSequence).toHaveLength(3);
  });

  it("does not fire for productive app switches", () => {
    const svc = createSpiralDetectorService({ onSpiralDetected: onSpiral });
    for (let i = 0; i < 5; i++) svc.recordSwitch(PRODUCTIVE[0]!, "ide");
    expect(onSpiral).not.toHaveBeenCalled();
  });

  it("does not fire twice for the same spiral episode (cooldown)", () => {
    const svc = createSpiralDetectorService({ onSpiralDetected: onSpiral });
    for (let i = 0; i < 6; i++) svc.recordSwitch(UNPRODUCTIVE[0]!, "communication");
    expect(onSpiral).toHaveBeenCalledOnce();
  });

  it("fires again after cooldown expires", () => {
    const svc = createSpiralDetectorService({ onSpiralDetected: onSpiral });
    for (const id of UNPRODUCTIVE) svc.recordSwitch(id, "communication");
    expect(onSpiral).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(15 * 60 * 1000 + 1);
    for (const id of UNPRODUCTIVE) svc.recordSwitch(id, "communication");
    expect(onSpiral).toHaveBeenCalledTimes(2);
  });

  it("respects the 10-minute sliding window — old switches expire", () => {
    const svc = createSpiralDetectorService({ onSpiralDetected: onSpiral });
    svc.recordSwitch(UNPRODUCTIVE[0]!, "communication");
    svc.recordSwitch(UNPRODUCTIVE[1]!, "media");
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    svc.recordSwitch(UNPRODUCTIVE[0]!, "communication");
    expect(onSpiral).not.toHaveBeenCalled();
  });

  it("does not fire when paused (active focus mode)", () => {
    const svc = createSpiralDetectorService({ onSpiralDetected: onSpiral });
    svc.setPaused(true);
    for (const id of UNPRODUCTIVE) svc.recordSwitch(id, "communication");
    expect(onSpiral).not.toHaveBeenCalled();
  });

  it("includes extra configurable unproductive bundleIds", () => {
    const svc = createSpiralDetectorService({
      onSpiralDetected: onSpiral,
      extraUnproductiveBundleIds: ["com.apple.Safari"],
    });
    for (let i = 0; i < 3; i++) svc.recordSwitch("com.apple.Safari", "browser");
    expect(onSpiral).toHaveBeenCalledOnce();
  });

  it("dispose stops all activity", () => {
    const svc = createSpiralDetectorService({ onSpiralDetected: onSpiral });
    svc.dispose();
    for (const id of UNPRODUCTIVE) svc.recordSwitch(id, "communication");
    expect(onSpiral).not.toHaveBeenCalled();
  });
});
