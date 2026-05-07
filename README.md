# ExploreX — v6

A full-stack travel platform: realistic 3D globe, real-named places via AI, trip-based booking system, points & rewards, and a clean nav with Explore / Places / AI Planner / Weather.

> v6 is a feature rewrite over v5 with: real Earth blue-marble globe + white pin-spike markers; real-named places per country (Eiffel Tower, Louvre — never "local museum"); a brand-new `/places` page; a trip-based booking system with overlap & cooldown protection; an automatic points/rewards engine; and a seasonal-offer banner.

---

## Quick Start

### 1. Prerequisites
- Node.js 18+
- A running MongoDB instance (local or Atlas) — the server starts even before Mongo connects, but the database features need it

### 2. Install + run
```bash
# backend
cd backend
cp .env.example .env   # if you keep an example file; otherwise edit .env directly
npm install
npm start              # serves on http://localhost:3001 by default
```
Open `http://localhost:3001` in a browser.

The backend serves both the API and the static frontend (from `/frontend/public`). There is no separate frontend build step — pages are vanilla JS + HTML.

### 3. Sign up
Visit `/auth` → create an account. The first user gets a 24-hour free High-plan trial. Then explore the globe, search Places, plan a trip, etc.

---

## Environment variables (`backend/.env`)

| Variable | Required? | What it unlocks |
| --- | --- | --- |
| `PORT` | no (default 3001) | HTTP port |
| `MONGODB_URI` | recommended | DB connection. App boots without it but many features will fail until it's set. |
| `JWT_SECRET` | **yes for prod** | Signing user tokens |
| `GROQ_API_KEY` | no | Real AI itineraries + real-named country places. **Without this**, the planner shows a friendly fallback and `/api/country-places` returns a hand-curated set for popular destinations + plausible generic data otherwise. |
| `UNSPLASH_ACCESS_KEY` | no | Unsplash API for `/api/photos`. **Without this**, the app uses `https://source.unsplash.com/...` (keyless, free). Both produce real photos. |
| `OPENWEATHERMAP_API_KEY` | no | Real weather. Without it, `/api/weather` returns a deterministic mock. |
| `STRIPE_SECRET_KEY` | no | Real subscriptions. Without it, the pricing page shows "Contact us" buttons that mailto: a sales email. |
| `STRIPE_PUBLISHABLE_KEY` | no | Used client-side if Stripe is enabled |
| `STRIPE_PRICE_MEDIUM`, `STRIPE_PRICE_HIGH` | only if Stripe enabled | Price IDs for monthly plans |
| `GOOGLE_CLIENT_ID` | no | Google OAuth on `/auth`. Without it, only email/password sign-in works. |
| `SEASONAL_OFFER_TITLE` | no | If set, shows the seasonal banner sitewide (e.g. `Spring Sale — 20% off all plans`) |
| `SEASONAL_OFFER_DISCOUNT` | no | Display string for the discount (e.g. `20%` or `$10 off`). Cosmetic only — actual discount logic is configured in Stripe coupon if you wire it up. |

---

## What's new in v6

### 🌍 Realistic globe
- Real Earth blue-marble texture + topology bump map + ocean specular map
- Brighter, warmer lighting (warm sun, cool ambient + rim, white fill)
- Country markers replaced with **white glowing pin-spikes** that point outward from the surface
- Markers have an opacity-only pulse — no scale animation, no color cycling, no halos
- Camera starts zoomed-out so the whole globe is in view

### 📍 Country panel (Explore → click pin)
- Side panel shows the country's name + flag (REST Countries API), then asynchronously loads:
  - Capital, region, population, currency, language
  - Best time to visit (region-derived)
- Then loads **real, named places** via Groq AI:
  - "Eiffel Tower in Paris" not "local museum"
  - "Louvre Museum at Rue de Rivoli" not "popular gallery"
  - Falls back to hand-curated data for France/Japan/Italy/UK/USA/India/UAE/Greece if Groq is disabled
- Each place card lazy-loads an Unsplash photo
- Action buttons: Weather, AI Planner, Browse Places, Plan Trip Dates — all pre-filled with the country

### 🆕 `/places` page
- Removed Connect from the main nav (it now lives under the profile dropdown)
- New Places page added: hero search, filter tabs (All/Restaurants/Attractions/Events/Hotels), sort dropdown
- Cards have Unsplash photos, name, city, country, rating stars, price level, and a Book button
- Click → detail modal with 3-photo carousel + "Book Now"
- Distance in km when geolocation is enabled (cached 30 min in localStorage)
- AI fallback: if a search returns nothing from the database, the system asks the AI for real named matches

### 🤖 AI Planner — real places only
- Strict prompt: "Use ONLY real, well-known, NAMED places. NOT 'a popular café'."
- Each activity gets a real Unsplash photo
- "Add all to bookings" automatically attaches activities to your active trip if their date falls in the trip window

### ✈️ Trip-based booking system
- Create a trip with destination (country + city) + start/end dates + travelers + budget
- **Date conflict prevention**: if you already have a trip whose dates overlap the new one, you get a clear error
- **24-hour cooldown**: cancelling a trip locks the same destination + dates for 24h
- All bookings live within their trip's date window. Bookings outside the window are rejected.
- `/bookings` has three tabs: Upcoming Trips · Past Trips · All Bookings (flat list)
- Trip cards show cover photo, dates, traveler count, booking count, total cost, status badge
- Cancel Trip soft-cancels the trip + all of its child bookings via a confirmation modal

### ⭐ Points & rewards
Points are awarded automatically on the backend:
- **+50** for creating a trip
- **+25** for adding a booking
- **+100** when a trip's start date passes (it transitions to *active*)
- **+200** when a trip's end date passes (it transitions to *completed*)
- **+10** to both users when a connection request is accepted
- **+5** for the first login of each calendar day
A background sweep runs hourly to award start/end-date points so users get them even if they're not online.

The points balance shows in the profile dropdown (`⭐ 1,240 pts`). On `/profile` you'll see a redemption section and a full points history.

Redemption tiers (configurable):
| Cost | Reward |
| --- | --- |
| 500 pts | 10% off Medium plan |
| 1,000 pts | 10% off High plan |
| 2,000 pts | 1 free month of Medium |

If Stripe is configured, redemption creates a real Stripe coupon and returns a code. Without Stripe, the system issues a manual override (free month extends `membership_until` directly).

### 🎁 Seasonal offers
Set `SEASONAL_OFFER_TITLE` (and optionally `SEASONAL_OFFER_DISCOUNT`) and a slim animated banner appears at the top of every authenticated page. It links to /pricing, has a close button, and respects a 24h dismissal stored in localStorage.

### 🤝 Connect (still available, moved to profile dropdown)
- Same discover/requests/connections/invites flow as v5
- Now displays a "Traveling to: [Paris, France]" or "Planning trip to: [Tokyo]" badge under each user, sourced from their active or upcoming trip
- AI chatbot (Medium+) now mentions the user's active trip in its system prompt

---

## Project layout

```
backend/
  server.js          ← Express + Mongoose, single-file API
  .env               ← config (you edit this)
  package.json
frontend/public/
  index.html         ← landing page
  auth.html          ← sign in / sign up (with Google OAuth)
  styles.css         ← landing styles
  main.js            ← landing page logic
  app/               ← authenticated pages
    home.html
    explore.html
    places.html      ← NEW
    planner.html
    weather.html
    bookings.html    ← rewritten for trips
    connect.html     ← (moved out of main nav)
    chat.html
    profile.html     ← rewritten for points/rewards
    notifications.html
    pricing.html     ← rewritten with rewards tiers
    favorites.html
    place.html       ← legacy (redirects to /places)
  css/app.css        ← all auth-page styles
  js/
    sdk.js           ← API wrapper (db.auth, db.trips, db.rewards, db.geo, db.integrations.*)
    app.js           ← nav + profile menu + seasonal banner + helpers
    explore-globe.js ← Three.js globe with pin-spikes
    places.js        ← /places page logic
    bookings.js      ← trip-based bookings
    planner.js       ← real-place AI planner
    profile.js       ← points history + rewards redemption
    pricing.js       ← plans + rewards tiers + seasonal banner
    connect.js       ← discover, requests, connections (with active-trip badge)
    favorites.js
    chatbot.js       ← floating AI chatbot
```

---

## Notable implementation details

- **Single-file backend** (`server.js` ~1300 lines) — every model, every route, all in one place for easy reading. `awardPoints()` writes to a `PointsLog` collection so the user's history is fully traceable.
- **Trip lifecycle sweep** runs every hour (and once 5 seconds after boot). It moves trips from `planned → active → completed` as their dates pass and awards the appropriate points exactly once each.
- **Globe pin-spikes**: each marker is a thin `ConeGeometry(0.55, 4.5, 12)` whose +Y axis is rotated to align with the outward normal at that lat/lng. A small white sphere sits at the apex. The hitbox is a slightly larger invisible sphere so clicks are forgiving. Animation is opacity-only — no scale, no color, by spec.
- **Photos without an Unsplash key**: `/api/photos` falls back to `https://source.unsplash.com/800x600/?{query}&sig={n}` — keyless, free, returns real photos.
- **Real-named places fallback**: when Groq is disabled, `/api/country-places` returns a hand-curated dataset for the top 8 countries (so "Eiffel Tower" still appears for France) and plausible generic data for everything else.
- **Date conflict logic** uses a single Mongo query: `{ start_date: { $lte: newEnd }, end_date: { $gte: newStart }, status: { $ne: 'cancelled' } }`. Conflicts return HTTP 409 with the conflicting trip in the body.
- **Cooldown logic**: any cancelled trip with the same destination, start, and end blocks re-creation within 24h via HTTP 429.
- **Stripe disabled gracefully**: subscription buttons become "Contact us" mailto: links; redemption issues manual overrides instead of Stripe coupons.

---

## Production checklist

- Set `JWT_SECRET` to a long random string
- Set `MONGODB_URI` to your production cluster
- Add `GROQ_API_KEY` for real AI features
- Add `UNSPLASH_ACCESS_KEY` if you expect heavy photo traffic (the keyless fallback is rate-limited)
- Add `STRIPE_SECRET_KEY` + `STRIPE_PRICE_*` to enable real subscriptions
- Add `GOOGLE_CLIENT_ID` for Google sign-in
- Optionally set `SEASONAL_OFFER_TITLE` to display the promotional banner

That's it. `npm start` and you're live.
