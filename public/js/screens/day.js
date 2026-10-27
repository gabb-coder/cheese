// Day: discussion, the secret vote, and the results with "play again".

import { h } from '../dom.js';
import { countdown, nightNotes, holdCard, nameOf, listNames, dieFace } from '../components.js';

export function key(view) {
  const isHost = view.room.hostId === view.me.id;
  if (view.phase.name === 'VOTE') return `vote:${view.vote.myVote ?? ''}`;
  if (view.phase.name === 'RESULTS') return `results:${isHost}`;
  return `talk:${isHost}:${JSON.stringify([view.night, view.follower ?? null])}`;
}

let progress = null;

export function render(ctx) {
  const { name } = ctx.state.view.phase;
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

function discussion({ state, actions }) {
  const view = state.view;
  const isHost = view.room.hostId === view.me.id;
  progress = null;
  return h('section', { class: 'screen-inner' },
    h('h1', { class: 'hero' }, '☀️ Time to talk'),
    h('p', { class: 'hero muted' }, 'Take turns: what time did you wake up, and was the cheese there? Anyone may lie.'),
    nightNotes(view),
    h('div', { class: 'grow' }),
    countdown(view.phase.endsAt, 'Voting starts in'),
    isHost
      ? h('button', { class: 'btn-primary btn-block', onClick: () => actions.send({ t: 'endDiscussion' }) }, "Everyone's ready: vote now")
      : h('p', { class: 'muted small hero' }, 'The host can start the vote early.'),
    holdCard(view.me, { compact: true }),
  );
}

function vote({ state, actions }) {
  const view = state.view;
  const myVote = view.vote.myVote;
  progress = h('p', { class: 'muted hero' });
  update({ state });

  let body;
  if (myVote) {
    body = h('div', { class: 'card hero voted' },
      h('div', { class: 'role-art' }, '🗳️'),
      h('p', {}, 'You voted for ', h('strong', {}, nameOf(view, myVote)), '.'),
      h('p', { class: 'muted small' }, 'Votes are revealed when everyone has voted or time runs out.'));
  } else {
    // Tap a name, then confirm: a vote is final once sent.
    const confirmBtn = h('button', { class: 'btn-primary btn-block', disabled: true }, 'Pick someone');
    let picked = null;
    const buttons = view.players.filter((p) => p.id !== view.me.id).map((p) => {
      const btn = h('button', {
        class: 'btn-secondary vote-choice',
        'aria-pressed': 'false',
        onClick: () => {
          picked = p.id;
          for (const b of buttons) b.setAttribute('aria-pressed', String(b === btn));
          confirmBtn.disabled = false;
          confirmBtn.textContent = `Vote for ${p.name}`;
        },
      }, p.name);
      return btn;
    });
    confirmBtn.addEventListener('click', () => {
      if (picked) actions.send({ t: 'vote', playerId: picked });
    });
    body = [h('div', { class: 'picker' }, buttons), confirmBtn];
  }

  return h('section', { class: 'screen-inner' },
    h('h1', { class: 'hero' }, '🗳️ Who took the cheese?'),
    h('p', { class: 'hero muted' }, 'Vote for the player you think is the Cheese Thief. Nobody sees your vote until the end.'),
    body,
    progress,
    h('div', { class: 'grow' }),
    countdown(view.phase.endsAt, 'Voting ends in'),
    h('details', { class: 'card' }, h('summary', {}, 'Your night notes'), nightNotes(view)),
  );
}

function results({ state, actions }) {
  const view = state.view;
  const r = view.results;
  const isHost = view.room.hostId === view.me.id;
  const iWon = r.winners.includes(view.me.id);
  const thief = nameOf(view, r.thiefId);
  const follower = nameOf(view, r.followerId);
  progress = null;

  // Tally, most votes first, with who voted for whom (votes are public now, like pointing).
  const voters = {};
  for (const [voter, target] of Object.entries(r.votes)) (voters[target] ??= []).push(voter);
  const rows = view.players
    .map((p) => ({ p, count: r.counts[p.id] ?? 0 }))
    .sort((a, b) => b.count - a.count || a.p.name.localeCompare(b.p.name));
  const abstained = view.players.filter((p) => !(p.id in r.votes));

  return h('section', { class: 'screen-inner' },
    h('div', { class: 'hero' },
      h('div', { class: 'role-art' }, r.thiefCaught ? '🎉' : '🐭🧀'),
      h('h1', {}, r.thiefCaught ? 'The Thief was caught!' : 'The Thief got away!'),
      h('p', { class: 'muted' }, r.thiefCaught ? 'The Sleepyheads win.' : 'The Thief and the Follower win.'),
      h('p', { class: `outcome ${iWon ? 'win' : 'lose'}` }, iWon ? 'You win! 🧀' : 'You lose this time.'),
    ),
    h('div', { class: 'card' },
      h('div', { class: 'reveal-row' }, h('span', {}, '🐭 Cheese Thief'), h('strong', {}, thief)),
      h('div', { class: 'reveal-row' }, h('span', {}, '🤝 Follower'),
        h('strong', {}, follower, h('span', { class: 'muted small' }, r.followerPickedBy === 'random' ? ' (picked at random)' : ' (chosen by the Thief)'))),
    ),
    h('div', { class: 'card' },
      h('h3', {}, 'Votes'),
      h('ul', { class: 'tally' }, rows.map(({ p, count }) => h('li', { class: r.leaders.includes(p.id) ? 'leader' : '' },
        h('span', { class: 'grow' }, p.name, p.id === r.thiefId ? ' 🐭' : ''),
        h('span', { class: 'muted small' }, voters[p.id] ? `from ${listNames(view, voters[p.id])}` : ''),
        h('strong', { class: 'count' }, String(count))))),
      abstained.length ? h('p', { class: 'muted small' }, `Didn't vote: ${listNames(view, abstained.map((p) => p.id))}`) : null,
    ),
    h('div', { class: 'card' },
      h('h3', {}, 'Everyone\'s cards'),
      h('ul', { class: 'everyone' }, view.players.map((p) => h('li', {},
        dieFace(r.dice[p.id], 32),
        h('span', { class: 'grow' }, p.name),
        h('span', { class: 'small' }, p.id === r.thiefId ? 'Thief 🐭' : p.id === r.followerId ? 'Follower 🤝' : 'Sleepyhead 😴'),
        r.winners.includes(p.id) ? h('span', { class: 'badge you' }, 'won') : null))),
    ),
    isHost
      ? h('button', { class: 'btn-primary btn-block', onClick: () => actions.send({ t: 'playAgain' }) }, '🔁 Play again')
      : h('p', { class: 'muted hero' }, h('span', { class: 'dots' }, `Waiting for ${nameOf(view, view.room.hostId)} to start another round`)),
    h('button', { class: 'btn-ghost', onClick: () => actions.leave() }, 'Leave room'),
  );
}
