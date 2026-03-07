# G-Link — Send Gold as Easily as Sending a Link

G-Link is a platform that makes sending gold as easy as sending a link. It's like TipLink for gold, combined with wedding blessing registries. Users can create personalized gold links for gifting, or set up wedding registries where friends and family contribute gold digitally. All transactions are powered by the GRAIL API, ensuring real gold backing.

## Features

- **Gold Links**: Create a shareable link with a specific amount of gold. Recipients claim it with one click.
- **Wedding Registries**: Couples can create blessing pages with live family trees showing contributions in real-time.
- **GRAIL Integration**: Uses Oro's GRAIL API for secure gold transactions in sandbox/devnet mode.
- **Fallback Mode**: If GRAIL is unavailable, falls back to demo calculations for uninterrupted experience.

## Live Demo

[Live Demo Link Placeholder]

## How to Run Locally

1. Clone the repository
2. Install dependencies: `npm install`
3. Create a `.env` file with your GRAIL API key and base URL (see Environment Variables below)
4. Start the server: `npm start`
5. Open `http://localhost:3000` in your browser

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `GRAIL_API_KEY` | Your GRAIL API key for authentication | `your_actual_api_key_here` |
| `GRAIL_BASE_URL` | GRAIL API base URL | `https://oro-tradebook-devnet.up.railway.app` |
| `PORT` | Server port (optional, defaults to 3000) | `3000` |

## Tech Stack 

- **Backend**: Node.js, Express.js
- **Frontend**: HTML, CSS, JavaScript (vanilla)
- **APIs**: GRAIL (Oro ecosystem), Axios for HTTP requests
- **Other**: CORS, dotenv, nanoid for slugs

## GRAIL API Integration

G-Link integrates with the Oro GRAIL ecosystem to handle real gold transactions. Here's which endpoints are used and why:

- **GET /health**: Health check to verify GRAIL connectivity
- **GET /api/trading/gold/price**: Fetch live gold prices in INR and USD for real-time calculations
- **POST /api/users**: Create new users when claiming gold links (required for transfers)
- **GET /api/users**: List users (used internally for verification)
- **POST /api/trading/buy**: Purchase gold when creating links or blessing registries
- **POST /api/trading/sell**: Sell gold (future feature)
- **POST /api/trading/transfer**: Transfer gold between users (used when claiming links)
- **GET /api/users/:userId/balance**: Check user balance (future dashboard feature)

All GRAIL calls include the `x-api-key` header for authentication. If GRAIL is down or returns errors, G-Link falls back to demo mode with fixed gold price calculations (₹6500/g) to ensure the user experience isn't interrupted.

## Screenshots

[Screenshots Placeholder]

## Grant

Built for the Oro GRAIL ecosystem grant. Supporting digital gold adoption through user-friendly gifting and registries.
