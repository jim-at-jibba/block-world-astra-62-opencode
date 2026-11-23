import type { Settings } from "./store";
export class AudioService {
  private ctx?: AudioContext;
  constructor(private settings: () => Settings) {}
  unlock(): void {
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === "suspended")
        void this.ctx.resume().catch(() => {});
    } catch {
      /* Audio is optional. */
    }
  }
  play(key: string): void {
    const ctx = this.ctx,
      s = this.settings();
    if (!ctx || ctx.state !== "running" || !s.master || !s.effects) return;
    const freq = /stone|bedrock|3/.test(key)
      ? 160
      : /wood|4/.test(key)
        ? 245
        : /leav|5/.test(key)
          ? 640
          : /damage|death/.test(key)
            ? 80
            : /eat|slot|inventory/.test(key)
              ? 460
              : /jump/.test(key)
                ? 340
                : 125;
    const osc = ctx.createOscillator(),
      gain = ctx.createGain(),
      t = ctx.currentTime;
    osc.type = /damage|death|stone/.test(key) ? "sawtooth" : "triangle";
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.43, t + 0.11);
    gain.gain.setValueAtTime((0.12 * s.master * s.effects) / 10000, t);
    gain.gain.exponentialRampToValueAtTime(0.00001, t + 0.14);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(t + 0.15);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
  dispose(): void {
    void this.ctx?.close().catch(() => {});
    this.ctx = undefined;
  }
}
