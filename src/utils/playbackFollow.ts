/** Translate a rendered beat and its system into scroll offsets centered in the viewport. */
export function centeredPlaybackPosition(input: {
  scrollLeft: number;
  scrollTop: number;
  originLeft: number;
  originTop: number;
  viewLeft: number;
  viewTop: number;
  beatX: number;
  systemY: number;
  systemHeight: number;
  width: number;
  height: number;
}) {
  return {
    left:
      input.scrollLeft +
      input.originLeft -
      input.viewLeft +
      input.beatX -
      input.width / 2,
    top:
      input.scrollTop +
      input.originTop -
      input.viewTop +
      input.systemY +
      input.systemHeight / 2 -
      input.height / 2,
  };
}

/** Critically damped camera movement, preserving velocity when the target changes. */
export function advancePlaybackScroll(
  position: number,
  velocity: number,
  target: number,
  elapsed: number,
) {
  const dt = Math.min(Math.max(elapsed, 0), 32) / 1000;
  const omega = 7;
  const offset = position - target;
  const decay = Math.exp(-omega * dt);
  const impulse = velocity + omega * offset;
  const next = target + (offset + impulse * dt) * decay;
  const nextVelocity = (velocity - omega * impulse * dt) * decay;
  return { position: next, velocity: nextVelocity };
}
