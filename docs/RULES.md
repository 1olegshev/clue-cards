## Official Rules Summary

- Two teams (red and blue) with a spymaster and operatives.
- 25 words in a 5x5 grid; one assassin, 7 neutral, 8 for one team, 9 for the starting team.
- Spymaster gives a one-word clue plus a number.
- Clues cannot be any of the words currently on the board.
- Operatives guess up to the clue number plus one extra guess.
- Turn ends immediately on guessing the opposing team or a neutral card.
- Guessing the assassin ends the game immediately.
- A team wins by revealing all of its agents.

## Implementation Notes

This project aims to follow the official rules, with the following clarifications:

- A clue is required before operatives can guess.
- Remaining guesses are tracked as `count + 1`.
- A timer is enabled per turn (optional in the board game).
- Clue validation blocks:
  - Exact matches with board words (case-insensitive)
  - Prefix/suffix relationships (e.g., "farm" blocked if "farmer" on board, but "war" allowed even if "dwarf" on board)
  - Simple plural variants (adding/removing S/ES)
- Operatives vote on a card first; a teammate must confirm once votes meet a threshold.
- Room owner can start rematch after game ends, keeping all players.
- Teams are balanced: the game starts only with an even number of players (4+).
- Players choose a lobby team and role before start; owner can randomize assignments and override choices.
- Only the room owner can start the game.
- Room owner can end an active game, returning all players to the lobby.

## Pause and Disconnection Handling

The game pauses automatically at **turn transitions** if the incoming team lacks required players:
- The team's spymaster is disconnected (needed to give clue).
- The team has no connected operatives (needed to guess).
- The entire team is disconnected.

**When paused:**
- The turn timer stops.
- A banner displays the pause reason.
- Players can change their team/role assignments to fill vacant spots.
- The room owner sees a "Resume Game" button when conditions are met.

**Resuming:**
- The room owner clicks "Resume Game" once the paused team has at least one spymaster and one operative connected.
- The turn timer resets and the game continues.

**Player disconnection:**
- Leaving the room (navigation or tab close) marks the player as disconnected.
- The pause check only happens at turn boundaries, not in real-time.
- Players can rejoin by returning to the room with the same session.

If we introduce deviations or house rules, list them here explicitly.
