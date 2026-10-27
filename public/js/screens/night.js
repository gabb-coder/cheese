// Night: intro, hours 1-6, the Follower choice and meet-up, and dawn.
//
// Asleep screens are near-black and identical for everyone asleep. Awake screens show only
// what this player's view contains: who else is awake, the cheese, and their actions.

import { h } from '../dom.js';
import { countdown, hourTrack, holdCard, dieFace, nameOf, listNames } from '../components.js';

export const key = (view) => JSON.stringify([view.phase.hour ?? null, view.night, view.follower ?? null]);

export function render({ state, actions }) {
  const view = state.view;
  const { name, hour } = view.phase;
  if (name === 'NIGHT_INTRO') return asleep(view, 'Night falls…', 'Close your eyes. The night is about to begin.');
  if (name === 'HOUR') {
    return view.night.awakeNow ? awake(view, actions) : asleep(view, `It's ${hour} o'clock`, 'Keep your eyes closed.');
  }
  if (name === 'FOLLOWER_CHOICE') {
    return view.follower?.options ? chooseFollower(view, actions)
      : asleep(view, 'The Thief is choosing…', 'Keep your eyes closed.');
  }
  if (name === 'FOLLOWER_MEET') {
    if (view.follower?.isYou) return meetAsFollower(view);
    if (view.follower?.chosenId) return meetAsThief(view);
    return asleep(view, 'The Thief is choosing…', 'Keep your eyes closed.');
  }
  return dawn(view);
}

function asleep(view, title, subtitle) {
  return h('section', { class: 'screen-inner asleep' },
    h('div', { class: 'moon', 'aria-hidden': 'true' }, '🌙'),
    h('h2', { class: 'hero' }, title),
    h('p', { class: 'hero dim' }, '😴 ', subtitle),
    hourTrack(view.phase.hour),
    countdown(view.phase.endsAt),
  );
}

function cheeseLine(seen, iAmThief) {
  if (iAmThief && !seen.cheeseOnTable) return h('div', { class: 'cheese' }, h('span', { class: 'big' }, '🐭🧀'), h('p', {}, 'You took the cheese!'));
  return seen.cheeseOnTable
    ? h('div', { class: 'cheese' }, h('span', { class: 'big' }, '🧀'), h('p', {}, 'The cheese is on the table.'))
    : h('div', { class: 'cheese' }, h('span', { class: 'big' }, '🍽️'), h('p', {}, 'The cheese is gone!'));
}

function awake(view, actions) {
  const seen = view.night.seen;
  const iAmThief = view.me.role === 'thief';
  const others = view.players.filter((p) => p.id !== view.me.id);
  const parts = [];

  parts.push(h('p', { class: 'hero' }, seen.companions.length
    ? `Also awake: ${listNames(view, seen.companions)}`
    : 'Nobody else is awake.'));
  parts.push(cheeseLine(seen, iAmThief));

  if (seen.canSteal) {
    parts.push(h('button', { class: 'btn-primary btn-block btn-big', onClick: () => actions.send({ t: 'steal' }) },
      'Take the cheese 🧀'));
    parts.push(h('p', { class: 'muted small hero' }, seen.companions.length
      ? "The others awake will see you do it. If you wait, you'll grab it automatically."
      : "If you wait, you'll grab it automatically."));
  }

  if (seen.thiefId) {
    parts.push(h('div', { class: 'card alert' },
      h('strong', {}, `👀 You saw ${nameOf(view, seen.thiefId)} take the cheese!`),
      h('p', { class: 'small' }, `${nameOf(view, seen.thiefId)} is the Cheese Thief.`)));
  }

  if (seen.canPeek) {
    const picker = h('div', { class: 'picker', hidden: true },
      others.map((p) => h('button', { class: 'btn-secondary', onClick: () => actions.send({ t: 'peek', playerId: p.id }) }, p.name)));
    const openBtn = h('button', {
      class: 'btn-primary btn-block',
      onClick: () => { picker.hidden = false; openBtn.hidden = true; },
    }, "🎲 Peek at someone's die");
    parts.push(h('p', { class: 'hero small muted' }, "You're the only one awake, so you may peek at one die."), openBtn, picker);
  }

  if (seen.peek) {
    parts.push(h('div', { class: 'card peek-result' },
      dieFace(seen.peek.die, 64),
      h('p', {}, h('strong', {}, nameOf(view, seen.peek.playerId)), ` rolled a ${seen.peek.die}.`)));
  }

  return h('section', { class: 'screen-inner awake' },
    h('h1', { class: 'hero' }, "👀 It's your hour!"),
    hourTrack(view.phase.hour),
    ...parts,
    h('div', { class: 'grow' }),
    countdown(view.phase.endsAt, 'Eyes close in'),
    holdCard(view.me, { compact: true }),
  );
}

function chooseFollower(view, actions) {
  const { options, chosenId } = view.follower;
  return h('section', { class: 'screen-inner awake' },
    h('h1', { class: 'hero' }, '🐭 Choose your Follower'),
    h('p', { class: 'hero muted' }, 'Your Follower wins with you if you are not caught. They will find out who you are.'),
    chosenId
      ? h('div', { class: 'card hero' }, h('strong', {}, `You chose ${nameOf(view, chosenId)}.`),
        h('p', { class: 'small muted' }, 'They will see you in a moment.'))
      : h('div', { class: 'picker' }, options.map((id) =>
        h('button', { class: 'btn-secondary', onClick: () => actions.send({ t: 'chooseFollower', playerId: id }) }, nameOf(view, id)))),
    h('div', { class: 'grow' }),
    countdown(view.phase.endsAt, chosenId ? 'Meet-up in' : "If you don't choose, one is picked for you in"),
  );
}

function meetAsThief(view) {
  const name = nameOf(view, view.follower.chosenId);
  return h('section', { class: 'screen-inner awake' },
    h('div', { class: 'role-art hero' }, '🤝'),
    h('h1', { class: 'hero' }, `${name} is your Follower`),
    h('p', { class: 'hero muted' }, `${name} now knows you are the Thief. Look at each other, quietly!`),
    h('div', { class: 'grow' }),
    countdown(view.phase.endsAt, 'Eyes close in'),
  );
}

function meetAsFollower(view) {
  const name = nameOf(view, view.follower.thiefId);
  return h('section', { class: 'screen-inner awake' },
    h('div', { class: 'role-art hero' }, '🤝'),
    h('h1', { class: 'hero' }, "You are the Thief's Follower!"),
    h('div', { class: 'card hero' }, h('p', {}, 'The Cheese Thief is'), h('div', { class: 'big-name' }, name)),
    h('p', { class: 'hero muted' }, 'You win with the Thief if the Thief does not get the most votes. Keep it secret!'),
    h('div', { class: 'grow' }),
    countdown(view.phase.endsAt, 'Eyes close in'),
  );
}

function dawn(view) {
  return h('section', { class: 'screen-inner' },
    h('div', { class: 'moon', 'aria-hidden': 'true' }, '☀️'),
    h('h1', { class: 'hero' }, 'Good morning!'),
    h('p', { class: 'hero muted' }, 'Everyone, open your eyes. The cheese is gone…'),
    countdown(view.phase.endsAt),
  );
}
