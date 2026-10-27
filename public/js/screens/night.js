// Night: intro, hours 1-6, the Follower choice and meet-up, and dawn.
//
// Asleep screens are near-black and identical for everyone asleep. Awake screens show only
// what this player's view contains: who else is awake, the cheese, and their actions.

import { h, calm } from '../dom.js';
import { countdown, hourTrack, holdCard, dieFace, nameOf, listNames, art, avatar, sunrise } from '../components.js';
import { t, tx } from '../i18n.js';

export const key = (view) => JSON.stringify([view.phase.hour ?? null, view.night, view.follower ?? null]);

const playerOf = (view, id) => view.players.find((p) => p.id === id) ?? { id, name: t('someone') };

export function render({ state, actions }) {
  const view = state.view;
  const { name, hour } = view.phase;
  if (name === 'NIGHT_INTRO') return asleep(view, t('night.fallsTitle'), t('night.fallsText'));
  if (name === 'HOUR') {
    return view.night.awakeNow ? awake(view, actions) : asleep(view, t('night.hourTitle', { hour }), t('night.sleepTight'));
  }
  if (name === 'FOLLOWER_CHOICE') {
    return view.follower?.options ? chooseFollower(view, actions)
      : asleep(view, t('night.shh'), t('night.choosing'));
  }
  if (name === 'FOLLOWER_MEET') {
    if (view.follower?.isYou) return meetAsFollower(view);
    if (view.follower?.chosenId) return meetAsThief(view);
    return asleep(view, t('night.shh'), t('night.choosing'));
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
      h('p', {}, t(iAmThief ? 'night.youTook' : 'night.gone')));
  }
  if (iAmThief && !seen.cheeseOnTable) return h('div', { class: 'scene pop-in' }, art('role-thief'), h('p', {}, t('night.youTook')));
  return seen.cheeseOnTable
    ? h('div', { class: 'scene' }, plateWithCheese(false), h('p', {}, t('night.onTable')))
    : h('div', { class: 'scene' }, art('plate'), h('p', {}, t('night.gone')));
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
        h('p', {}, t('night.alsoAwake', { names: listNames(view, seen.companions) }))]
      : h('p', {}, t('night.nobody'))));
  parts.push(scene(view, seen, iAmThief));

  if (seen.canSteal) {
    parts.push(h('button', { class: 'btn-primary btn-block btn-big', onClick: () => actions.send({ t: 'steal' }) },
      t('night.take')));
    parts.push(h('p', { class: 'muted small center' }, t(seen.companions.length ? 'night.takeSeen' : 'night.takeAuto')));
  }

  if (seen.thiefId) {
    parts.push(h('div', { class: 'card alert pop-in' },
      h('div', { class: 'row' }, avatar(playerOf(view, seen.thiefId), 44),
        h('div', {}, h('strong', {}, t('night.saw', { name: nameOf(view, seen.thiefId) })),
          h('p', { class: 'small' }, t('night.isThief', { name: nameOf(view, seen.thiefId) }))))));
  }

  if (seen.canPeek) {
    const others = view.players.filter((p) => p.id !== view.me.id);
    const picker = h('div', { class: 'picker', hidden: true },
      others.map((p) => playerButton(view, p.id, () => actions.send({ t: 'peek', playerId: p.id }))));
    const openBtn = h('button', {
      class: 'btn-primary btn-block',
      onClick: () => { picker.hidden = false; openBtn.hidden = true; },
    }, t('night.peek'));
    parts.push(h('p', { class: 'center small muted' }, t('night.onlyOne')), openBtn, picker);
  }

  if (seen.peek) {
    parts.push(h('div', { class: 'card peek-result pop-in' },
      dieFace(seen.peek.die, 56),
      h('p', {}, tx('night.peekResult', { name: h('strong', {}, nameOf(view, seen.peek.playerId)), die: seen.peek.die }))));
  }

  return h('section', { class: 'screen-inner awake' },
    h('div', { class: 'awake-head' }, h('h1', {}, t('night.yourHour')), h('p', { class: 'muted' }, t('night.openQuietly'))),
    hourTrack(view.phase.hour),
    ...parts,
    h('div', { class: 'grow' }),
    countdown(view.phase.endsAt, t('night.closeIn')),
    holdCard(view.me, { compact: true }),
  );
}

function chooseFollower(view, actions) {
  const { options, chosenId } = view.follower;
  return h('section', { class: 'screen-inner awake' },
    h('div', { class: 'awake-head' }, h('h1', {}, t('night.chooseTitle'))),
    h('p', { class: 'center muted' }, t('night.chooseText')),
    chosenId
      ? h('div', { class: 'card hero pop-in' }, avatar(playerOf(view, chosenId), 64),
        h('strong', {}, t('night.youChose', { name: nameOf(view, chosenId) })), h('p', { class: 'small muted' }, t('night.seeSoon')))
      : h('div', { class: 'picker' }, options.map((id) => playerButton(view, id, () => actions.send({ t: 'chooseFollower', playerId: id })))),
    h('div', { class: 'grow' }),
    countdown(view.phase.endsAt, t(chosenId ? 'night.meetIn' : 'night.autoPick')),
  );
}

function meetAsThief(view) {
  const name = nameOf(view, view.follower.chosenId);
  return h('section', { class: 'screen-inner awake' },
    art('pair', 'pop-in'),
    h('div', { class: 'awake-head' }, h('h1', {}, t('night.isYourFollower', { name }))),
    h('p', { class: 'center muted' }, t('night.knowsYou', { name })),
    h('div', { class: 'grow' }),
    countdown(view.phase.endsAt, t('night.closeIn')),
  );
}

function meetAsFollower(view) {
  const thief = playerOf(view, view.follower.thiefId);
  return h('section', { class: 'screen-inner awake' },
    art('pair', 'pop-in'),
    h('div', { class: 'awake-head' }, h('h1', {}, t('night.youAreFollower'))),
    h('div', { class: 'card hero' }, h('p', { class: 'muted' }, t('night.thiefIs')), avatar(thief, 64), h('div', { class: 'big-name' }, thief.name)),
    h('p', { class: 'center muted' }, t('night.followerWin')),
    h('div', { class: 'grow' }),
    countdown(view.phase.endsAt, t('night.closeIn')),
  );
}

function dawn(view) {
  return h('section', { class: 'screen-inner' },
    sunrise('dawn-art'),
    h('h1', { class: 'title' }, t('night.morning')),
    h('p', {}, t('night.wakeUp')),
    countdown(view.phase.endsAt),
  );
}
