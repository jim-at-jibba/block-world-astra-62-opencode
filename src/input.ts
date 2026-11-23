import type { Input } from "./game";
export function capturePointer(
  canvas: HTMLCanvasElement,
  signal: AbortSignal,
): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  if (document.pointerLockElement === canvas) return Promise.resolve(true);
  return new Promise((resolve) => {
    const attempt = new AbortController();
    const finish = (): void => {
      clearTimeout(timeout);
      attempt.abort();
      resolve(!signal.aborted && document.pointerLockElement === canvas);
    };
    const timeout = window.setTimeout(finish, 2000),
      options = { signal: attempt.signal };
    document.addEventListener("pointerlockchange", finish, options);
    document.addEventListener("pointerlockerror", finish, options);
    signal.addEventListener("abort", finish, options);
    try {
      canvas.requestPointerLock()?.then(finish, finish);
    } catch {
      finish();
    }
  });
}
export class Controls {
  private keys = new Set<string>();
  private abort = new AbortController();
  breaking = false;
  constructor(
    canvas: HTMLCanvasElement,
    active: () => boolean,
    look: (x: number, y: number) => void,
    use: () => void,
    select: (delta: number) => void,
    cancel: () => void,
    lost: () => void,
  ) {
    const signal = this.abort.signal;
    document.addEventListener(
      "pointerlockchange",
      () => {
        if (document.pointerLockElement !== canvas && active()) lost();
      },
      { signal },
    );
    document.addEventListener(
      "mousemove",
      (e) => {
        if (active() && document.pointerLockElement === canvas)
          look(e.movementX, e.movementY);
      },
      { signal },
    );
    window.addEventListener(
      "keydown",
      (e) => {
        if (
          active() &&
          ["KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft", "Space"].includes(
            e.code,
          )
        ) {
          e.preventDefault();
          this.keys.add(e.code);
        }
      },
      { signal },
    );
    window.addEventListener("keyup", (e) => this.keys.delete(e.code), {
      signal,
    });
    canvas.addEventListener(
      "mousedown",
      (e) => {
        if (!active()) return;
        if (e.button === 0) this.breaking = true;
        if (e.button === 2) use();
      },
      { signal },
    );
    window.addEventListener(
      "mouseup",
      (e) => {
        if (e.button === 0) {
          this.breaking = false;
          cancel();
        }
      },
      { signal },
    );
    canvas.addEventListener(
      "contextmenu",
      (e) => {
        if (active()) e.preventDefault();
      },
      { signal },
    );
    canvas.addEventListener(
      "wheel",
      (e) => {
        if (active()) {
          e.preventDefault();
          select(Math.sign(e.deltaY));
        }
      },
      { signal, passive: false },
    );
  }
  sample(): Input {
    return {
      forward: Number(this.keys.has("KeyW")) - Number(this.keys.has("KeyS")),
      side: Number(this.keys.has("KeyD")) - Number(this.keys.has("KeyA")),
      sprint: this.keys.has("ShiftLeft"),
      jump: this.keys.has("Space"),
      breaking: this.breaking,
    };
  }
  clear(): void {
    this.keys.clear();
    this.breaking = false;
  }
  dispose(): void {
    this.abort.abort();
    this.clear();
  }
}
