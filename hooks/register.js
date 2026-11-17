// ES-001: intentionally minimal, read-only Mod.
// No network calls, file access, model calls, or prompt/tool content collection.
let turns = 0;
let measurements = 0;

export function register(on) {
  on('turn.complete', async ($, event, next) => {
    turns += 1;
    $.ui.invalidate('ui.render');
    return next(event);
  });

  on('session.measure', async ($, event, next) => {
    measurements += 1;
    $.ui.invalidate('ui.render');
    return next(event);
  });

  // A non-invasive visual marker; native pane exploration follows in ES-001.
  on('ui.render', { component: 'Spinner' }, async ($, event, next) => {
    return next({
      ...event,
      props: {
        ...event.props,
        suffix: ` · Context Optimizer: ${turns} turns / ${measurements} measurements`,
      },
    });
  });
}
