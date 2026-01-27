## Game Rules Summary

- Two teams (red and blue) with a clue giver and guessers.
- 25 words in a 5x5 grid; one trap, 7 neutral, 8 for one team, 9 for the starting team.
- Clue giver gives a one-word clue plus a number.
- Clues cannot be any of the words currently on the board.
- Guessers guess up to the clue number plus one extra guess.
- Turn ends immediately on guessing the opposing team or a neutral card.
- Guessing the trap ends the game immediately (instant loss).
- A team wins by revealing all of its cards.

## Implementation Notes

This project follows standard word-guessing game rules, with the following clarifications:

- A clue is required before guessers can guess.
- Remaining guesses are tracked as `count + 1`.
- A timer is enabled per turn (optional in board games).
- Clue validation blocks:
  - Exact matches with board words (case-insensitive)
  - Prefix/suffix relationships (e.g., "farm" blocked if "farmer" on board, but "war" allowed even if "dwarf" on board)
  - Simple plural variants (adding/removing S/ES)
- Guessers vote on a card first; a teammate must confirm once votes meet a threshold.
- Room owner can start rematch after game ends. Players can reassign roles before rematch, or owner can randomize teams.
- Minimum 4 players on teams required to start. Teams don't need to be equal size.
- Players choose a lobby team and role before start; owner can randomize assignments and override choices.
- Players can remain as spectators (not on a team) when the game starts.
- Room owner can add spectators to teams as guessers during an ongoing game.
- Only the room owner can start the game.
- Room owner can end an active game, returning all players to the lobby.

## Pause and Disconnection Handling

The game pauses automatically at **turn transitions** if the incoming team lacks required players:
- The team's clue giver is disconnected (needed to give clue).
- The team has no connected guessers (needed to guess).
- The entire team is disconnected.

**When paused:**
- The turn timer stops.
- A banner displays the pause reason.
- Players can change their team/role assignments to fill vacant spots.
- The room owner sees a "Resume Game" button when conditions are met.

**Resuming:**
- The room owner clicks "Resume Game" once the paused team has at least one clue giver and one guesser connected.
- The turn timer resets and the game continues.

**Player disconnection:**
- Leaving the room (navigation or tab close) marks the player as disconnected.
- The pause check only happens at turn boundaries, not in real-time.
- Players can rejoin by returning to the room with the same session.

If we introduce deviations or house rules, list them here explicitly.
