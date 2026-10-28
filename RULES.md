# Cheese Thief: Rules Reference (for the digital version)

Game by Dongxu Li, published by Jolly Thinkers. 4-8 players, about 10-15 minutes.
This is a paraphrased working summary, NOT the official rulebook. Every rule is tagged:

- [CONFIRMED]: agreed on by multiple independent descriptions of the game
- [INFERRED]: the logical consequence of confirmed rules, but not stated outright
- [UNKNOWN]: I could not verify this. DO NOT GUESS. Ask the project owner, who will
  check the official rulebook PDF (Jolly Thinkers / BoardGameGeek files).

---

## 1. Overview
- [CONFIRMED] Social deduction game. One player is the Cheese Thief; everyone else
  is a Sleepyhead.
- [CONFIRMED] No moderator is required (a moderator or the companion app only
  narrates the hours), and no player is ever eliminated.
- [CONFIRMED] Structure: one night phase, then a discussion, then one vote.
- [CONFIRMED] Each player's secret die roll decides the "hour" at which they wake up
  during the night, and this is the only genuine information they get.

## 2. Components (physical game, to be replaced by the app)
- Character cards: 1 Cheese Thief + (players - 1) Sleepyheads.
- One six-sided die and one dice cup per player.
- One cheese token in the middle of the table.

## 3. Setup
- [CONFIRMED] Deal each player one secret character card: one Thief, the rest
  Sleepyheads.
- [CONFIRMED] Each player rolls their die under their cup and secretly looks at it.
  The number (1-6) is the hour they wake in the night.
- [CONFIRMED] The cheese starts on the table, reachable by everyone.
- [INFERRED] Two or more players can roll the same hour. This matters a lot (see
  followers).

## 4. Night phase
- [CONFIRMED] Everyone closes their eyes. Hours are called in order, 1 through 6.
- [CONFIRMED] On a player's hour, they open their eyes and may take an action, then
  close their eyes again when the hour ends.
- [CONFIRMED] Available actions are: peek at another player's die, steal the cheese
  (Thief only), or do nothing.
- [CONFIRMED] The Thief steals the cheese on the Thief's own hour.
- [CONFIRMED] A Sleepyhead may peek under another player's cup ONLY IF they are the
  only player awake at that hour.
- [INFERRED] Whenever you are awake you can see the table, so you can see whether
  the cheese is still there, and (if others share your hour) that they are also
  awake. This is the evidence players report in the discussion.
- [UNKNOWN] Exactly what a Sleepyhead is allowed to see or do when several players
  share an hour but no Thief is among them. (Presumably: see that the cheese is
  there and who else is awake. Confirm.)
- [UNKNOWN] Whether the Thief gets any special action if awake alone.

## 5. Followers
- [CONFIRMED] If a Sleepyhead is awake at the same hour the Thief steals the
  cheese, that Sleepyhead becomes the Thief's Follower and wins if the Thief wins.
- [CONFIRMED] If several Sleepyheads are awake at the Thief's hour, the Thief
  chooses which ONE becomes the Follower.
- [CONFIRMED] With 6 or more players there are additional rules for choosing
  Followers that happen after hour 6.
- [UNKNOWN] The exact 6+ player follower rules (who chooses, who can be chosen,
  how many Followers, what each side learns). REQUIRED before building the
  night phase for 6-8 players.
- [UNKNOWN] Whether the Follower is told they are a Follower and whether the Thief
  learns who is awake alongside them.
- [UNKNOWN] Whether the Thief must have a Follower if no Sleepyhead shared the hour.
- A "Fall Guy" role is mentioned on community forums and a character-card selection
  appears in the moderator app. This may be an optional or expansion role.
  [UNKNOWN]. Ignore it for v1 unless the owner says otherwise.

## 6. Day phase: discussion
- [CONFIRMED] Players take turns reporting what time they woke up and whether the
  cheese was still there. Players may lie. The Thief wants to blend in.
- [CONFIRMED] No player ever has to reveal their die or card during discussion
  (the evidence is each player's own claims).
- [UNKNOWN] Whether the official rules set a discussion time limit. (Community
  forums say they do not. The digital version will use a configurable timer.)

## 7. Voting and winning
- [CONFIRMED] Everyone votes at the same time for the player they think is the
  Thief. In the physical game, they all point at once.
- [CONFIRMED] If the Cheese Thief receives the highest number of votes, the
  Sleepyheads win together, regardless of any other cards being revealed.
- [INFERRED] Followers are on the Thief's team, so if the Thief is caught the
  Thief and Follower(s) lose. Confirm whether a Follower counts as one of the
  winning "Sleepyheads" in that case (almost certainly not).
- [CONFIRMED] If the Thief is not the player with the most votes, the Thief and
  Follower(s) win together, even if a Follower got the most votes.
- [UNKNOWN] Tie rules (community forums ask about ties and the answer is not
  confirmed here). Questions to settle: does a tie that includes the Thief count as
  "highest votes"? What if the Thief and a Follower tie? Whether players may vote
  for themselves, and whether the Thief may vote for a Follower.

## 8. Digital adaptation: proposed decisions (owner to confirm)
These are choices for the app, not official rules.
- The server rolls dice and assigns roles; the physical cups and cards are replaced
  by private per-player screens.
- Hours 1-6 are narrated by the app in order, with a short timer per hour.
  Hours with no player awake still get called (so they can't be told apart by
  timing).
- A hold-to-reveal role/die screen prevents shoulder-surfing.
- Votes are secret until everyone has voted, then revealed together.
- Tie handling: DEFAULT to the rule in the official rulebook once confirmed. Until
  then, flag it clearly as a placeholder in code and tests.

## 9. Open questions to resolve against the official rulebook
1. Full follower rules for 6, 7 and 8 players (after hour 6).
2. What a player sees on waking when other players share their hour.
3. Tie-break rule(s) for votes.
4. Whether self-votes, or the Thief voting for a Follower, are allowed.
5. Whether the Follower knows they are one, and what the Thief learns about Followers.
6. Whether Fall Guy or other optional roles are part of the base game.
7. Whether there is an official discussion time limit.

## 10. Test scenarios the rules module must cover (once rules are confirmed)
- Thief awake alone: no Follower.
- Thief and exactly one Sleepyhead awake together: that Sleepyhead is the Follower.
- Thief and several Sleepyheads awake together: the Thief chooses one.
- A lone Sleepyhead may peek at one die; two or more awake together may not.
- Thief gets the most votes: Sleepyheads win.
- Follower gets the most votes: Thief and Follower win.
- Tie scenarios (after the owner decides).
- Same die value for all players, and for no player on some hours.
- Every player count from 4 to 8.

---

## 11. Owner decisions for this app (2026-10-27)
These settle the [UNKNOWN] items above for the digital version. PLAN.md §2 has the full
table; `game/rules.js` implements exactly this.
1. **Shared hour without the Thief:** the awake players see each other and the cheese:
   still on the table if it hasn't been stolen yet, gone if it has. Nobody can peek.
2. **Thief awake alone:** no extra action; the Thief only steals.
3. **Followers (all player counts, 4-8):** nobody becomes a Follower during the hours,
   not even a lone Sleepyhead who woke with the Thief. After hour 6 the Thief must choose
   exactly one Follower from **any** Sleepyhead (random if the Thief runs out of time).
   Then everyone opens their eyes for a 5-second **Follower check**: each phone says
   whether its player is the Follower, and the Follower's also says who the Thief is.
   Then everyone closes their eyes except the Thief and the Follower, who get a
   10-second silent meet-up to look at each other. Nobody else learns who the Follower
   is until the results.
4. Sleepyheads awake at the Thief's hour still see the Thief take the cheese.
5. **Ties:** if the Thief is tied for the most votes, the Thief is caught and the
   Sleepyheads (not the Follower) win. [INFERRED, confirm] If nobody votes at all, the
   Thief has received no votes, so is not caught.
6. **Votes:** no self-votes; anyone else, the Follower included, can be voted for.
7. **Fall Guy:** not in v1.
8. **Discussion:** host-configurable timer, 3 minutes by default, host can end it early.
