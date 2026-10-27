// Night: intro, hours 1-6, the Follower choice and meet-up, and dawn.
//
// Asleep screens are near-black and identical for everyone asleep. Awake screens show only
// what this player's view contains: who else is awake, the cheese, and their actions.

import { h, calm } from '../dom.js';
import { countdown, hourTrack, holdCard, dieFace, nameOf, listNames, art, avatar, sunrise } from '../components.js';

export const key = (view) => JSON.stringify([view.phase.hour ?? null, view.night, view.follower ?? null]);

const playerOf = (view, id) => view.players.find((p) => p.id === id) ?? { id, name: 'someone' };

export function render({ state, actions }) {
  const view = state.view;
  const { name, hour } = view.phase;
  if (name === 'NIGHT_INTRO') return asleep(view, 'Night falls…', 'Close your eyes. The night is about to begin.');
  if (name === 'HOUR') {
    return view.night.awakeNow ? awake(view, actions) : asleep(view, `${hour} o'clock`, 'Eyes closed… sleep tight.');
  }
  if (name === 'FOLLOWER_CHOICE') {
    return view.follower?.options ? chooseFollower(view, actions)
      : asleep(view, 'Shhh…', 'The Thief is choosing a Follower. Keep your eyes closed.');
  }
  if (name === 'FOLLOWER_MEET') {
    if (view.follower?.isYou) return meetAsFollower(view);
    if (view.follower?.chosenId) return meetAsThief(view);
    return asleep(view, 'Shhh…', 'The Thief is choosing a Follower. Keep your eyes closed.');
  }
  return dawn(view);
}

function asleep(view, title, subtitle) {
  return h('section', { class: 'screen-inner asleep' },
    h('div', { class: 'moon-wrap' }, art('moon', 'moon')),
    h('h2', {}, title),
    h('p', {}, subtitle),
    hourTrack(view.phase.hour),
    countdown(view.phase.endsAt),
  );
}

// What this phone showed last while awake, so the steal can be animated when it happens
// in front of this player (it is in their own view either way).
let lastSeen = null;

const CRUMBS = [[-60, 30], [-34, -36], [-8, 44], [26, -30], [52, 26], [70, -8]];

function plateWithCheese(snatched) {
  return h('div', { class: 'plate-stack' },
    art('plate'),
    art('cheese', 'on-plate'),
    snatched
      ? CRUMBS.map(([dx, dy]) => {
        const crumb = h('i', { class: 'crumb' });
        crumb.style.setProperty('--dx', `${dx}px`);
        crumb.style.setProperty('--dy', `${dy}px`);
        return crumb;
      })
      : null);
}

function scene(view, seen, iAmThief) {
  const hour = view.phase.hour;
  const snatched = lastSeen?.hour === hour && lastSeen.cheese && !seen.cheeseOnTable && !calm();
  lastSeen = { hour, cheese: seen.cheeseOnTable };
  if (snatched) {
    return h('div', { class: 'scene snatch' }, plateWithCheese(true),
      h('p', {}, iAmThief ? 'You took the cheese!' : 'The cheese is gone!'));
  }
  if (iAmThief && !seen.cheeseOnTable) return h('div', { class: 'scene pop-in' }, art('role-thief'), h('p', {}, 'You took the cheese!'));
  return seen.cheeseOnTable
    ? h('div', { class: 'scene' }, plateWithCheese(false), h('p', {}, 'The cheese is on the table.'))
    : h('div', { class: 'scene' }, art('plate'), h('p', {}, 'The cheese is gone!'));
}

function playerButton(view, id, onClick) {
  const p = playerOf(view, id);
  return h('button', { class: 'btn-secondary', onClick }, avatar(p, 38), h('span', { class: 'n' }, p.name));
}

function awake(view, actions) {
  const seen = view.night.seen;
  const iAmThief = view.me.role === 'thief';
  const parts = [];

  parts.push(h('div', { class: 'who-awake' },
    seen.companions.length
      ? [h('div', { class: 'avatars' }, seen.companions.map((id) => avatar(playerOf(view, id), 40))),
        h('p', {}, `Also awake: ${listNames(view, seen.companions)}`)]
      : h('p', {}, 'Nobody else is awake.')));
  parts.push(scene(view, seen, iAmThief));

  if (seen.canSteal) {
    parts.push(h('button', { class: 'btn-primary btn-block btn-big', onClick: () => actions.send({ t: 'steal' }) },
      '🧀  Take the cheese'));
    parts.push(h('p', { class: 'muted small center' }, seen.companions.length
      ? "The others awake will see you do it. If you wait, you'll grab it automatically."
      : "If you wait, you'll grab it automatically."));
  }

  if (seen.thiefId) {
    parts.push(h('div', { class: 'card alert pop-in' },
      h('div', { class: 'row' }, avatar(playerOf(view, seen.thiefId), 44),
        h('div', {}, h('strong', {}, `You saw ${nameOf(view, seen.thiefId)} take the cheese!`),
          h('p', { class: 'small' }, `${nameOf(view, seen.thiefId)} is the Cheese Thief.`)))));
  }

  if (seen.canPeek) {
    const others = view.players.filter((p) => p.id !== view.me.id);
    const picker = h('div', { class: 'picker', hidden: true },
      others.map((p) => playerButton(view, p.id, () => actions.send({ t: 'peek', playerId: p.id }))));
    const openBtn = h('button', {
      class: 'btn-primary btn-block',
      onClick: () => { picker.hidden = false; openBtn.hidden = true; },
    }, "🔍  Peek at someone's die");
    parts.push(h('p', { class: 'center small muted' }, "You're the only one awake, so you may peek at one die."), openBtn, picker);
  }

  if (seen.peek) {
    parts.push(h('div', { class: 'card peek-result pop-in' },
      dieFace(seen.peek.die, 56),
      h('p', {}, h('strong', {}, nameOf(view, seen.peek.playerId)), ` rolled a ${seen.peek.die}.`)));
  }

  return h('section', { class: 'screen-inner awake' },
    h('div', { class: 'awake-head' }, h('h1', {}, "It's your hour!"), h('p', { class: 'muted' }, 'Open your eyes, quietly.')),
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
    h('div', { class: 'awake-head' }, h('h1', {}, 'Choose your Follower')),
    h('p', { class: 'center muted' }, 'Your Follower wins with you if you are not caught. They will find out who you are.'),
    chosenId
      ? h('div', { class: 'card hero pop-in' }, avatar(playerOf(view, chosenId), 64),
        h('strong', {}, `You chose ${nameOf(view, chosenId)}.`), h('p', { class: 'small muted' }, 'They will see you in a moment.'))
      : h('div', { class: 'picker' }, options.map((id) => playerButton(view, id, () => actions.send({ t: 'chooseFollower', playerId: id })))),
    h('div', { class: 'grow' }),
    countdown(view.phase.endsAt, chosenId ? 'Meet-up in' : "If you don't choose, one is picked for you in"),
  );
}

function meetAsThief(view) {
  const name = nameOf(view, view.follower.chosenId);
  return h('section', { class: 'screen-inner awake' },
    art('pair', 'pop-in'),
    h('div', { class: 'awake-head' }, h('h1', {}, `${name} is your Follower`)),
    h('p', { class: 'center muted' }, `${name} now knows you are the Thief. Look at each other, quietly!`),
    h('div', { class: 'grow' }),
    countdown(view.phase.endsAt, 'Eyes close in'),
  );
}

function meetAsFollower(view) {
  const thief = playerOf(view, view.follower.thiefId);
  return h('section', { class: 'screen-inner awake' },
    art('pair', 'pop-in'),
    h('div', { class: 'awake-head' }, h('h1', {}, "You are the Thief's Follower!")),
    h('div', { class: 'card hero' }, h('p', { class: 'muted' }, 'The Cheese Thief is'), avatar(thief, 64), h('div', { class: 'big-name' }, thief.name)),
    h('p', { class: 'center muted' }, 'You win with the Thief if the Thief does not get the most votes. Keep it secret!'),
    h('div', { class: 'grow' }),
    countdown(view.phase.endsAt, 'Eyes close in'),
  );
}

function dawn(view) {
  return h('section', { class: 'screen-inner' },
    sunrise('dawn-art'),
    h('h1', { class: 'title' }, 'Good morning!'),
    h('p', {}, 'Everyone, open your eyes. The cheese is gone…'),
    countdown(view.phase.endsAt),
  );
}
