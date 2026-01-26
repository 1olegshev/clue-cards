# Clue Cards

A multiplayer word guessing party game built with Next.js, TypeScript, and WebSockets.

> **Disclaimer**: This is an independent fan project inspired by word-based party games. It is not affiliated with, endorsed by, or connected to any commercial board game publisher. This project was created for educational and personal use.

## Features

- Anonymous player names (no authentication required)
- Room-based multiplayer with room codes
- Real-time game synchronization via WebSocket
- Clue Giver and Guesser roles with different views
- Turn-based gameplay with timer
- Chat and clue logging
- 5x5 word grid with team colors

## How It Works

Two teams compete to find all their words on a 5x5 grid. Each team has a **Clue Giver** who can see which words belong to which team, and **Guessers** who can only see the words.

- The Clue Giver gives a one-word clue and a number indicating how many words relate to that clue
- Guessers discuss and vote on which words to reveal
- First team to find all their words wins - but watch out for the instant-loss card!

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

1. Install dependencies:
```bash
npm install
```

2. Copy environment variables:
```bash
cp .env.example .env.local
```

### Running the Application

You need to run two processes:

1. **Start the WebSocket server** (in one terminal):
```bash
npm run server
```

2. **Start the Next.js dev server** (in another terminal):
```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser

### How to Play

1. Enter your name on the home page
2. Create a new room or join an existing one with a room code
3. Wait for at least 4 players to join
4. Click "Start Game" to begin
5. Players are assigned to Red and Blue teams with Clue Giver and Guesser roles
6. Clue Givers can see all card colors and give clues
7. Guessers vote on cards to reveal during their team's turn
8. First team to reveal all their cards wins (but avoid the instant-loss card!)

## Project Structure

- `app/` - Next.js App Router pages and layouts
- `components/` - React components (GameBoard, ChatLog)
- `server/` - WebSocket server for real-time game state
- `shared/` - Shared TypeScript types and utilities
- `docs/` - Architecture, protocol, rules, and environment notes

## Testing

### Unit Tests (Server)
```bash
npm run test          # Watch mode
npm run test:run      # Single run (~200ms)
npm run test:coverage # With coverage report
```

Server-side code has **178 tests** covering game logic, room management, and message handlers. Tests run automatically on commit via Husky when server/shared files are changed.

### E2E Tests (Playwright)
```bash
npm run test:e2e         # Run E2E tests (headless)
npm run test:e2e:headed  # Run with visible browser (watch tests run)
npm run test:e2e:ui      # Run with Playwright debug UI
```

E2E tests cover the full game flow with 4 players - room creation, team selection, game start, clue giving, and card reveals.

### Build Verification
```bash
npm run typecheck     # TypeScript check only (~2s)
npm run test:build    # Full typecheck + build
```

TypeScript check runs automatically on commit when frontend files are changed.

See `docs/ARCHITECTURE.md` for detailed test documentation.

## Development Notes

- The WebSocket server runs on port 8080
- Game state is managed server-side and synced to all clients
- No persistent storage - rooms are in-memory only
- Optimized for local development

## Environment Configuration

- `NEXT_PUBLIC_WS_URL` - override the WebSocket URL used by the client
- `WS_PORT` or `PORT` - port used by the WebSocket server
- See `.env.example` for Firebase and emulator variables

## License

This project is for educational and personal use only.
