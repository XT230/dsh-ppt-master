/**
 * The preset-mounted half of dsh-ppt-master.
 *
 * A preset's plugins land in that preset's scope, so everything registered here
 * is visible only to sessions that select the preset this package declares: the
 * `ppt-master` skill and the `ppt_master_env` tool. Configuration, the Configure
 * page, the interpreter probe and the session permission pin stay in the
 * profile-mounted half, which exposes them as the `pptMaster` service — a preset
 * row cannot be edited through the profile's settings form, so config must not
 * live here, and the preset-switch event that a pin has to observe is global.
 */
export const name = 'ppt-master-skill'
export const inject = ['skills', 'tools', 'pptMaster']

export function apply(ctx) {
  const runtime = ctx.pptMaster
  let control = null

  ctx.effect(() => runtime.onConfigChange(() => control?.invalidate()), 'ppt-master: catalog invalidation')
  ctx.effect(
    () =>
      ctx.skills.registerProvider((registrationControl) => {
        control = registrationControl
        return runtime.provider
      }),
    'ppt-master: preset skill provider',
  )

  ctx.effect(() => ctx.tools.register(runtime.tool), 'ppt-master: preset environment tool')

  // A session switched to this preset keeps its agent: the registry rebinds that
  // session's scope to this generation, so its next message arrives here. Pinning
  // on that claim closes the gap when the global selection event is not delivered
  // to the profile half. Idempotent — an already-matching session appends nothing.
  ctx.effect(
    () => ctx.on('agent/inbox/claimed', ({ agent }) => runtime.pinSession(agent?.session)),
    'ppt-master: pin on first message',
  )
}
