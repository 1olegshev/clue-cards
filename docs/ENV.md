## Environment Variables

Client:

- `NEXT_PUBLIC_WS_URL`: full WebSocket URL, e.g. `ws://localhost:8080`.
  If not set, the client builds a URL from the current hostname and
  `DEFAULT_WS_PORT`.
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST` (optional)
- `NEXT_PUBLIC_FIREBASE_FIRESTORE_EMULATOR_HOST` (optional)

Server:

- `WS_PORT`: WebSocket server port.
- `PORT`: fallback port if `WS_PORT` is not set.
