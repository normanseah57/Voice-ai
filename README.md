# Aura Multi-Tenant Voice AI SaaS & CRM Hub

A premium, subscription-based Voice AI SaaS receptionist and CRM Hub modeling HubSpot CRM. Built with **Twilio Media Streams**, **OpenAI Realtime API**, and a modern web-based control center. It supports multiple tenants registering accounts, upgrading subscription plans via a simulated Stripe checkout, managing their own isolated bookings and CRM, and tracking real-time quota limits.

## Features
- **Multi-Tenant Isolation**: Completely scopes settings, contacts, deals, activities, appointments, and call logs per tenant account.
- **Dynamic Inbound Call Routing**: Queries dialed Twilio numbers to resolve the active tenant ID and loads their custom voice receptionist persona on the fly.
- **Subscription Tier Quota Locks**:
  - **Free Trial**: Capped at 15 calling minutes, 15 contacts, and 5 appointments. Custom prompts and AI Copilot are locked.
  - **Starter Plan** ($29/mo): Capped at 100 calling minutes, 500 contacts, and unlimited appointments. Custom prompts are unlocked.
  - **Professional Plan** ($99/mo): Capped at 1000 calling minutes, unlimited contacts, and unlimited appointments. Unlocks **AI CRM Copilot** (Hubie) and Kanban deals board.
- **Simulated Stripe Checkout**: A premium payment overlay to authorize upgrades and instantly recalculate calling quotas.
- **Low-Latency Conversations**: Direct, un-transcoded G.711 u-law audio streams between Twilio and OpenAI's WebSocket.
- **Live Monitoring Dashboard**: Watch active calls with live streaming transcripts, voice indicators, and sound wave animations.
- **AI Conversation Summarization & Insights**: Triggers post-call completions to generate call summaries and CRM relationship intelligence logs.

---

## Technical Stack
- **Backend**: Node.js, Express, WebSockets (`ws`), SQLite (`sqlite3`).
- **Frontend**: HTML5, Vanilla CSS (Glassmorphism, animations), Vanilla JavaScript.
- **Integrations**: Twilio Node SDK, OpenAI Chat Completions & Realtime API.

---

## Setup & Installation

### 1. Install Dependencies
Ensure you have Node.js (v18+) installed. Run:
```bash
npm install
```

### 2. Configure Environment Variables
Open the [.env](file:///c:/Users/norma/OneDrive/Documents/Voice%20AI/.env) file in the root directory:
- `PORT`: Server port (defaults to 5050).
- `OPENAI_API_KEY`: Your OpenAI API key (requires Realtime model access).
- `TWILIO_ACCOUNT_SID`: Your Twilio Account SID.
- `TWILIO_AUTH_TOKEN`: Your Twilio Auth Token.
- `TWILIO_PHONE_NUMBER`: Your Twilio E.164 phone number.
- `NGROK_URL`: Your forwarding address (see step 3).

### 3. Expose Your Local Server via Ngrok
Twilio must hit your local server to route calls.
1. Run Ngrok to forward port `5050`:
   ```bash
   ngrok http 5050
   ```
2. Copy the resulting forwarding URL (e.g., `https://xxxx.ngrok-free.app`).
3. Set the `NGROK_URL` parameter in your `.env` file.

### 4. Configure Your Twilio Phone Number
1. Navigate to **Phone Numbers** -> **Active Numbers** in your Twilio Console.
2. Under **A Call Comes In**, select **Webhook** and paste your Ngrok URL appending `/incoming-call` (e.g. `https://xxxx.ngrok-free.app/incoming-call`). Set to **HTTP POST** and click Save.

---

## Running the Application

1. Start the Node.js server:
   ```bash
   npm start
   ```
2. Open your web browser and navigate to:
   ```
   http://localhost:5050
   ```
3. You will be greeted by the **SaaS Landing Page** showing pricing tables, features, and Login/Registration forms.

---

## Database Schema (SQLite)
The application automatically constructs a multi-tenant `receptionist.db` with the following schema:
1. `tenants`: Stores names, emails, plain-text passwords, billing tiers, and accumulated calling minutes.
2. `settings`: Configures company names, hours, twilio routing phone number, OpenAI models, and system prompts per tenant.
3. `appointments`: Stores scheduled booking slots mapped to `tenant_id`.
4. `calls`: Logs call records, durations, transcripts, and summaries mapped to `tenant_id`.
5. `contacts`: Scopes CRM contacts directory with unique numbers per tenant constraint.
6. `deals`: Pipeline sales items in Kanban board.
7. `activities`: Audit logs detailing call connects, deal creations, and AI relationship notes.
