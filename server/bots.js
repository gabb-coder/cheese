// Bot players for solo testing (PLAN.md §10).
//
// A bot decides from its own view only (the same data a phone would get), so bots
// can't accidentally cheat, and their intents go through the same rules as people's.
// Returns the intent to send, or null if the bot has nothing to do.

import { PHASE } from '../game/rules.js';

export const BOT_NAMES = ['Nibbles', 'Squeak', 'Whiskers', 'Pip', 'Crumb', 'Brie', 'Gouda', 'Mozzie', 'Feta', 'Colby'];

const pick = (list, rng) => list[Math.floor(rng() * list.length)];

export function botIntent(view, rng) {
  const me = view.me.id;
  const others = view.players.map((p) => p.id).filter((id) => id !== me);

  switch (view.phase.name) {
    case PHASE.ROLE_REVEAL:
      return view.reveal.doneIds.includes(me) ? null : { t: 'revealed' };
    case PHASE.HOUR: {
      const seen = view.night.seen;
      if (!view.night.awakeNow || !seen) return null;
      if (seen.canSteal) return { t: 'steal' };
      if (seen.canPeek) return { t: 'peek', playerId: pick(others, rng) };
      return null;
    }
    case PHASE.FOLLOWER_CHOICE: {
      const follower = view.follower;
      if (!follower?.options || follower.chosenId) return null;
      return { t: 'chooseFollower', playerId: pick(follower.options, rng) };
    }
    case PHASE.VOTE:
      return view.vote.myVote ? null : { t: 'vote', playerId: pick(others, rng) };
    default:
      return null;
  }
}
