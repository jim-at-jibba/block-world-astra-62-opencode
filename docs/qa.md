# Manual release checks

Run on current Chrome and Edge at 1920×1080, default settings, hardware acceleration enabled. Record browser, GPU, seed and benchmark output with any release results.

### Recorded Chromium benchmark

At 1920×1080, render distance 6, seed `0`, Apple M5 via ANGLE Metal: 50 boundary crossings, **59.88 median FPS**, **59.52 1st-percentile FPS**, 16.8 ms longest sampled frame, 83 ms to playable spawn, and 0.71 MiB retained JS heap growth. This measured the local machine; the specific four-core reference laptop and Edge still require independent verification.

- [ ] Create `benchmark-001`; check seed −2104347378 and unobstructed spawn.
- [ ] Walk across chunk seams; look for gaps, backward faces and inverted texture orientation. Revisit edited chunks after leaving render distance.
- [ ] Walk diagonally into a wall corner, jump under a ceiling, attempt an air jump, and touch the horizontal world limit.
- [ ] Place blocks against top, bottom and four side faces. Attempt placement through your body; verify no item consumed.
- [ ] Interrupt breaking by changing targets, releasing the button, stepping out of reach and opening a menu. Verify reset in each case.
- [ ] Split, transfer, merge and swap stacks, then close inventory with a stack held. Verify item totals, including a completely full inventory.
- [ ] Gather leaf drops and eat apples. Check full-hunger rejection. Fall, die and respawn; inventory and terrain should persist.
- [ ] Open inventory or pause while moving. Check that physics, mining and survival freeze. Lose pointer lock, hide the tab and try denying capture. Resume should recover with a click.
- [ ] Save and reload; compare coordinates, facing, hotbar selection and edited terrain. Make a second world with the same name.
- [ ] Resize the window and move it between displays of different pixel density. Check crosshair, camera aspect ratio and HUD.
- [ ] Toggle reduced flash, set both audio sliders to zero, and navigate all menus by keyboard. Block icons and atlas are generated locally and require no image downloads.
- [ ] Repeat create/load/delete cycles. Check that audio, render loops, geometry, and input handlers do not accumulate.
- [ ] Run `npm run benchmark` and compare output against the PRD thresholds; confirm hardware identity before treating it as a reference score.
