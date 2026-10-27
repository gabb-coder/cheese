// Day: discussion, the secret vote, and the results with "play again".

import { h, calm } from '../dom.js';
import { countdown, nightNotes, holdCard, nameOf, listNames, dieFace, avatar, art } from '../components.js';

export function key(view) {
  const isHost = view.room.hostId === view.me.id;
  if (view.phase.name === 'VOTE') return `vote:${view.vote.myVote ?? ''}`;
  if (view.phase.name === 'RESULTS') return `results:${isHost}`;
  return `talk:${isHost}:${JSON.stringify([view.night, view.follower ?? null])}`;
}

let progress = null;
let celebrated = false; // confetti once per results screen, not on every redraw

export function render(ctx) {
  const { name } = ctx.state.view.phase;
  if (name !== 'RESULTS') celebrated = false;
  if (name === 'VOTE') return vote(ctx);
  if (name === 'RESULTS') return results(ctx);
  return discussion(ctx);
}

export function update({ state }) {
  const view = state.view;
  if (progress && view.vote) {
    progress.textContent = `${view.vote.votedIds.length} of ${view.players.length} have voted`;
  }
}

// Cheese crumbs rain down on the winners' phones.
function cheeseConfetti() {
  const layer = h('div', { class: 'confetti', 'aria-hidden': 'true' });
  for (let i = 0; i < 40; i++) {
    const bit = h('i', { class: `b${i % 3}` });
    const vars = {
      '--x': `${Math.random() * 100}vw`,
      '--size': `${8 + Math.random() * 8}px`,
      '--drift': `${(Math.random() - 0.5) * 120}px`,
      '--spin': `${(Math.random() - 0.5) * 900}deg`,
      '--dur': `${2.4 + Math.random() * 1.8}s`,
      '--delay': `${Math.random() * 0.9}s`,
    };
    for (const [k, v] of Object.entries(vars)) bit.style.setProperty(k, v);
    layer.append(bit);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 5500);
}

// The vote bars grow one mouse at a time, most votes last, once the tally is on screen.
function countUp(list) {
  const rows = [...list.children];
  const show = (li, animate) => {
    const bar = li.querySelector('.bar > i');
    const out = li.querySelector('.count');
    const n = Number(out.dataset.n);
    bar.style.width = bar.dataset.w;
    li.classList.add('shown');
    if (!animate) {
      out.textContent = String(n);
      return;
    }
    for (let k = 1; k <= n; k++) setTimeout(() => { out.textContent = String(k); }, (k / n) * 650);
  };
  if (calm() || !('IntersectionObserver' in window)) {
    for (const li of rows) show(li, false);
    return;
  }
  const seen = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    seen.disconnect();
    rows.reverse().forEach((li, i) => setTimeout(() => show(li, true), 250 + i * 450));
  }, { threshold: 0.35 });
  seen.observe(list);
}

const playerOf = (view, id) => view.players.find((p) => p.id === id) ?? { id, name: 'someone' };

function discussion({ state, actions }) {
  const view = state.view;
  const isHost = view.room.hostId === view.me.id;
  progress = null;
  return h('section', { class: 'screen-inner' },
    h('div', { class: 'page-title' }, h('span', { class: 'eyebrow' }, 'Morning in the mouse house'), h('h1', {}, 'Who took the cheese?')),
    h('p', { class: 'center muted' }, 'Take turns: when did you wake up, and was the cheese there? Anyone may fib.'),
    nightNotes(view),
    h('div', { class: 'grow' }),
    countdown(view.phase.endsAt, 'Voting starts in'),
    isHost
      ? h('button', { class: 'btn-primary btn-block', onClick: () => actions.send({ t: 'endDiscussion' }) }, "Everyone's ready: vote now")
      : h('p', { class: 'muted small center' }, 'The host can start the vote early.'),
    holdCard(view.me, { compact: true }),
  );
}

function vote({ state, actions }) {
  const view = state.view;
  const myVote = view.vote.myVote;
  progress = h('p', { class: 'muted center' });
  update({ state });

  let body;
  if (myVote) {
    body = h('div', { class: 'card voted pop-in' },
      avatar(playerOf(view, myVote), 72),
      h('p', {}, 'You voted for ', h('strong', {}, nameOf(view, myVote)), '.'),
      h('p', { class: 'muted small' }, 'Votes are revealed when everyone has voted or time runs out.'));
  } else {
    // Tap a mouse, then confirm: a vote is final once sent.
    const confirmBtn = h('button', { class: 'btn-primary btn-block btn-big', disabled: true }, 'Pick a mouse');
    let picked = null;
    const buttons = view.players.filter((p) => p.id !== view.me.id).map((p) => {
      const btn = h('button', {
        class: 'vote-choice',
        'aria-pressed': 'false',
        onClick: () => {
          picked = p.id;
          for (const b of buttons) b.setAttribute('aria-pressed', String(b === btn));
          confirmBtn.disabled = false;
          confirmBtn.textContent = `Vote for ${p.name}`;
        },
      }, avatar(p, 52), h('span', { class: 'n' }, p.name, p.connected ? '' : ' 📵'));
      return btn;
    });
    confirmBtn.addEventListener('click', () => {
      if (picked) actions.send({ t: 'vote', playerId: picked });
    });
    const offline = view.players.some((p) => !p.connected);
    body = [h('div', { class: 'vote-grid' }, buttons), confirmBtn,
      offline ? h('p', { class: 'muted small center' }, '📵 = phone offline right now') : null];
  }

  return h('section', { class: 'screen-inner' },
    h('div', { class: 'page-title' }, h('span', { class: 'eyebrow' }, 'Secret vote'), h('h1', {}, 'Point at the Thief')),
    h('p', { class: 'center muted' }, 'Nobody sees your vote until everyone has voted.'),
    body,
    progress,
    h('div', { class: 'grow' }),
    countdown(view.phase.endsAt, 'Voting ends in'),
    h('details', { class: 'card' }, h('summary', {}, '📜  Your night notes'), nightNotes(view)),
  );
}

function results({ state, actions }) {
  const view = state.view;
  const r = view.results;
  const isHost = view.room.hostId === view.me.id;
  const iWon = r.winners.includes(view.me.id);
  const thief = playerOf(view, r.thiefId);
  const follower = playerOf(view, r.followerId);
  progress = null;

  // Tally, most votes first, with who voted for whom (votes are public now, like pointing).
  const voters = {};
  for (const [voter, target] of Object.entries(r.votes)) (voters[target] ??= []).push(voter);
  const most = Math.max(1, ...Object.values(r.counts));
  const rows = view.players
    .map((p) => ({ p, count: r.counts[p.id] ?? 0 }))
    .sort((a, b) => b.count - a.count || a.p.name.localeCompare(b.p.name));
  const abstained = view.players.filter((p) => !(p.id in r.votes));

  const tallyRow = ({ p, count }) => {
    const bar = h('i', { 'data-w': `${(count / most) * 100}%` });
    return h('li', { class: r.leaders.includes(p.id) ? 'leader' : '' },
      avatar(p, 34),
      h('div', { class: 'bar-wrap' },
        h('span', { class: 'n' }, p.name, p.id === r.thiefId ? '  🧀' : ''),
        h('div', { class: 'bar' }, bar),
        voters[p.id] ? h('span', { class: 'from' }, `from ${listNames(view, voters[p.id])}`) : null),
      h('span', { class: 'count', 'data-n': count }, '0'));
  };

  const tally = h('ul', { class: 'tally' }, rows.map(tallyRow));
  countUp(tally);
  if (iWon && !celebrated && !calm()) setTimeout(cheeseConfetti, 900);
  celebrated = true;

  const roleOf = (p) => (p.id === r.thiefId ? 'Thief' : p.id === r.followerId ? 'Follower' : 'Sleepyhead');

  return h('section', { class: 'screen-inner' },
    h('div', { class: 'card verdict' },
      h('span', { class: `stamp ${r.thiefCaught ? 'caught' : 'away'}` }, r.thiefCaught ? 'Caught!' : 'Got away!'),
      art('role-thief', 'pop-in'),
      h('h1', {}, r.thiefCaught ? `${thief.name} was the Thief!` : `${thief.name} got away with it!`),
      h('p', { class: 'muted' }, r.thiefCaught ? 'The Sleepyheads win.' : `The Thief and the Follower, ${follower.name}, win.`),
      h('span', { class: `ribbon ${iWon ? 'win' : 'lose'}` }, iWon ? '🎉  You win!' : 'You lose this time'),
    ),
    h('div', { class: 'card' },
      h('div', { class: 'reveal-row' }, avatar(thief, 44),
        h('div', { class: 'who' }, h('span', { class: 'label' }, 'CHEESE THIEF'), h('strong', {}, thief.name))),
      h('div', { class: 'reveal-row' }, avatar(follower, 44),
        h('div', { class: 'who' }, h('span', { class: 'label' }, 'FOLLOWER'), h('strong', {}, follower.name),
          h('span', { class: 'how' }, r.followerPickedBy === 'random' ? 'picked at random' : 'chosen by the Thief'))),
    ),
    h('div', { class: 'card' },
      h('h3', {}, 'The votes'),
      tally,
      abstained.length ? h('p', { class: 'muted small' }, `Didn't vote: ${listNames(view, abstained.map((p) => p.id))}`) : null,
    ),
    h('div', { class: 'card' },
      h('h3', {}, "Everyone's cards"),
      h('ul', { class: 'everyone' }, view.players.map((p) => h('li', { class: r.winners.includes(p.id) ? 'won' : '' },
        avatar(p, 36),
        h('div', { class: 'who' }, h('span', { class: 'n' }, p.name), h('span', { class: 'r' }, `${roleOf(p)}${r.winners.includes(p.id) ? ' · won' : ''}`)),
        dieFace(r.dice[p.id], 30)))),
    ),
    h('div', { class: 'actions' },
      isHost
        ? h('button', { class: 'btn-primary btn-block btn-big', onClick: () => actions.send({ t: 'playAgain' }) }, '🔁  Play again')
        : h('p', { class: 'muted center' }, h('span', { class: 'dots' }, `Waiting for ${nameOf(view, view.room.hostId)} to start another round`)),
      h('button', { class: 'btn-ghost', onClick: () => actions.leave() }, 'Leave room'),
    ),
  );
}
