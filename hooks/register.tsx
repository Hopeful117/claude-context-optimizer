import type { Register } from 'claude-code';

let turns = 0;
let measurements = 0;

export const register: Register = (on) => {
  on('session.start', async ($, event, next) => {
    $.ui.status(`Context Optimizer: ${turns} turns / ${measurements} measurements`);
    return next(event);
  });

  on('turn.complete', async ($, event, next) => {
    turns += 1;
    $.ui.status(`Context Optimizer: ${turns} turns / ${measurements} measurements`);
    return next(event);
  });

  on('session.measure', async ($, event, next) => {
    measurements += 1;
    $.ui.status(`Context Optimizer: ${turns} turns / ${measurements} measurements`);
    return next(event);
  });
};
