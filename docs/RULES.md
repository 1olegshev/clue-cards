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

## Disconnection Handling

- If a player disconnects during an active game, the game may pause depending on their role:
  - If the current team's spymaster disconnects before giving a clue, the game pauses.
  - If all of the current team's operatives disconnect after a clue is given, the game pauses.
  - If an entire team disconnects, the game pauses.
- The timer stops while the game is paused.
- When the missing player reconnects, the game resumes and the turn timer resets.
- Players have 30 seconds to reconnect before a paused game is abandoned.
- When leaving an active game, players see a confirmation dialog warning them of disconnection.
- If they are the last player, the warning indicates the game will end for everyone.

If we introduce deviations or house rules, list them here explicitly.
