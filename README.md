# WINZO CONQUER — Prototype 0.1

A standalone, free-play multiplayer card-game prototype. It does not include deposits, wagers, cash prizes, or payouts.

## Current prototype features
- Separate client and Node.js WebSocket server
- Create private room and join with a six-character room code
- Five-player room limit
- Two standard 52-card decks plus one printed joker per deck (106 cards total)
- Deal 13 cards to each player
- Server-controlled draw/discard turns
- Private hands: each player receives only their own cards
- Green felt table interface, responsive for mobile

## Run locally
1. Install Node.js 18 or newer.
2. Open a terminal in `server/`.
3. Run `npm install`.
4. Run `npm start`.
5. Open `http://localhost:3000` in five separate browser sessions/devices.
6. Create a room in one session and join using its room code in the others.
7. The host can start once all five seats are occupied.

## Deploy to Render.com

This project includes a `render.yaml` Blueprint configuration.

1. Push the complete project folder to a GitHub repository. Keep `render.yaml` at the repository root.
2. In Render, choose **New + → Blueprint** and connect that repository.
3. Render reads `render.yaml`, installs dependencies from `server/package.json`, and starts the Node.js WebSocket server.
4. Wait for deployment, then open the generated `https://<your-service>.onrender.com` address.
5. Share the room code or invitation link with the other players.

The server serves the client and WebSocket endpoint from the same origin. The browser automatically uses secure WebSockets (`wss://`) on the Render HTTPS address. Render's assigned `PORT` is supported automatically.

For manual setup instead of Blueprint:
- **Root Directory:** leave blank (repository root)
- **Build Command:** `cd server && npm install`
- **Start Command:** `cd server && npm start`
- **Health Check Path:** `/health`

Use a Render web service that supports persistent WebSocket connections. The prototype currently stores rooms and game state in server memory, so rooms are lost when the service restarts or redeploys. A free instance may also spin down when idle, causing a delay on the next visit.

## Important prototype limitations
This is the first networking and table prototype, not a finished rules implementation. It does not yet implement the Ethiopian Conquer 41-point opening validation, meld/joker validation, reconnect recovery, persistent accounts, or production-grade room cleanup. The current round-end check is only a basic empty-hand placeholder. Confirm the exact local declaration and joker rules before enabling winner validation.

## Deployment
Deploy the project root to Render using the included `render.yaml`, or use the manual settings above.
