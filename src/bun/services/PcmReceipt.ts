/** A receipt gap is advisory: native backends may omit PCM during silence. */
export const PCM_RECEIPT_POLICY = { gapAfterMs: 10_000, checkEveryMs: 1000 } as const;

export type PcmReceipt =
  | { status: "awaiting" | "receiving" | "gap"; lastReceiptAt: number }
  | { status: "ended" };

export function beginPcmReceipt(now: number): PcmReceipt {
  return { status: "awaiting", lastReceiptAt: now };
}

export function receivePcm(state: PcmReceipt, byteLength: number, now: number): PcmReceipt {
  if (state.status === "ended" || byteLength === 0) return state;
  return { status: "receiving", lastReceiptAt: now };
}

export function checkPcmReceipt(state: PcmReceipt, now: number): PcmReceipt {
  if (state.status === "ended" || state.status === "gap") return state;
  if (now - state.lastReceiptAt < PCM_RECEIPT_POLICY.gapAfterMs) return state;
  return { status: "gap", lastReceiptAt: state.lastReceiptAt };
}
