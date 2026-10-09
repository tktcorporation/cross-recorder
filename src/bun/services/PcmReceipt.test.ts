import { describe, expect, it } from "vitest";
import { beginPcmReceipt, checkPcmReceipt, receivePcm } from "./PcmReceipt.js";

describe("PCM receipt", () => {
  it("開始確認から10秒経つ境界だけで未受信をgapにする", () => {
    const state = beginPcmReceipt(100);
    expect(checkPcmReceipt(state, 10_099)).toBe(state);
    expect(checkPcmReceipt(state, 10_100).status).toBe("gap");
  });
  it("空の読み取りは受信時計を更新しない", () => {
    const state = beginPcmReceipt(100);
    expect(receivePcm(state, 0, 10_000)).toBe(state);
  });
  it("非空PCMはgapを回復して最後の受信から時計を測る", () => {
    const gap = checkPcmReceipt(beginPcmReceipt(100), 10_100);
    expect(checkPcmReceipt(gap, 20_100)).toBe(gap);
    const receiving = receivePcm(gap, 4, 20_100);
    expect(receiving.status).toBe("receiving");
    expect(checkPcmReceipt(receiving, 30_099)).toBe(receiving);
    expect(checkPcmReceipt(receiving, 30_100).status).toBe("gap");
  });
  it("終了状態は受信や時刻の進行で再開しない", () => {
    const ended = { status: "ended" } as const;
    expect(receivePcm(ended, 4, 100)).toBe(ended);
    expect(checkPcmReceipt(ended, 10_000)).toBe(ended);
  });
});
