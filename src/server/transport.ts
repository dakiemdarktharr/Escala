import { createHash } from "node:crypto";

export interface ReplyTransport {
  readonly name: "simulated";
  send(input: { recipient: string; text: string; idempotencyKey: string }): Promise<{ providerMessageId: string; delivery: "simulated" }>;
}

/** No external I/O. The same idempotency key always yields the same receipt. */
export const simulatedTransport: ReplyTransport = {
  name: "simulated",
  async send({ recipient, text, idempotencyKey }) {
    if (process.env.ESCALA_SIMULATED_TRANSPORT_FAIL === "1") throw new Error("Simulated transport failure");
    return {
      providerMessageId: `sim-${createHash("sha256").update(JSON.stringify([recipient, text, idempotencyKey])).digest("hex").slice(0, 32)}`,
      delivery: "simulated",
    };
  },
};
