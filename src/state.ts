const transitions = {
  TITLE: ["WORLD_CREATE", "WORLD_LOAD", "LOADING", "SETTINGS", "CONTROLS"],
  WORLD_CREATE: ["LOADING"],
  WORLD_LOAD: ["LOADING"],
  LOADING: [
    "LOADING",
    "PLAYING",
    "DEAD",
    "PAUSED",
    "WORLD_CREATE",
    "WORLD_LOAD",
  ],
  PLAYING: ["INVENTORY", "PAUSED", "DEAD"],
  INVENTORY: ["PLAYING", "PAUSED"],
  PAUSED: ["PLAYING", "SETTINGS", "CONTROLS"],
  DEAD: ["PLAYING", "PAUSED"],
  SETTINGS: ["PAUSED"],
  CONTROLS: ["PAUSED"],
  FATAL_ERROR: ["LOADING"],
} as const;

export type State = keyof typeof transitions;

export class StateMachine {
  private current: State = "TITLE";
  private menuOrigin: "TITLE" | "PAUSED" = "TITLE";

  get state(): State {
    return this.current;
  }

  go(next: State): void {
    const allowed: readonly State[] = transitions[this.current];
    const leavesTitleMenuForGame =
      (this.current === "SETTINGS" || this.current === "CONTROLS") &&
      next === "PAUSED" &&
      this.menuOrigin !== "PAUSED";
    if (
      leavesTitleMenuForGame ||
      (next !== "TITLE" && next !== "FATAL_ERROR" && !allowed.includes(next))
    ) {
      throw new Error(`Cannot move from ${this.current} to ${next}`);
    }
    if (
      (next === "SETTINGS" || next === "CONTROLS") &&
      (this.current === "TITLE" || this.current === "PAUSED")
    ) {
      this.menuOrigin = this.current;
    }
    this.current = next;
  }
}
