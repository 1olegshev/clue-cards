# Documentation Index

Start here to understand the project documentation.

## Documentation Files

| File | Topics Covered |
|------|----------------|
| [`RULES.md`](RULES.md) | Game rules, clue validation, turn mechanics, pause/disconnect handling |
| [`STATE.md`](STATE.md) | Firebase data model, room lifecycle, turn flow, client-side state, sound system, architecture |

## Quick Architecture Overview

```
app/                    # Next.js App Router pages
├── layout.tsx          # Root layout with all providers
├── page.tsx            # Home page (create/join room)
└── room/[[...code]]/   # Room page with catch-all route
    └── RoomClient.tsx  # Main room orchestrator (thin)

components/             # React components
├── room/               # Room-specific components
│   ├── GameView.tsx    # Active game UI
│   ├── LobbyView.tsx   # Pre-game lobby UI
│   ├── ConnectionStatus.tsx  # Loading skeleton + error states
│   └── ...             # Status, teams, forms
├── ConnectionIndicator.tsx  # Offline/online status in Navbar
├── ErrorBoundary.tsx   # Error boundary for graceful failures
├── GameBoard.tsx       # 5x5 word grid
├── GameContext.tsx     # Room-level state for Navbar
└── ...

contexts/               # React context providers
├── AuthContext.tsx     # Firebase Auth
├── ErrorContext.tsx    # Error toast notifications
└── SoundContext.tsx    # Sound effects

hooks/                  # Custom React hooks
├── room/               # Room-specific hooks (connection, actions)
├── useRtdbRoom.ts      # Main room hook (composes room/* hooks)
├── useRoomDerivedState.ts  # Computed state (isMyTurn, canVote, etc.)
└── ...

lib/                    # Firebase/infrastructure
├── firebase.ts         # Firebase initialization
├── firebase-auth.ts    # Anonymous auth
├── rtdb-actions.ts     # All database operations (with transactions)
└── retry.ts            # Retry utility with exponential backoff

shared/                 # Pure logic (no React)
├── types.ts            # TypeScript types (client + Firebase)
├── game-utils.ts       # Game logic (vote threshold, etc.)
├── validation.ts       # Input sanitization utilities
├── words.ts            # Word lists and board generation
└── constants.ts        # Game config, localStorage keys, avatars
```

## When to Update

After implementing a feature, update the relevant doc:

| Change Type | Update |
|-------------|--------|
| Game rules or mechanics | `RULES.md` |
| Database schema or state changes | `STATE.md` (Data Model section) |
| New context provider or hook | `STATE.md` (Architecture section) |
| New client-side storage (localStorage) | `STATE.md` (Client-Side State section) |
| Sound system changes | `STATE.md` (Sound System section) |
| New documentation file | Add entry to this `INDEX.md` |
