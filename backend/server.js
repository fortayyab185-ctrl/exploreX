/* ═══════════════════════════════════════════════════════════════════════════
   ExploreX — Backend
   Node.js / Express / MongoDB / Groq AI / Unsplash
   See README.md for setup instructions.
   ═══════════════════════════════════════════════════════════════════════════ */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
let multer;
try { multer = require('multer'); } catch (e) { multer = null; }

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'explorex-super-secret-jwt-key-2024';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/explorex';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY || '';
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY || '';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';

// ─── MongoDB Connection ────────────────────────────────────────────────────────
mongoose.connect(MONGO_URI)
  .then(async () => { console.log('MongoDB connected:', MONGO_URI); await seedPlacesIfEmpty(); })
  .catch(err => { console.error('MongoDB connection error:', err.message); process.exit(1); });

// ─── Schemas & Models ─────────────────────────────────────────────────────────
const ts = {
  created_date: { type: Date, default: Date.now },
  updated_date: { type: Date, default: Date.now },
};

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password_hash: { type: String, required: false, default: '' },
  full_name: { type: String, default: '' },
  home_city: { type: String, default: '' },
  bio: { type: String, default: '' },
  interests: { type: [String], default: [] },
  dietary: { type: String, default: 'No restrictions' },
  budget_preference: { type: String, default: 'moderate' },
  travel_style: { type: String, default: 'balanced' },
  points: { type: Number, default: 0 },
  last_login_date: { type: String, default: '' },         // YYYY-MM-DD for daily login points

  // User preferences — controls UI behavior and chatbot/planner personalization.
  // We store them flat under `preferences` so the frontend can PATCH the whole
  // bag in one call without conflicts with the top-level identity fields.
  preferences: {
    theme: { type: String, enum: ['system', 'light', 'dark'], default: 'system' },
    distance_unit: { type: String, enum: ['km', 'mi'], default: 'km' },
    currency_display: { type: String, default: 'AED' },
    default_travelers: { type: Number, default: 1 },
    default_budget_tier: { type: String, enum: ['budget', 'moderate', 'premium', 'luxury'], default: 'moderate' },
    default_trip_duration_days: { type: Number, default: 3 },
    notify_email: { type: Boolean, default: true },
    notify_in_app: { type: Boolean, default: true },
    weekly_digest: { type: Boolean, default: false },
    auto_geo: { type: Boolean, default: true },     // ask for location automatically
    home_currency: { type: String, default: 'AED' },
    language: { type: String, default: 'en' },
  },

  membership: { type: String, enum: ['free', 'medium', 'high'], default: 'free' },
  membership_until: { type: Date, default: null },

  trial_active: { type: Boolean, default: false },
  trial_start_date: { type: Date, default: null },
  trial_used: { type: Boolean, default: false },

  stripe_customer_id: { type: String, default: '' },
  stripe_subscription_id: { type: String, default: '' },

  google_id: { type: String, default: '' },
  avatar_url: { type: String, default: '' },

  ...ts,
});

// A "Trip" is the top-level container — destination + date range. Bookings
// belong to a trip and live within its window.
const TripSchema = new mongoose.Schema({
  created_by: { type: String, required: true },
  destination_country: { type: String, required: true },
  destination_city: { type: String, default: '' },
  start_date: { type: String, required: true },          // ISO YYYY-MM-DD
  end_date: { type: String, required: true },          // ISO YYYY-MM-DD
  travelers: { type: Number, default: 1 },
  budget: { type: Number, default: 0 },
  notes: String,
  cover_image: String,
  status: { type: String, enum: ['planned', 'active', 'completed', 'cancelled'], default: 'planned' },
  // Points-tracking flags so we don't double-award
  points_started_awarded: { type: Boolean, default: false },
  points_completed_awarded: { type: Boolean, default: false },
  cancelled_at: { type: Date, default: null },            // for the 24h re-book cooldown
  ...ts,
});

const BookingSchema = new mongoose.Schema({
  created_by: { type: String, required: true },
  trip_id: { type: String, default: '' },        // optional link to a Trip
  place_id: String,
  place_name: { type: String, required: true },
  place_type: String,
  place_image: String,
  booking_date: { type: String, required: true },
  booking_time: String,
  guests: { type: Number, default: 1 },
  status: { type: String, enum: ['confirmed', 'pending', 'cancelled', 'completed'], default: 'confirmed' },
  total_price: Number,
  notes: String,
  confirmation_code: String,
  // Payment fields (Stripe one-time checkout for paid bookings)
  payment_status: { type: String, enum: ['unpaid', 'pending', 'paid', 'refunded', 'free'], default: 'free' },
  payment_amount: Number,
  payment_method: String,                              // 'stripe' | etc.
  stripe_session_id: String,
  ...ts,
});

const ConnectionSchema = new mongoose.Schema({
  created_by: { type: String, required: true },
  from_user: { type: String, required: true },
  from_name: String,
  to_user: { type: String, required: true },
  to_name: String,
  status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' },
  message: String,
  city: String,
  travel_dates: String,
  points_awarded: { type: Boolean, default: false },
  ...ts,
});

const ItinerarySchema = new mongoose.Schema({
  created_by: { type: String, required: true },
  title: { type: String, required: true },
  date: { type: String, required: true },
  city: { type: String, required: true },
  country: { type: String, default: '' },
  activities: { type: Array, default: [] },
  preferences: String,
  budget: String,
  weather_summary: String,
  ...ts,
});

const MessageSchema = new mongoose.Schema({
  created_by: { type: String, required: true },
  sender_email: { type: String, required: true },
  sender_name: String,
  receiver_email: { type: String, required: true },
  text: { type: String, required: true },
  read: { type: Boolean, default: false },
  ...ts,
});

const NotificationSchema = new mongoose.Schema({
  created_by: { type: String, required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, enum: ['booking', 'trip_reminder', 'social', 'weather', 'system', 'points'], default: 'system' },
  read: { type: Boolean, default: false },
  link: String,
  ...ts,
});

const PlaceSchema = new mongoose.Schema({
  created_by: { type: String, required: true },
  name: { type: String, required: true },
  type: { type: String, enum: ['restaurant', 'attraction', 'event', 'hotel'], default: 'attraction' },
  description: String,
  short_description: String,
  image_url: String,
  location: String,
  city: String,
  rating: Number,
  price_level: { type: String, enum: ['budget', 'moderate', 'premium', 'luxury'] },
  category: String,
  opening_hours: String,
  phone: String,
  website: String,
  tags: { type: [String], default: [] },
  latitude: Number,
  longitude: Number,
  avg_price: Number,
  event_date: String,
  featured: { type: Boolean, default: false },
  capacity: { type: Number, default: 4 },
  country: { type: String, default: '' },
  ...ts,
});

const SubscriptionSchema = new mongoose.Schema({
  created_by: { type: String, required: true },
  plan: { type: String, enum: ['basic', 'medium', 'pro'], required: true },
  price: Number,
  status: { type: String, enum: ['active', 'cancelled', 'expired', 'trial'], default: 'active' },
  start_date: String,
  end_date: String,
  auto_renew: { type: Boolean, default: true },
  trial_used: { type: Boolean, default: false },
  discount_applied: String,
  ...ts,
});

const FavoriteSchema = new mongoose.Schema({
  created_by: { type: String, required: true },
  place_id: { type: String, required: true },
  place_name: String,
  place_type: String,
  place_image: String,
  city: String,
  country: String,
  ...ts,
});

const TripInviteSchema = new mongoose.Schema({
  created_by: { type: String, required: true },
  trip_name: { type: String, required: true },
  trip_id: String,
  inviter_email: { type: String, required: true },
  inviter_name: String,
  invitee_email: { type: String, required: true },
  status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' },
  booking_ids: { type: [String], default: [] },
  trip_dates: String,
  message: String,
  ...ts,
});

// History of point gains/spends for the /profile points history view
const PointsLogSchema = new mongoose.Schema({
  created_by: { type: String, required: true },
  amount: { type: Number, required: true },             // positive = earn, negative = spend
  reason: { type: String, required: true },
  meta: { type: Object, default: {} },
  ...ts,
});

const User = mongoose.model('User', UserSchema);
const Trip = mongoose.model('Trip', TripSchema);
const Booking = mongoose.model('Booking', BookingSchema);
const Connection = mongoose.model('Connection', ConnectionSchema);
const Itinerary = mongoose.model('Itinerary', ItinerarySchema);
const Message = mongoose.model('Message', MessageSchema);
const Notification = mongoose.model('Notification', NotificationSchema);
const Place = mongoose.model('Place', PlaceSchema);
const Subscription = mongoose.model('Subscription', SubscriptionSchema);
const TripInvite = mongoose.model('TripInvite', TripInviteSchema);
const Favorite = mongoose.model('Favorite', FavoriteSchema);
const PointsLog = mongoose.model('PointsLog', PointsLogSchema);

const MODELS = { Trip, Booking, Connection, Itinerary, Message, Notification, Place, Subscription, TripInvite, Favorite, PointsLog };

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));

// ─── Helpers ──────────────────────────────────────────────────────────────────
function effectivePlan(user) {
  if (!user) return 'free';
  if (user.trial_active && user.trial_start_date) {
    const elapsed = Date.now() - new Date(user.trial_start_date).getTime();
    if (elapsed < 24 * 60 * 60 * 1000) return 'high';
  }
  if (user.membership && user.membership !== 'free') {
    if (!user.membership_until || new Date(user.membership_until) > new Date()) {
      return user.membership;
    }
  }
  return 'free';
}

function formatUser(u) {
  if (!u) return null;
  const o = u.toObject ? u.toObject() : u;
  const effective = effectivePlan(o);
  let trialRemainingMs = null;
  if (o.trial_active && o.trial_start_date) {
    const elapsed = Date.now() - new Date(o.trial_start_date).getTime();
    trialRemainingMs = Math.max(0, 24 * 60 * 60 * 1000 - elapsed);
  }
  return {
    id: o._id?.toString() || o.id,
    email: o.email,
    full_name: o.full_name,
    home_city: o.home_city,
    bio: o.bio,
    interests: o.interests || [],
    dietary: o.dietary,
    budget_preference: o.budget_preference,
    travel_style: o.travel_style,
    preferences: o.preferences || {},
    points: o.points || 0,
    membership: o.membership || 'free',
    effective_plan: effective,
    membership_until: o.membership_until,
    trial_active: o.trial_active && trialRemainingMs > 0,
    trial_remaining_ms: trialRemainingMs,
    trial_used: o.trial_used || false,
    avatar_url: o.avatar_url || '',
    google_id: o.google_id || '',
    created_date: o.created_date,
  };
}

function requirePlan(minLevel) {
  const order = { free: 0, medium: 1, pro: 1, high: 2, max: 2 };
  return async (req, res, next) => {
    try {
      const u = await User.findById(req.userId);
      if (!u) return res.status(401).json({ error: 'Unauthorized' });
      const eff = effectivePlan(u);
      if (order[eff] < order[minLevel]) {
        return res.status(402).json({ error: 'Upgrade required', required: minLevel, current: eff });
      }
      req.user = u;
      next();
    } catch (e) { res.status(500).json({ error: e.message }); }
  };
}

// Award points + write a log entry. Always logs (so the /profile history is honest).
async function awardPoints(userEmailOrId, amount, reason, meta) {
  if (!amount) return;
  try {
    let user;
    if (typeof userEmailOrId === 'string' && userEmailOrId.includes('@')) {
      user = await User.findOne({ email: userEmailOrId.toLowerCase() });
    } else {
      user = await User.findById(userEmailOrId);
    }
    if (!user) return;
    user.points = (user.points || 0) + amount;
    if (user.points < 0) user.points = 0;
    await user.save();
    await PointsLog.create({ created_by: user.email, amount, reason, meta: meta || {} });
    console.log((amount > 0 ? '+' : '') + amount + ' points to ' + user.email + ' (' + reason + ')');
  } catch (e) { console.warn('points err:', e.message); }
}

function toJSON(doc) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : { ...doc };
  o.id = o._id?.toString();
  delete o._id;
  delete o.__v;
  return o;
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer '))
    return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET);
    req.userId = payload.userId;
    req.userEmail = payload.email;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ISO date helpers (treat dates as "calendar days" with no timezones)
function isoDate(d) { return new Date(d).toISOString().slice(0, 10); }
function todayISO() { return new Date().toISOString().slice(0, 10); }

// Two ranges overlap if startA <= endB AND startB <= endA (inclusive)
function rangesOverlap(s1, e1, s2, e2) { return s1 <= e2 && s2 <= e1; }

// ─── Generic CRUD factory (simple entities only — Trip/Booking have their own) ─
function entityRouter(modelName) {
  const Model = MODELS[modelName];
  const router = express.Router();

  router.get('/', authMiddleware, async (req, res) => {
    try {
      const { sort = '-created_date', limit = 500, ...filters } = req.query;
      const query = {};
      Object.entries(filters).forEach(([k, v]) => { if (v !== '' && v !== undefined) query[k] = v; });
      const sortField = sort.startsWith('-') ? sort.slice(1) : sort;
      const sortDir = sort.startsWith('-') ? -1 : 1;

      const docs = await Model.find(query)
        .sort({ [sortField]: sortDir })
        .limit(parseInt(limit) || 500)
        .lean();

      res.json(docs.map(d => { d.id = d._id?.toString(); delete d._id; delete d.__v; return d; }));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/:id', authMiddleware, async (req, res) => {
    try {
      const doc = await Model.findById(req.params.id).lean();
      if (!doc) return res.status(404).json({ error: 'Not found' });
      doc.id = doc._id?.toString(); delete doc._id; delete doc.__v;
      res.json(doc);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/', authMiddleware, async (req, res) => {
    try {
      const doc = await Model.create({ ...req.body, created_by: req.userEmail, created_date: new Date(), updated_date: new Date() });
      // Connection accept → +10 to both sides
      if (modelName === 'Connection' && req.body.status === 'accepted') {
        // Note: only awards once thanks to points_awarded flag below
      }
      res.status(201).json(toJSON(doc));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.patch('/:id', authMiddleware, async (req, res) => {
    try {
      const before = await Model.findById(req.params.id);
      const doc = await Model.findByIdAndUpdate(
        req.params.id,
        { $set: { ...req.body, updated_date: new Date() } },
        { new: true }
      );
      if (!doc) return res.status(404).json({ error: 'Not found' });

      // Connection: pending → accepted awards +10 to both ends, once
      if (modelName === 'Connection' && before && before.status !== 'accepted' && req.body.status === 'accepted' && !before.points_awarded) {
        await Connection.findByIdAndUpdate(doc._id, { $set: { points_awarded: true } });
        awardPoints(before.from_user, 10, 'Connection accepted', { connection_id: before._id.toString() });
        awardPoints(before.to_user, 10, 'Connection accepted', { connection_id: before._id.toString() });
        // Notify both
        Notification.create({ created_by: before.from_user, title: 'New travel buddy', message: 'You and ' + (before.to_name || before.to_user) + ' are now connected (+10 pts)', type: 'social', link: '/connect' }).catch(() => { });
        Notification.create({ created_by: before.to_user, title: 'New travel buddy', message: 'You and ' + (before.from_name || before.from_user) + ' are now connected (+10 pts)', type: 'social', link: '/connect' }).catch(() => { });
      }

      res.json(toJSON(doc));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/:id', authMiddleware, async (req, res) => {
    try { await Model.findByIdAndDelete(req.params.id); res.json({ success: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
}

// ─── Auth Routes ──────────────────────────────────────────────────────────────
async function maybeAwardDailyLogin(user) {
  const today = todayISO();
  if (user.last_login_date === today) return;
  user.last_login_date = today;
  await user.save();
  awardPoints(user.email, 5, 'Daily login');
}

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, full_name } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    if (await User.findOne({ email: email.toLowerCase() })) return res.status(409).json({ error: 'User already exists' });

    const password_hash = await bcrypt.hash(password, 10);
    const user = await User.create({ email, password_hash, full_name: full_name || '' });
    const token = jwt.sign({ userId: user._id.toString(), email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    await maybeAwardDailyLogin(user);
    res.status(201).json({ token, user: formatUser(user) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/signin', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !(await bcrypt.compare(password, user.password_hash)))
      return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign({ userId: user._id.toString(), email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    await maybeAwardDailyLogin(user);
    res.json({ token, user: formatUser(user) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    await maybeAwardDailyLogin(user);
    // Re-fetch in case points were just awarded
    const fresh = await User.findById(user._id);
    res.json(formatUser(fresh));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const allowed = ['full_name', 'home_city', 'bio', 'interests', 'dietary', 'budget_preference', 'travel_style', 'avatar_url'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

    // Preferences PATCH — merge incoming keys onto existing preferences so
    // partial updates (e.g. just toggling theme) don't wipe other settings.
    if (req.body.preferences && typeof req.body.preferences === 'object') {
      const u = await User.findById(req.userId);
      const merged = Object.assign({}, (u && u.preferences && u.preferences.toObject) ? u.preferences.toObject() : (u && u.preferences) || {}, req.body.preferences);
      updates.preferences = merged;
    }
    updates.updated_date = new Date();

    const user = await User.findByIdAndUpdate(req.userId, { $set: updates }, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(formatUser(user));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Dedicated preferences GET/PATCH — keeps the API readable and keeps the
// preferences logic isolated from identity-field updates.
app.get('/api/me/preferences', authMiddleware, async (req, res) => {
  try {
    const u = await User.findById(req.userId).lean();
    if (!u) return res.status(404).json({ error: 'User not found' });
    res.json({ preferences: u.preferences || {} });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/me/preferences', authMiddleware, async (req, res) => {
  try {
    const incoming = req.body || {};
    const u = await User.findById(req.userId);
    if (!u) return res.status(404).json({ error: 'User not found' });
    const current = (u.preferences && u.preferences.toObject) ? u.preferences.toObject() : (u.preferences || {});
    u.preferences = Object.assign({}, current, incoming);
    u.updated_date = new Date();
    await u.save();
    res.json({ preferences: u.preferences });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Google OAuth — verify ID token issued by Google Identity Services
app.post('/api/auth/google', async (req, res) => {
  try {
    if (!GOOGLE_CLIENT_ID) return res.status(503).json({ error: 'Google Sign-In not configured. Set GOOGLE_CLIENT_ID in .env' });
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'Missing Google credential token' });

    const { OAuth2Client } = require('google-auth-library');
    const client = new OAuth2Client(GOOGLE_CLIENT_ID);

    let payload;
    try {
      const ticket = await client.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
      payload = ticket.getPayload();
    } catch (verifyErr) { return res.status(401).json({ error: 'Invalid Google token: ' + verifyErr.message }); }

    const { sub: googleId, email, name, picture, email_verified } = payload;
    if (!email_verified) return res.status(400).json({ error: 'Google account email is not verified' });

    let user = await User.findOne({ email: email.toLowerCase() });
    if (user) {
      const updates = {};
      if (!user.full_name && name) updates.full_name = name;
      if (!user.google_id) updates.google_id = googleId;
      if (!user.avatar_url && picture) updates.avatar_url = picture;
      if (Object.keys(updates).length) {
        await User.findByIdAndUpdate(user._id, { $set: updates });
        user = await User.findById(user._id);
      }
    } else {
      user = await User.create({ email: email.toLowerCase(), password_hash: '', full_name: name || '', google_id: googleId, avatar_url: picture || '' });
    }
    await maybeAwardDailyLogin(user);
    const fresh = await User.findById(user._id);
    const token = jwt.sign({ userId: fresh._id.toString(), email: fresh.email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: formatUser(fresh) });
  } catch (e) { console.error('Google auth error:', e); res.status(500).json({ error: e.message }); }
});

// 24-hour free trial of Max plan
app.post('/api/auth/start-trial', authMiddleware, async (req, res) => {
  try {
    const u = await User.findById(req.userId);
    if (!u) return res.status(404).json({ error: 'User not found' });
    if (u.trial_used) return res.status(400).json({ error: 'Trial already used' });
    u.trial_used = true; u.trial_active = true; u.trial_start_date = new Date();
    await u.save();
    Notification.create({ created_by: u.email, title: 'Max plan trial started', message: 'You have 24 hours of full Max-plan access. Enjoy!', type: 'system', link: '/pricing' }).catch(() => { });
    res.json(formatUser(u));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Rewards: redemption tiers ────────────────────────────────────────────────
const REWARD_TIERS = [
  { id: 'medium-10', cost: 500, label: '10% off Pro plan', kind: 'discount', plan: 'medium', percent: 10 },
  { id: 'high-10', cost: 1000, label: '10% off Max plan', kind: 'discount', plan: 'high', percent: 10 },
  { id: 'medium-1m', cost: 2000, label: '1 free month Pro', kind: 'free_month', plan: 'medium' },
];

app.get('/api/rewards/tiers', authMiddleware, (_req, res) => res.json({ tiers: REWARD_TIERS }));

app.get('/api/rewards/history', authMiddleware, async (req, res) => {
  try {
    const items = await PointsLog.find({ created_by: req.userEmail }).sort({ created_date: -1 }).limit(200).lean();
    res.json(items.map(d => { d.id = d._id?.toString(); delete d._id; delete d.__v; return d; }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/rewards/redeem', authMiddleware, async (req, res) => {
  try {
    const { tier_id } = req.body;
    const tier = REWARD_TIERS.find(t => t.id === tier_id);
    if (!tier) return res.status(400).json({ error: 'Unknown reward tier' });

    const u = await User.findById(req.userId);
    if (!u) return res.status(404).json({ error: 'User not found' });
    if ((u.points || 0) < tier.cost) return res.status(400).json({ error: 'Need ' + tier.cost + ' points (you have ' + (u.points || 0) + ')' });

    u.points -= tier.cost;
    await u.save();
    await PointsLog.create({ created_by: u.email, amount: -tier.cost, reason: 'Redeemed: ' + tier.label, meta: { tier_id: tier.id } });

    let voucher = null;
    if (tier.kind === 'discount') {
      // Try to make a Stripe coupon if Stripe is configured
      if (stripe) {
        try {
          const c = await stripe.coupons.create({ percent_off: tier.percent, duration: 'once', name: 'ExploreX rewards: ' + tier.percent + '% off' });
          voucher = { code: c.id, percent_off: tier.percent };
        } catch (e) { console.warn('Stripe coupon create failed:', e.message); }
      }
      if (!voucher) {
        voucher = { code: 'EXTRA' + tier.percent + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(), percent_off: tier.percent };
      }
    } else if (tier.kind === 'free_month') {
      // Manual override: extend membership_until by 30 days
      const until = u.membership_until && new Date(u.membership_until) > new Date() ? new Date(u.membership_until) : new Date();
      until.setDate(until.getDate() + 30);
      u.membership = 'medium';
      u.membership_until = until;
      await u.save();
      voucher = { kind: 'applied', message: 'Pro plan extended by 1 month — until ' + until.toLocaleDateString() };
    }

    Notification.create({ created_by: u.email, title: 'Reward redeemed', message: tier.label + ' (-' + tier.cost + ' pts)', type: 'points', link: '/profile' }).catch(() => { });
    res.json({ ok: true, points: u.points, tier, voucher });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// All users — for Connect page
app.get('/api/users', authMiddleware, async (req, res) => {
  try {
    const users = await User.find({}).lean();
    // Attach active-trip badge so Connect can show "Traveling to ..."
    const activeTrips = await Trip.find({ status: { $in: ['planned', 'active'] }, end_date: { $gte: todayISO() }, start_date: { $lte: todayISO() } }).lean();
    const tripByEmail = {};
    activeTrips.forEach(t => { tripByEmail[t.created_by] = t; });
    const futureTrips = await Trip.find({ status: { $in: ['planned', 'active'] }, start_date: { $gt: todayISO() } }).sort({ start_date: 1 }).lean();
    const upcomingByEmail = {};
    futureTrips.forEach(t => { if (!upcomingByEmail[t.created_by]) upcomingByEmail[t.created_by] = t; });

    res.json(users.map(u => {
      const f = formatUser({ toObject: () => u });
      const active = tripByEmail[u.email];
      const upcoming = upcomingByEmail[u.email];
      f.active_trip = active ? { destination: [active.destination_city, active.destination_country].filter(Boolean).join(', '), end_date: active.end_date } : null;
      f.upcoming_trip = upcoming ? { destination: [upcoming.destination_city, upcoming.destination_country].filter(Boolean).join(', '), start_date: upcoming.start_date } : null;
      return f;
    }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── AI: generic invoke (used by chatbot, planner schemas, etc) ──────────────
app.post('/api/ai/invoke', authMiddleware, async (req, res) => {
  try {
    const { prompt, response_json_schema, messages: chatHistory } = req.body;

    if (!GROQ_API_KEY) {
      if (response_json_schema) return res.json({ result: mockAI(prompt) });
      return res.json({ result: "I'm your ExploreX travel assistant! Add GROQ_API_KEY to .env for real AI responses." });
    }

    let fullPrompt = prompt || '';
    if (chatHistory && chatHistory.length) {
      fullPrompt = chatHistory.map(m => (m.role === 'ai' ? 'Assistant' : 'User') + ': ' + m.text).join('\n') + '\nAssistant:';
    }
    if (response_json_schema) {
      fullPrompt = (prompt || '') + '\n\nRespond ONLY with valid JSON matching this schema: ' + JSON.stringify(response_json_schema) + '. No markdown, no explanation, just raw JSON object.';
    }

    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_API_KEY },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: fullPrompt }], max_tokens: 2048, temperature: 0.7 }),
    });
    if (!r.ok) {
      const errText = await r.text().catch(() => r.statusText);
      console.warn('Groq error:', r.status, errText.slice(0, 200));
      if (response_json_schema) return res.json({ result: mockAI(prompt) });
      return res.json({ result: 'AI is temporarily unavailable. Please try again.' });
    }
    const data = await r.json();
    const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';

    if (response_json_schema) {
      try {
        const clean = text.replace(/```json\n?|\n?```/g, '').trim();
        return res.json({ result: JSON.parse(clean) });
      } catch { return res.json({ result: mockAI(prompt) }); }
    }
    res.json({ result: text });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function mockAI(prompt) {
  const isWeather = /weather|outfit/i.test(prompt || '');
  const city = ((prompt || '').match(/visiting ([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/) || [])[1] || 'Your Destination';
  if (isWeather) {
    return {
      city,
      current: { temperature: '22°C', conditions: 'Partly Cloudy', humidity: '60%', wind: '15 km/h', feels_like: '21°C' },
      forecast: [
        { day: 'Today', high: '24°C', low: '16°C', conditions: 'Partly Cloudy' },
        { day: 'Tomorrow', high: '26°C', low: '18°C', conditions: 'Sunny' },
        { day: 'Day After', high: '21°C', low: '15°C', conditions: 'Light Rain' },
      ],
      outfit_suggestions: ['Light layers', 'Comfortable walking shoes', 'Sunglasses', 'Light jacket for evenings'],
      activity_recommendations: [
        { activity: 'Outdoor sightseeing', reason: 'Perfect mild weather for walking tours' },
        { activity: 'Outdoor dining', reason: 'Great patio weather today' },
      ],
      things_to_avoid: ['Heavy coats', 'Staying indoors all day'],
    };
  }
  // Mock itinerary — uses generic-but-plausible names so it's still helpful without GROQ
  return {
    title: 'A Perfect Day in ' + city,
    weather_summary: 'Beautiful sunny day in ' + city + ', around 24°C. Perfect for exploring!',
    activities: [
      { time: '8:00 AM', activity: 'Sunrise breakfast at a popular local café', location: city + ' city center', description: 'Start your day with the city\'s signature breakfast.', type: 'food', price_per_person: 15 },
      { time: '10:00 AM', activity: 'Old town walking tour', location: 'Historic district', description: 'Explore historic streets and architecture.', type: 'sightseeing', price_per_person: 20 },
      { time: '12:30 PM', activity: 'Traditional lunch', location: 'Market square', description: 'Authentic local cuisine.', type: 'food', price_per_person: 25 },
      { time: '2:00 PM', activity: 'Museum visit', location: 'Main city museum', description: 'History and culture.', type: 'culture', price_per_person: 12 },
      { time: '4:30 PM', activity: 'Scenic viewpoint', location: 'Hilltop park', description: 'Panoramic views of the city.', type: 'sightseeing', price_per_person: 0 },
      { time: '7:00 PM', activity: 'Dinner & live music', location: 'Waterfront district', description: 'End the day with great food and entertainment.', type: 'food', price_per_person: 45 },
    ],
  };
}

// ─── File Upload (multer) ────────────────────────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

let upload = null;
if (multer) {
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '';
      cb(null, Date.now() + '-' + Math.random().toString(36).slice(2) + ext);
    },
  });
  upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } }); // 500 MB
}

app.use('/uploads', express.static(UPLOADS_DIR));

app.post('/api/upload', authMiddleware, (req, res, next) => {
  if (!upload) return res.json({ file_url: 'https://via.placeholder.com/400x300?text=Uploaded' });
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const fileUrl = APP_URL + '/uploads/' + req.file.filename;
    res.json({ file_url: fileUrl });
  });
});

// ─── Site Config (about video, etc.) ──────────────────────────────────────────
const SITE_CONFIG_PATH = path.join(__dirname, 'site-config.json');
function loadSiteConfig() {
  try { return JSON.parse(fs.readFileSync(SITE_CONFIG_PATH, 'utf8')); }
  catch { return {}; }
}
function saveSiteConfig(cfg) {
  fs.writeFileSync(SITE_CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

// Public — the landing page reads this to display the about video
app.get('/api/config/site', (_req, res) => res.json(loadSiteConfig()));

// Upload or set the about-section video URL (auth required — only you can change it)
app.post('/api/config/about-video', authMiddleware, (req, res, next) => {
  function handleUpdate(videoUrl) {
    const cfg = loadSiteConfig();
    cfg.about_video_url = videoUrl;
    saveSiteConfig(cfg);
    res.json({ ok: true, about_video_url: videoUrl });
  }

  if (upload) {
    upload.single('video')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message });
      if (req.file) {
        return handleUpdate(APP_URL + '/uploads/' + req.file.filename);
      }
      // No file attached — check for a URL in the body
      if (req.body && req.body.url) return handleUpdate(req.body.url);
      res.status(400).json({ error: 'Send a video file (field: video) or a url in the body' });
    });
  } else {
    // multer not installed — only URL-based update is supported
    if (req.body && req.body.url) return handleUpdate(req.body.url);
    res.status(503).json({ error: 'File upload not available — run: npm install multer' });
  }
});

// ─── Seed catalog of bookable places ─────────────────────────────────────────
async function seedPlacesIfEmpty() {
  try {
    const count = await Place.countDocuments();
    if (count > 0) { return; }
    const seedData = [
      // PARIS
      { name: "Le Petit Bistro", city: "Paris", country: "France", type: "restaurant", price_level: "moderate", avg_price: 65, rating: 4.7, capacity: 4, image_url: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=900&q=85", short_description: "Classic French bistro with seasonal menu", description: "Tucked in a cobblestone alley in the Marais, Le Petit Bistro serves rotating French classics with locally sourced ingredients.", opening_hours: "12:00 PM - 11:00 PM", featured: true, latitude: 48.857, longitude: 2.352 },
      { name: "Eiffel Tower Skip-the-Line", city: "Paris", country: "France", type: "attraction", price_level: "moderate", avg_price: 45, rating: 4.8, capacity: 8, image_url: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=900&q=85", short_description: "Priority access + summit climb", description: "Bypass the queues with a guided tour to the second floor, then head to the summit for panoramic views.", opening_hours: "9:00 AM - 11:45 PM", featured: true, latitude: 48.858, longitude: 2.294 },
      { name: "Hotel des Arts", city: "Paris", country: "France", type: "hotel", price_level: "premium", avg_price: 220, rating: 4.6, capacity: 2, image_url: "https://images.unsplash.com/photo-1455587734955-081b22074882?w=900&q=85", short_description: "Boutique hotel near Louvre", description: "Charming 4-star boutique hotel a 5-minute walk from the Louvre. Continental breakfast included.", opening_hours: "24/7", latitude: 48.860, longitude: 2.337 },

      // KYOTO
      { name: "Kaiseki Dinner Experience", city: "Kyoto", country: "Japan", type: "restaurant", price_level: "luxury", avg_price: 180, rating: 4.9, capacity: 6, image_url: "https://images.unsplash.com/photo-1553621042-f6e147245754?w=900&q=85", short_description: "12-course traditional kaiseki", description: "Multi-course haute cuisine in a traditional ryotei overlooking a private moss garden.", opening_hours: "5:00 PM - 10:00 PM", featured: true, latitude: 35.012, longitude: 135.768 },
      { name: "Fushimi Inari Shrine Tour", city: "Kyoto", country: "Japan", type: "attraction", price_level: "budget", avg_price: 25, rating: 4.9, capacity: 12, image_url: "https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=900&q=85", short_description: "Walk the famous torii gates", description: "Guided morning hike through 10,000 vermillion gates with stories of the Inari kami.", opening_hours: "5:30 AM - 7:00 PM", featured: true, latitude: 34.967, longitude: 135.772 },
      { name: "Tea Ceremony in Gion", city: "Kyoto", country: "Japan", type: "event", price_level: "moderate", avg_price: 55, rating: 4.7, capacity: 6, image_url: "https://images.unsplash.com/photo-1578469645742-46cae010e5d4?w=900&q=85", short_description: "Authentic matcha experience", description: "60-minute tea ceremony in a 200-year-old machiya guided by a certified tea master.", opening_hours: "10:00 AM - 5:00 PM", event_date: "Daily" },

      // SANTORINI
      { name: "Sunset Catamaran Cruise", city: "Santorini", country: "Greece", type: "event", price_level: "premium", avg_price: 110, rating: 4.8, capacity: 10, image_url: "https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=900&q=85", short_description: "5-hour cruise with dinner", description: "Sail past the volcanic caldera, swim in hot springs, and enjoy a Greek dinner as the sun sets over Oia.", opening_hours: "3:00 PM - 8:00 PM", featured: true, latitude: 36.393, longitude: 25.461 },
      { name: "Cliffside Suite — Oia", city: "Santorini", country: "Greece", type: "hotel", price_level: "luxury", avg_price: 480, rating: 4.9, capacity: 2, image_url: "https://images.unsplash.com/photo-1602343168117-bb8ffe3e2e9f?w=900&q=85", short_description: "Private plunge pool + caldera view", description: "Iconic cave-style suite carved into the cliff with 180° caldera views and a heated infinity plunge pool.", opening_hours: "24/7", latitude: 36.461, longitude: 25.376 },
      { name: "Ammoudi Bay Seafood", city: "Santorini", country: "Greece", type: "restaurant", price_level: "premium", avg_price: 85, rating: 4.7, capacity: 6, image_url: "https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=900&q=85", short_description: "Fresh-catch tavernas by the water", description: "Family-run taverna at the foot of Oia where the day's catch is served on a candlelit dock.", opening_hours: "12:00 PM - 11:30 PM" },

      // BALI
      { name: "Ubud Rice Terrace Trek", city: "Bali", country: "Indonesia", type: "attraction", price_level: "budget", avg_price: 35, rating: 4.7, capacity: 10, image_url: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=900&q=85", short_description: "Half-day guided trek", description: "Trek through the Tegalalang and Tegallantang rice terraces with stops at coffee plantations.", opening_hours: "6:00 AM - 6:00 PM", featured: true, latitude: -8.34, longitude: 115.09 },
      { name: "Beachfront Villa — Seminyak", city: "Bali", country: "Indonesia", type: "hotel", price_level: "premium", avg_price: 320, rating: 4.8, capacity: 4, image_url: "https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=900&q=85", short_description: "Private pool + butler service", description: "3-bedroom beachfront villa with private pool, daily breakfast, and dedicated butler.", opening_hours: "24/7" },
      { name: "Yoga & Sound Healing Retreat", city: "Bali", country: "Indonesia", type: "event", price_level: "moderate", avg_price: 70, rating: 4.9, capacity: 15, image_url: "https://images.unsplash.com/photo-1545389336-cf090694435e?w=900&q=85", short_description: "Morning class in jungle studio", description: "90-minute Vinyasa flow followed by 60 minutes of singing-bowl sound healing.", opening_hours: "7:00 AM - 9:00 AM" },

      // DUBAI
      { name: "Burj Khalifa At The Top SKY", city: "Dubai", country: "UAE", type: "attraction", price_level: "premium", avg_price: 150, rating: 4.7, capacity: 4, image_url: "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=900&q=85", short_description: "Floor 148 + lounge access", description: "Highest observation deck in the world (555m) with refreshments and priority elevator access.", opening_hours: "8:30 AM - 11:00 PM", featured: true, latitude: 25.197, longitude: 55.274 },
      { name: "Desert Safari with Bedouin Dinner", city: "Dubai", country: "UAE", type: "event", price_level: "moderate", avg_price: 90, rating: 4.8, capacity: 8, image_url: "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=900&q=85", short_description: "Dune bashing + camel ride + dinner", description: "Afternoon dune bashing in 4x4s, sandboarding, falconry, camel ride, and a 5-course Bedouin BBQ under the stars.", opening_hours: "3:00 PM - 10:00 PM" },

      // MARRAKECH
      { name: "Riad El Fenn", city: "Marrakech", country: "Morocco", type: "hotel", price_level: "luxury", avg_price: 280, rating: 4.8, capacity: 2, image_url: "https://images.unsplash.com/photo-1489493585363-d69421e0edd3?w=900&q=85", short_description: "Restored riad in Medina", description: "Boutique luxury riad in the heart of the Medina with 6 internal courtyards and rooftop hammam.", opening_hours: "24/7", featured: true, latitude: 31.625, longitude: -7.989 },
      { name: "Jemaa el-Fnaa Food Tour", city: "Marrakech", country: "Morocco", type: "event", price_level: "budget", avg_price: 40, rating: 4.7, capacity: 8, image_url: "https://images.unsplash.com/photo-1597212618440-806262de4f6b?w=900&q=85", short_description: "Evening street food walk", description: "3-hour tour of the famous square — try tagine, b'stilla, harira, and mint tea with a local foodie.", opening_hours: "6:00 PM - 9:00 PM" },

      // NEW YORK
      { name: "Top of the Rock Observatory", city: "New York", country: "USA", type: "attraction", price_level: "moderate", avg_price: 40, rating: 4.7, capacity: 6, image_url: "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=900&q=85", short_description: "Sunset views of Manhattan", description: "70 floors up at Rockefeller Center with views of Central Park and the Empire State Building.", opening_hours: "9:00 AM - 11:00 PM", featured: true, latitude: 40.759, longitude: -73.979 },
      { name: "Brooklyn Pizza Tour", city: "New York", country: "USA", type: "event", price_level: "budget", avg_price: 65, rating: 4.8, capacity: 10, image_url: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=900&q=85", short_description: "3-hour walking food tour", description: "Visit 4 legendary Brooklyn pizzerias with stops at Di Fara, Roberta's, and L&B Spumoni Gardens.", opening_hours: "11:00 AM - 4:00 PM" },
      { name: "Broadway Show Premium Seats", city: "New York", country: "USA", type: "event", price_level: "premium", avg_price: 175, rating: 4.9, capacity: 4, image_url: "https://images.unsplash.com/photo-1503095396549-807759245b35?w=900&q=85", short_description: "Orchestra seats + program", description: "Best-available orchestra seats for current Broadway productions. Program guide included.", opening_hours: "Show times vary" },

      // MALDIVES
      { name: "Overwater Villa — Soneva Jani", city: "Maldives", country: "Maldives", type: "hotel", price_level: "luxury", avg_price: 950, rating: 5.0, capacity: 2, image_url: "https://images.unsplash.com/photo-1573843981267-be1999ff37cd?w=900&q=85", short_description: "Private slide into lagoon", description: "1-bedroom overwater villa with a slide directly into the lagoon, retractable roof, and personal Mr/Mrs Friday.", opening_hours: "24/7", featured: true },
      { name: "Manta Ray Snorkel Excursion", city: "Maldives", country: "Maldives", type: "event", price_level: "premium", avg_price: 130, rating: 4.9, capacity: 6, image_url: "https://images.unsplash.com/photo-1582967788606-a171c1080cb0?w=900&q=85", short_description: "Half-day boat trip", description: "Snorkel with manta rays at Hanifaru Bay. Includes equipment, lunch, and marine biologist guide.", opening_hours: "8:00 AM - 1:00 PM" },

      // PATAGONIA
      { name: "Perito Moreno Glacier Trek", city: "Patagonia", country: "Argentina", type: "event", price_level: "premium", avg_price: 180, rating: 4.9, capacity: 8, image_url: "https://images.unsplash.com/photo-1501854140801-50d01698950b?w=900&q=85", short_description: "Mini-trekking on the ice", description: "Strap on crampons and hike the iconic glacier with certified guides.", opening_hours: "8:00 AM - 4:00 PM", featured: true },
      { name: "Estancia Cristina Lodge", city: "Patagonia", country: "Argentina", type: "hotel", price_level: "luxury", avg_price: 540, rating: 4.8, capacity: 4, image_url: "https://images.unsplash.com/photo-1551632436-cbf8dd35adfa?w=900&q=85", short_description: "Remote lodge with full board", description: "Historic estancia accessible only by boat. Includes all meals and guided excursions.", opening_hours: "24/7" },

      // MACHU PICCHU
      { name: "Inca Trail 4-Day Trek", city: "Machu Picchu", country: "Peru", type: "event", price_level: "premium", avg_price: 750, rating: 4.9, capacity: 10, image_url: "https://images.unsplash.com/photo-1587595431973-160d0d94add1?w=900&q=85", short_description: "Classic 45km Inca Trail", description: "4-day guided trek to Machu Picchu via the original Inca Trail.", opening_hours: "Daily departures", featured: true },
      { name: "Sacred Valley Day Tour", city: "Machu Picchu", country: "Peru", type: "event", price_level: "moderate", avg_price: 95, rating: 4.7, capacity: 12, image_url: "https://images.unsplash.com/photo-1531065208531-4036c0dba3ca?w=900&q=85", short_description: "Pisac, Ollantaytambo, lunch", description: "Full-day tour through the Sacred Valley.", opening_hours: "8:00 AM - 7:00 PM" },

      // LONDON
      { name: "British Museum Highlights Tour", city: "London", country: "United Kingdom", type: "attraction", price_level: "budget", avg_price: 30, rating: 4.8, capacity: 12, image_url: "https://images.unsplash.com/photo-1486299267070-83823f5448dd?w=900&q=85", short_description: "Rosetta Stone, Elgin Marbles, more", description: "2-hour guided highlights tour of the British Museum's most iconic objects.", opening_hours: "10:00 AM - 5:00 PM", featured: true, latitude: 51.519, longitude: -0.127 },
      { name: "The Shard High Tea", city: "London", country: "United Kingdom", type: "restaurant", price_level: "premium", avg_price: 95, rating: 4.6, capacity: 4, image_url: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=900&q=85", short_description: "Afternoon tea on floor 31", description: "Classic British afternoon tea with panoramic skyline views from The Shard.", opening_hours: "12:00 PM - 5:00 PM" },
    ];
    await Place.insertMany(seedData.map(p => ({ ...p, created_by: 'system', tags: [p.type, p.price_level] })));
    console.log('🌱 Seeded ' + seedData.length + ' bookable places into database');
  } catch (e) { console.warn('⚠️ Seed error:', e.message); }
}

// ─── Booking availability check ───────────────────────────────────────────────
app.get('/api/bookings/availability', authMiddleware, async (req, res) => {
  try {
    const { place_id, date, time } = req.query;
    if (!place_id || !date) return res.status(400).json({ error: 'place_id and date required' });
    const place = await Place.findById(place_id);
    if (!place) return res.status(404).json({ error: 'Place not found' });
    const cap = place.capacity || 4;
    const filter = { place_id, booking_date: date, status: { $in: ['confirmed', 'pending'] } };
    if (time) filter.booking_time = time;
    const taken = await Booking.find(filter);
    const used = taken.reduce((s, b) => s + (b.guests || 1), 0);
    const remaining = Math.max(0, cap - used);
    const available = used < cap;
    let message = '';
    if (!available) message = 'This place is fully booked on ' + date + (time ? ' at ' + time : '') + '. Try another date or time.';
    else if (remaining <= 2) message = 'Hurry — only ' + remaining + ' spot(s) left on this date.';
    res.json({ available, remaining, capacity: cap, message });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Trip routes ──────────────────────────────────────────────────────────────
// Trips own a date range; bookings within them sit on a specific calendar day.
app.get('/api/trips', authMiddleware, async (req, res) => {
  try {
    const trips = await Trip.find({ created_by: req.userEmail }).sort({ start_date: -1 }).lean();
    res.json(trips.map(t => { t.id = t._id?.toString(); delete t._id; delete t.__v; return t; }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/trips/:id', authMiddleware, async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id).lean();
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    if (trip.created_by !== req.userEmail) return res.status(403).json({ error: 'Forbidden' });
    trip.id = trip._id.toString(); delete trip._id; delete trip.__v;
    const bookings = await Booking.find({ created_by: req.userEmail, trip_id: trip.id }).sort({ booking_date: 1 }).lean();
    trip.bookings = bookings.map(b => { b.id = b._id.toString(); delete b._id; delete b.__v; return b; });
    res.json(trip);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/trips', authMiddleware, async (req, res) => {
  try {
    let { destination_country, destination_city, start_date, end_date, travelers, budget, notes, cover_image } = req.body;
    if (!destination_country || !start_date || !end_date) return res.status(400).json({ error: 'destination_country, start_date and end_date are required' });
    start_date = isoDate(start_date); end_date = isoDate(end_date);
    if (start_date > end_date) return res.status(400).json({ error: 'End date must be on or after the start date' });

    // Date conflict check: any non-cancelled trip overlapping this range
    const overlapping = await Trip.findOne({
      created_by: req.userEmail,
      status: { $in: ['planned', 'active', 'completed'] },
      start_date: { $lte: end_date },
      end_date: { $gte: start_date },
    });
    if (overlapping) {
      return res.status(409).json({
        error: 'You already have a trip to ' + (overlapping.destination_city ? overlapping.destination_city + ', ' : '') + overlapping.destination_country + ' during this period (' + overlapping.start_date + ' → ' + overlapping.end_date + ')',
        conflict: { id: overlapping._id.toString(), destination_country: overlapping.destination_country, destination_city: overlapping.destination_city, start_date: overlapping.start_date, end_date: overlapping.end_date },
      });
    }

    // 24h cooldown: cannot rebook same dest+date range that was cancelled in the last 24h
    const recentCancel = await Trip.findOne({
      created_by: req.userEmail,
      status: 'cancelled',
      destination_country, start_date, end_date,
      cancelled_at: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });
    if (recentCancel) return res.status(429).json({ error: 'You cancelled an identical trip in the last 24 hours. Please wait before re-booking.' });

    const trip = await Trip.create({
      created_by: req.userEmail, destination_country, destination_city: destination_city || '',
      start_date, end_date, travelers: travelers || 1, budget: budget || 0, notes: notes || '', cover_image: cover_image || '',
    });
    awardPoints(req.userEmail, 50, 'Created trip', { trip_id: trip._id.toString(), destination: destination_country });
    Notification.create({ created_by: req.userEmail, title: 'Trip created', message: 'Your trip to ' + destination_country + ' is set for ' + start_date + ' → ' + end_date + ' (+50 pts)', type: 'trip_reminder', link: '/bookings' }).catch(() => { });
    res.status(201).json(toJSON(trip));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/trips/:id', authMiddleware, async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    if (trip.created_by !== req.userEmail) return res.status(403).json({ error: 'Forbidden' });

    const fields = ['destination_country', 'destination_city', 'start_date', 'end_date', 'travelers', 'budget', 'notes', 'cover_image', 'status'];
    const updates = {};
    fields.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    if (updates.start_date) updates.start_date = isoDate(updates.start_date);
    if (updates.end_date) updates.end_date = isoDate(updates.end_date);
    if (updates.start_date && updates.end_date && updates.start_date > updates.end_date) return res.status(400).json({ error: 'End date must be on or after the start date' });

    // If dates change, re-check conflicts
    if (updates.start_date || updates.end_date) {
      const newStart = updates.start_date || trip.start_date;
      const newEnd = updates.end_date || trip.end_date;
      const overlap = await Trip.findOne({
        _id: { $ne: trip._id },
        created_by: req.userEmail,
        status: { $in: ['planned', 'active', 'completed'] },
        start_date: { $lte: newEnd },
        end_date: { $gte: newStart },
      });
      if (overlap) return res.status(409).json({ error: 'New dates conflict with another trip (' + overlap.destination_country + ', ' + overlap.start_date + ' → ' + overlap.end_date + ')' });
    }

    if (updates.status === 'cancelled' && trip.status !== 'cancelled') {
      updates.cancelled_at = new Date();
    }

    Object.assign(trip, updates);
    trip.updated_date = new Date();
    await trip.save();
    res.json(toJSON(trip));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/trips/:id', authMiddleware, async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    if (trip.created_by !== req.userEmail) return res.status(403).json({ error: 'Forbidden' });
    // Soft-cancel by default to preserve history; pass ?hard=1 to delete
    if (req.query.hard) {
      await Booking.deleteMany({ created_by: req.userEmail, trip_id: trip._id.toString() });
      await Trip.findByIdAndDelete(trip._id);
    } else {
      trip.status = 'cancelled';
      trip.cancelled_at = new Date();
      await trip.save();
      // Cancel its child bookings too
      await Booking.updateMany({ created_by: req.userEmail, trip_id: trip._id.toString(), status: { $in: ['confirmed', 'pending'] } }, { $set: { status: 'cancelled', updated_date: new Date() } });
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Booking routes (trip-aware) ──────────────────────────────────────────────
app.get('/api/bookings', authMiddleware, async (req, res) => {
  try {
    const filter = { created_by: req.userEmail };
    if (req.query.trip_id) filter.trip_id = req.query.trip_id;
    if (req.query.status) filter.status = req.query.status;
    const items = await Booking.find(filter).sort({ booking_date: -1 }).limit(parseInt(req.query.limit) || 500).lean();
    res.json(items.map(b => { b.id = b._id.toString(); delete b._id; delete b.__v; return b; }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/bookings/:id', authMiddleware, async (req, res) => {
  try {
    const b = await Booking.findById(req.params.id).lean();
    if (!b) return res.status(404).json({ error: 'Not found' });
    b.id = b._id.toString(); delete b._id; delete b.__v;
    res.json(b);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/bookings', authMiddleware, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.place_name || !body.booking_date) return res.status(400).json({ error: 'place_name and booking_date are required' });
    const booking_date = isoDate(body.booking_date);

    // If trip_id supplied, ensure date is within the trip window
    if (body.trip_id) {
      const trip = await Trip.findById(body.trip_id);
      if (!trip || trip.created_by !== req.userEmail) return res.status(400).json({ error: 'Invalid trip' });
      if (booking_date < trip.start_date || booking_date > trip.end_date) {
        return res.status(400).json({ error: 'Booking date ' + booking_date + ' falls outside trip window (' + trip.start_date + ' → ' + trip.end_date + ')' });
      }
    }

    // Duplicate prevention: same user, same place, same date, not cancelled
    if (body.place_id || body.place_name) {
      const dup = await Booking.findOne({
        created_by: req.userEmail,
        booking_date,
        $or: [
          body.place_id ? { place_id: body.place_id } : null,
          body.place_name ? { place_name: body.place_name } : null,
        ].filter(Boolean),
        status: { $ne: 'cancelled' },
      });
      if (dup) return res.status(409).json({ error: 'Already booked for this date' });
    }

    const doc = await Booking.create({
      ...body, booking_date, created_by: req.userEmail,
      created_date: new Date(), updated_date: new Date(),
    });
    // Only award points for bookings that are immediately confirmed (free bookings).
    // Paid/pending bookings get their points when payment verifies (see /api/booking/verify).
    if ((doc.status || '').toLowerCase() === 'confirmed') {
      awardPoints(req.userEmail, 25, 'Booking added to trip', { booking_id: doc._id.toString(), place_name: body.place_name });
    }
    res.status(201).json(toJSON(doc));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/bookings/:id', authMiddleware, async (req, res) => {
  try {
    const before = await Booking.findById(req.params.id);
    if (!before) return res.status(404).json({ error: 'Not found' });
    const updates = { ...req.body, updated_date: new Date() };
    if (updates.booking_date) updates.booking_date = isoDate(updates.booking_date);
    const doc = await Booking.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true });
    res.json(toJSON(doc));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/bookings/:id', authMiddleware, async (req, res) => {
  try { await Booking.findByIdAndDelete(req.params.id); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Trip lifecycle sweep — runs every hour. Awards +100 when start_date passes
// and +200 when end_date passes (each at most once per trip).
async function sweepTripLifecycle() {
  try {
    const today = todayISO();

    // Started: trips whose start <= today and not yet awarded
    const started = await Trip.find({ status: { $in: ['planned', 'active', 'completed'] }, start_date: { $lte: today }, points_started_awarded: false });
    for (const t of started) {
      t.points_started_awarded = true;
      if (t.status === 'planned') t.status = 'active';
      await t.save();
      awardPoints(t.created_by, 100, 'Trip started', { trip_id: t._id.toString(), destination: t.destination_country });
      Notification.create({ created_by: t.created_by, title: 'Trip started!', message: 'Your trip to ' + t.destination_country + ' has begun. Have a great time! (+100 pts)', type: 'trip_reminder', link: '/bookings' }).catch(() => { });
    }

    // Completed: trips whose end < today and not yet awarded
    const ended = await Trip.find({ status: { $in: ['planned', 'active', 'completed'] }, end_date: { $lt: today }, points_completed_awarded: false });
    for (const t of ended) {
      t.points_completed_awarded = true;
      t.status = 'completed';
      await t.save();
      awardPoints(t.created_by, 200, 'Trip completed', { trip_id: t._id.toString(), destination: t.destination_country });
      Notification.create({ created_by: t.created_by, title: 'Trip completed', message: 'Welcome back from ' + t.destination_country + '! +200 points awarded.', type: 'trip_reminder', link: '/bookings' }).catch(() => { });
    }
  } catch (e) { console.warn('Trip lifecycle sweep error:', e.message); }
}
setInterval(sweepTripLifecycle, 60 * 60 * 1000);
setTimeout(sweepTripLifecycle, 5000);  // also run shortly after boot

// ─── Stripe billing ───────────────────────────────────────────────────────────
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const STRIPE_PRICE_MEDIUM = process.env.STRIPE_PRICE_MEDIUM || '';
const STRIPE_PRICE_HIGH = process.env.STRIPE_PRICE_HIGH || '';
const APP_URL = process.env.APP_URL || ('http://localhost:' + PORT);

let stripe = null;
if (STRIPE_SECRET_KEY) {
  try { stripe = require('stripe')(STRIPE_SECRET_KEY); }
  catch (e) { console.warn('Stripe init failed:', e.message); }
}

const PLAN_TO_PRICE = { medium: STRIPE_PRICE_MEDIUM, high: STRIPE_PRICE_HIGH };

app.post('/api/billing/checkout', authMiddleware, async (req, res) => {
  try {
    const { plan, coupon } = req.body;
    if (!['medium', 'high'].includes(plan)) return res.status(400).json({ error: 'Invalid plan' });
    if (!stripe || !PLAN_TO_PRICE[plan]) {
      return res.status(503).json({ error: 'Stripe not configured. Contact us at hello@explorex.app to subscribe.', contact: true });
    }

    const u = await User.findById(req.userId);
    if (!u) return res.status(404).json({ error: 'User not found' });

    let customerId = u.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: u.email, name: u.full_name });
      customerId = customer.id;
      u.stripe_customer_id = customerId;
      await u.save();
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: PLAN_TO_PRICE[plan], quantity: 1 }],
      discounts: coupon ? [{ coupon }] : undefined,
      // Stripe replaces {CHECKOUT_SESSION_ID} with the real session ID in the
      // redirect URL — we use that on the pricing page to verify the payment
      // server-side and upgrade the plan immediately, so we don't have to rely
      // on the webhook firing in local dev.
      success_url: APP_URL + '/pricing?status=success&session_id={CHECKOUT_SESSION_ID}',
      cancel_url: APP_URL + '/pricing?status=cancelled',
      metadata: { user_id: req.userId, plan },
    });
    res.json({ url: session.url });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Verify a completed Checkout session and upgrade the user's plan.
// Called from the frontend after a Stripe success redirect — works even
// without a webhook configured (great for local dev / Stripe sandbox).
app.post('/api/billing/verify', authMiddleware, async (req, res) => {
  try {
    if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });
    const { session_id } = req.body || {};
    if (!session_id) return res.status(400).json({ error: 'session_id required' });

    const session = await stripe.checkout.sessions.retrieve(session_id, { expand: ['subscription'] });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    // Only honor sessions whose metadata user_id matches the caller — prevents
    // anyone from upgrading another user's plan by guessing a session ID.
    if (session.metadata?.user_id !== req.userId) {
      return res.status(403).json({ error: 'Session does not belong to this user' });
    }

    const plan = session.metadata?.plan;
    if (!['medium', 'high'].includes(plan)) return res.status(400).json({ error: 'Invalid plan in session' });

    if (session.payment_status !== 'paid' && session.status !== 'complete') {
      return res.status(409).json({ error: 'Payment not completed yet', payment_status: session.payment_status });
    }

    // Determine when the membership runs out. For a subscription, use the
    // subscription's current_period_end if available; otherwise default to +1 month.
    let until = new Date(); until.setMonth(until.getMonth() + 1);
    let subId = '';
    if (session.subscription) {
      subId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
      if (typeof session.subscription === 'object' && session.subscription.current_period_end) {
        until = new Date(session.subscription.current_period_end * 1000);
      }
    }

    const u = await User.findById(req.userId);
    if (!u) return res.status(404).json({ error: 'User not found' });
    u.membership = plan;
    u.membership_until = until;
    u.trial_active = false;  // Deactivate trial once user has a paid subscription
    if (subId) u.stripe_subscription_id = subId;
    await u.save();

    return res.json({
      ok: true,
      plan,
      membership_until: until,
      message: 'Welcome to ' + plan.charAt(0).toUpperCase() + plan.slice(1) + ' plan!',
    });
  } catch (e) {
    console.error('Stripe verify error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/billing/portal', authMiddleware, async (req, res) => {
  try {
    if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });
    const u = await User.findById(req.userId);
    if (!u || !u.stripe_customer_id) return res.status(400).json({ error: 'No Stripe customer for this user' });
    const session = await stripe.billingPortal.sessions.create({ customer: u.stripe_customer_id, return_url: APP_URL + '/profile' });
    res.json({ url: session.url });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Booking payment ──────────────────────────────────────────────────────────
// One-time Stripe checkout for a single booking. The booking is stored as
// pending=true&status=pending, and only flipped to confirmed after the user
// returns from a successful Stripe checkout (verified server-side).
app.post('/api/booking/checkout', authMiddleware, async (req, res) => {
  try {
    if (!stripe) return res.status(503).json({ error: 'Stripe not configured', contact: true });
    const { booking_id } = req.body || {};
    if (!booking_id) return res.status(400).json({ error: 'booking_id required' });

    const b = await Booking.findById(booking_id);
    if (!b) return res.status(404).json({ error: 'Booking not found' });
    if (b.created_by !== req.userEmail) return res.status(403).json({ error: 'Not your booking' });
    if (!b.total_price || b.total_price <= 0) return res.status(400).json({ error: 'Booking has no payable amount' });
    if (b.payment_status === 'paid') return res.status(409).json({ error: 'Booking already paid' });

    const u = await User.findById(req.userId);
    let customerId = u.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: u.email, name: u.full_name });
      customerId = customer.id;
      u.stripe_customer_id = customerId;
      await u.save();
    }

    // Stripe charges integers in the smallest unit. AED has 2 decimals, so
    // multiply by 100. We charge in AED to match the platform's pricing currency.
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      line_items: [{
        price_data: {
          currency: 'aed',
          product_data: {
            name: b.place_name + (b.booking_date ? ' — ' + b.booking_date : ''),
            description: 'ExploreX booking · ' + (b.guests || 1) + ' guest(s)',
          },
          unit_amount: Math.round(b.total_price * 100),
        },
        quantity: 1,
      }],
      success_url: APP_URL + '/bookings?payment=success&booking_id=' + b._id + '&session_id={CHECKOUT_SESSION_ID}',
      cancel_url: APP_URL + '/bookings?payment=cancelled&booking_id=' + b._id,
      metadata: { user_id: req.userId, booking_id: b._id.toString(), kind: 'booking_payment' },
    });

    // Mark booking as payment-pending so it shows up correctly in the UI
    b.status = 'pending';
    b.payment_status = 'pending';
    b.stripe_session_id = session.id;
    await b.save();

    res.json({ url: session.url });
  } catch (e) {
    console.error('Booking checkout error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Verify a booking payment session. Same approach as the plan verify endpoint —
// works without a webhook for local dev / Stripe sandbox.
app.post('/api/booking/verify', authMiddleware, async (req, res) => {
  try {
    if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });
    const { session_id, booking_id } = req.body || {};
    if (!session_id) return res.status(400).json({ error: 'session_id required' });

    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.metadata?.user_id !== req.userId) return res.status(403).json({ error: 'Not your session' });

    const bId = booking_id || session.metadata?.booking_id;
    if (!bId) return res.status(400).json({ error: 'booking_id missing' });

    const b = await Booking.findById(bId);
    if (!b) return res.status(404).json({ error: 'Booking not found' });
    if (b.created_by !== req.userEmail) return res.status(403).json({ error: 'Not your booking' });

    if (session.payment_status !== 'paid') {
      return res.status(409).json({ error: 'Payment not completed', payment_status: session.payment_status });
    }

    b.status = 'confirmed';
    b.payment_status = 'paid';
    b.payment_amount = (session.amount_total || 0) / 100;
    b.payment_method = 'stripe';
    await b.save();

    // Award the +25 booking points now that the booking is actually paid for.
    // Avoid double-awards if this endpoint is hit twice for the same booking.
    const already = await PointsLog.findOne({ created_by: req.userEmail, reason: 'Booking added paid', 'meta.booking_id': b._id.toString() });
    if (!already) {
      awardPoints(req.userEmail, 25, 'Booking added paid', { booking_id: b._id.toString(), place_name: b.place_name });
    }

    return res.json({ ok: true, booking_id: b._id, status: b.status, message: 'Booking confirmed!' });
  } catch (e) {
    console.error('Booking verify error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) return res.status(503).send('Stripe webhook not configured');
  let event;
  try { event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET); }
  catch (e) { return res.status(400).send('Webhook signature failed: ' + e.message); }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = session.metadata?.user_id;
      const plan = session.metadata?.plan;
      if (userId && plan) {
        const until = new Date(); until.setMonth(until.getMonth() + 1);
        await User.findByIdAndUpdate(userId, { $set: { membership: plan, membership_until: until, stripe_subscription_id: session.subscription, trial_active: false } });
      }
    }
    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      await User.updateOne({ stripe_subscription_id: sub.id }, { $set: { membership: 'free', stripe_subscription_id: '' } });
    }
    res.json({ received: true });
  } catch (e) { res.status(500).send(e.message); }
});

// Public offers config (frontend reads this)
app.get('/api/billing/offers', (_req, res) => {
  res.json({
    coupons: [
      { code: 'WELCOME20', label: 'First month 20% off', desc: 'New subscribers' },
      { code: 'TRYHIGH', label: 'Try Max plan -30%', desc: 'Limited promo' },
    ],
    pro: { price: 30, currency: 'AED' },
    max: { price: 65, currency: 'AED' },
  });
});

// ─── Connection-only messaging guard ──────────────────────────────────────────
async function areConnected(emailA, emailB) {
  const c = await Connection.findOne({
    status: 'accepted',
    $or: [{ from_user: emailA, to_user: emailB }, { from_user: emailB, to_user: emailA }],
  });
  return !!c;
}
const _origMessageCreate = Message.create.bind(Message);
Message.create = async function (data) {
  if (data.sender_email && data.receiver_email && data.sender_email !== data.receiver_email) {
    const ok = await areConnected(data.sender_email, data.receiver_email);
    if (!ok) { const err = new Error('You can only message accepted connections'); err.status = 403; throw err; }
  }
  return _origMessageCreate(data);
};

// Public config (safe values exposed to frontend)
app.get('/api/config/public', (_req, res) => {
  res.json({
    google_client_id: GOOGLE_CLIENT_ID || null,
    has_stripe: !!stripe,
    has_groq: !!GROQ_API_KEY,
    has_unsplash: !!UNSPLASH_ACCESS_KEY,
    has_weather: !!OPENWEATHER_API_KEY,
  });
});

// ─── Weather Route ────────────────────────────────────────────────────────────
app.get('/api/weather', authMiddleware, async (req, res) => {
  try {
    const rawCity = (req.query.city || 'Dubai').trim();
    const city = rawCity;

    // Common country → capital map. Used when the user types a country name
    // ("France") rather than a city ("Paris"), since OpenWeatherMap's free
    // /weather endpoint takes city names and 404s on country-only queries.
    const COUNTRY_TO_CAPITAL = {
      'france': 'Paris', 'japan': 'Tokyo', 'italy': 'Rome', 'spain': 'Madrid', 'germany': 'Berlin',
      'united kingdom': 'London', 'uk': 'London', 'england': 'London', 'greece': 'Athens',
      'usa': 'New York', 'united states': 'New York', 'united states of america': 'New York',
      'india': 'New Delhi', 'china': 'Beijing', 'uae': 'Dubai', 'united arab emirates': 'Dubai',
      'thailand': 'Bangkok', 'vietnam': 'Hanoi', 'indonesia': 'Jakarta', 'singapore': 'Singapore',
      'philippines': 'Manila', 'malaysia': 'Kuala Lumpur', 'south korea': 'Seoul', 'korea': 'Seoul',
      'australia': 'Sydney', 'new zealand': 'Auckland', 'canada': 'Toronto', 'mexico': 'Mexico City',
      'brazil': 'Rio de Janeiro', 'argentina': 'Buenos Aires', 'chile': 'Santiago', 'peru': 'Lima',
      'colombia': 'Bogota', 'venezuela': 'Caracas', 'egypt': 'Cairo', 'morocco': 'Marrakech',
      'south africa': 'Cape Town', 'kenya': 'Nairobi', 'nigeria': 'Lagos', 'turkey': 'Istanbul',
      'russia': 'Moscow', 'ukraine': 'Kyiv', 'poland': 'Warsaw', 'sweden': 'Stockholm',
      'norway': 'Oslo', 'finland': 'Helsinki', 'denmark': 'Copenhagen', 'netherlands': 'Amsterdam',
      'belgium': 'Brussels', 'switzerland': 'Zurich', 'austria': 'Vienna', 'portugal': 'Lisbon',
      'ireland': 'Dublin', 'iceland': 'Reykjavik', 'czech republic': 'Prague', 'hungary': 'Budapest',
      'croatia': 'Zagreb', 'serbia': 'Belgrade', 'romania': 'Bucharest', 'bulgaria': 'Sofia',
      'qatar': 'Doha', 'saudi arabia': 'Riyadh', 'kuwait': 'Kuwait City', 'oman': 'Muscat',
      'bahrain': 'Manama', 'jordan': 'Amman', 'lebanon': 'Beirut', 'israel': 'Tel Aviv',
      'iran': 'Tehran', 'iraq': 'Baghdad', 'pakistan': 'Karachi', 'bangladesh': 'Dhaka',
      'sri lanka': 'Colombo', 'nepal': 'Kathmandu', 'myanmar': 'Yangon', 'cambodia': 'Phnom Penh',
      'laos': 'Vientiane', 'taiwan': 'Taipei', 'hong kong': 'Hong Kong',
    };

    // Build the list of city candidates to try. We try the user's input first;
    // if it 404s and looks like a country name, we silently retry with the capital.
    const candidates = [city];
    const lower = city.toLowerCase();
    if (COUNTRY_TO_CAPITAL[lower] && COUNTRY_TO_CAPITAL[lower].toLowerCase() !== lower) {
      candidates.push(COUNTRY_TO_CAPITAL[lower]);
    }

    if (OPENWEATHER_API_KEY) {
      let w = null, used = null, lastError = null;
      for (const candidate of candidates) {
        try {
          const r = await fetch('https://api.openweathermap.org/data/2.5/weather?q=' + encodeURIComponent(candidate) + '&appid=' + OPENWEATHER_API_KEY + '&units=metric');
          if (r.ok) {
            w = await r.json();
            used = candidate;
            break;
          }
          // Treat 404 as "city not found, try next candidate". Other statuses
          // (401 invalid key, 429 rate-limited, 5xx) get noted and we still try.
          lastError = 'OpenWeatherMap ' + r.status;
        } catch (err) { lastError = err.message; }
      }

      if (!w) {
        // Couldn't find any of the candidate cities. Instead of a 500 error,
        // gracefully fall through to the mock so the user still sees something.
        console.warn('Weather: ' + lastError + ' for "' + city + '" — falling back to mock data');
      } else {
        const rf = await fetch('https://api.openweathermap.org/data/2.5/forecast?q=' + encodeURIComponent(used) + '&appid=' + OPENWEATHER_API_KEY + '&units=metric&cnt=24');
        const wf = rf.ok ? await rf.json() : null;

        const dayMap = {};
        if (wf && wf.list) {
          wf.list.forEach(item => {
            const day = new Date(item.dt * 1000).toLocaleDateString('en-US', { weekday: 'long' });
            if (!dayMap[day]) dayMap[day] = { highs: [], lows: [], desc: item.weather[0].main };
            dayMap[day].highs.push(item.main.temp_max);
            dayMap[day].lows.push(item.main.temp_min);
          });
        }
        const forecast = Object.entries(dayMap).slice(0, 3).map(([day, d]) => ({
          day,
          high: Math.round(Math.max(...d.highs)) + '°C',
          low: Math.round(Math.min(...d.lows)) + '°C',
          conditions: d.desc,
        }));

        const temp = Math.round(w.main.temp);
        const feelsLike = Math.round(w.main.feels_like);
        const cond = w.weather[0].main;
        const humid = w.main.humidity + '%';
        const wind = Math.round(w.wind.speed * 3.6) + ' km/h';

        let outfits = ['Comfortable walking shoes'];
        if (temp < 10) outfits = ['Heavy coat', 'Scarf', 'Warm layers', 'Boots'];
        else if (temp < 18) outfits = ['Light jacket', 'Layered clothing', 'Comfortable shoes'];
        else if (temp < 26) outfits = ['Light clothing', 'Sunglasses', 'Comfortable footwear'];
        else outfits = ['Lightweight breathable clothes', 'Sun hat', 'Sunscreen', 'Sunglasses'];
        if (/rain|drizzle/i.test(cond)) { outfits.push('Umbrella'); outfits.push('Waterproof jacket'); }

        const activities = temp > 20 && !/rain/i.test(cond)
          ? [{ activity: 'Outdoor sightseeing', reason: 'Perfect weather for exploring' }, { activity: 'Outdoor dining', reason: 'Great patio weather' }]
          : [{ activity: 'Museum visit', reason: 'Great indoor activity for the weather' }, { activity: 'Local café crawl', reason: 'Cozy indoor exploration' }];

        return res.json({
          city: w.name || used, requested: rawCity,
          source: used !== rawCity ? 'openweathermap (capital fallback)' : 'openweathermap',
          current: { temperature: temp + '°C', conditions: cond, humidity: humid, wind, feels_like: feelsLike + '°C' },
          forecast: forecast.length ? forecast : [
            { day: 'Today', high: (temp + 2) + '°C', low: (temp - 6) + '°C', conditions: cond },
            { day: 'Tomorrow', high: (temp + 3) + '°C', low: (temp - 5) + '°C', conditions: 'Partly Cloudy' },
            { day: 'Day After', high: (temp - 1) + '°C', low: (temp - 7) + '°C', conditions: 'Sunny' },
          ],
          outfit_suggestions: outfits,
          activity_recommendations: activities,
          things_to_avoid: temp > 35 ? ['Midday outdoor activities', 'Dark clothing'] : temp < 5 ? ['Light clothing outdoors', 'Extended outdoor exposure'] : [],
        });
      }
    }

    // Fallback mock (no API key, OR all candidates 404'd)
    const mockTemps = { Dubai: 38, London: 14, Paris: 18, Tokyo: 22, Bali: 30, 'New York': 17, Kyoto: 20, Santorini: 26, Marrakech: 28, Maldives: 31 };
    // Try the original city, then the mapped capital, then 22°C default
    const mockKey = mockTemps[city] != null ? city : (COUNTRY_TO_CAPITAL[lower] && mockTemps[COUNTRY_TO_CAPITAL[lower]] != null ? COUNTRY_TO_CAPITAL[lower] : null);
    const t = mockKey ? mockTemps[mockKey] : 22;
    return res.json({
      city: mockKey || city, requested: rawCity, source: 'mock',
      current: { temperature: t + '°C', conditions: 'Partly Cloudy', humidity: '58%', wind: '12 km/h', feels_like: (t - 2) + '°C' },
      forecast: [
        { day: 'Today', high: (t + 2) + '°C', low: (t - 6) + '°C', conditions: 'Partly Cloudy' },
        { day: 'Tomorrow', high: (t + 4) + '°C', low: (t - 5) + '°C', conditions: 'Sunny' },
        { day: 'Day After', high: (t - 1) + '°C', low: (t - 8) + '°C', conditions: 'Light Rain' },
      ],
      outfit_suggestions: t > 28 ? ['Lightweight clothes', 'Sun hat', 'Sunscreen', 'Sunglasses'] : ['Light layers', 'Comfortable shoes', 'Light jacket'],
      activity_recommendations: [
        { activity: 'Outdoor sightseeing', reason: 'Pleasant conditions for walking tours' },
        { activity: 'Outdoor dining', reason: 'Great weather for patios' },
      ],
      things_to_avoid: t > 35 ? ['Midday sun exposure', 'Dark clothing'] : [],
    });
  } catch (e) {
    console.error('Weather error:', e.message);
    // Even on unexpected errors, return mock data instead of a 500 — the user
    // shouldn't see a broken page just because the weather lookup failed.
    return res.json({
      city: req.query.city || 'Unknown', source: 'mock-fallback', error: e.message,
      current: { temperature: '22°C', conditions: 'Partly Cloudy', humidity: '60%', wind: '10 km/h', feels_like: '21°C' },
      forecast: [
        { day: 'Today', high: '24°C', low: '18°C', conditions: 'Partly Cloudy' },
        { day: 'Tomorrow', high: '26°C', low: '19°C', conditions: 'Sunny' },
        { day: 'Day After', high: '23°C', low: '17°C', conditions: 'Light Rain' },
      ],
      outfit_suggestions: ['Light layers', 'Comfortable shoes'],
      activity_recommendations: [{ activity: 'Sightseeing', reason: 'Mild conditions today' }],
      things_to_avoid: [],
    });
  }
});

// ─── Entity Routes ────────────────────────────────────────────────────────────
// Note: Trip and Booking have dedicated handlers above; the remaining entities
// use the generic CRUD factory.
app.use('/api/entities/Connection', entityRouter('Connection'));
app.use('/api/entities/Itinerary', entityRouter('Itinerary'));
app.use('/api/entities/Message', entityRouter('Message'));
app.use('/api/entities/Notification', entityRouter('Notification'));
app.use('/api/entities/Place', entityRouter('Place'));
app.use('/api/entities/Subscription', entityRouter('Subscription'));
app.use('/api/entities/TripInvite', entityRouter('TripInvite'));
app.use('/api/entities/Favorite', entityRouter('Favorite'));

// Booking entity router compat: forward to /api/bookings handlers via mini-router
const bookingCompat = express.Router();
bookingCompat.get('/', authMiddleware, async (req, res) => {
  try {
    const { sort = '-booking_date', limit = 500, ...filters } = req.query;
    const query = { ...filters };
    Object.keys(query).forEach(k => { if (query[k] === '' || query[k] === undefined) delete query[k]; });
    if (!query.created_by) query.created_by = req.userEmail;
    const sortField = sort.startsWith('-') ? sort.slice(1) : sort;
    const sortDir = sort.startsWith('-') ? -1 : 1;
    const items = await Booking.find(query).sort({ [sortField]: sortDir }).limit(parseInt(limit) || 500).lean();
    res.json(items.map(b => { b.id = b._id.toString(); delete b._id; delete b.__v; return b; }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
bookingCompat.get('/:id', authMiddleware, async (req, res) => {
  try {
    const b = await Booking.findById(req.params.id).lean();
    if (!b) return res.status(404).json({ error: 'Not found' });
    b.id = b._id.toString(); delete b._id; delete b.__v;
    res.json(b);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
bookingCompat.post('/', authMiddleware, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.place_name || !body.booking_date) return res.status(400).json({ error: 'place_name and booking_date are required' });
    const booking_date = isoDate(body.booking_date);
    if (body.trip_id) {
      const trip = await Trip.findById(body.trip_id);
      if (!trip || trip.created_by !== req.userEmail) return res.status(400).json({ error: 'Invalid trip' });
      if (booking_date < trip.start_date || booking_date > trip.end_date) return res.status(400).json({ error: 'Booking date falls outside trip window' });
    }
    if (body.place_id || body.place_name) {
      const dup = await Booking.findOne({
        created_by: req.userEmail, booking_date,
        $or: [body.place_id ? { place_id: body.place_id } : null, body.place_name ? { place_name: body.place_name } : null].filter(Boolean),
        status: { $ne: 'cancelled' },
      });
      if (dup) return res.status(409).json({ error: 'Already booked for this date' });
    }
    const doc = await Booking.create({ ...body, booking_date, created_by: req.userEmail, created_date: new Date(), updated_date: new Date() });
    if ((doc.status || '').toLowerCase() === 'confirmed') {
      awardPoints(req.userEmail, 25, 'Booking added', { booking_id: doc._id.toString(), place_name: body.place_name });
    }
    res.status(201).json(toJSON(doc));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
bookingCompat.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const updates = { ...req.body, updated_date: new Date() };
    if (updates.booking_date) updates.booking_date = isoDate(updates.booking_date);
    const doc = await Booking.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(toJSON(doc));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
bookingCompat.delete('/:id', authMiddleware, async (req, res) => {
  try { await Booking.findByIdAndDelete(req.params.id); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.use('/api/entities/Booking', bookingCompat);

// ─── Personalized recommendations ─────────────────────────────────────────────
app.get('/api/recommendations', authMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 12;
    const u = await User.findById(req.userId);
    if (!u) return res.status(404).json({ error: 'User not found' });

    const [places, favorites] = await Promise.all([
      Place.find().lean(),
      Favorite.find({ created_by: u.email }).lean(),
    ]);

    const interests = (u.interests || []).map(s => s.toLowerCase());
    const favoriteIds = new Set(favorites.map(f => f.place_id));
    const favCities = new Set(favorites.map(f => f.city));
    const favTypes = new Set(favorites.map(f => f.place_type));

    function score(p) {
      let s = 0;
      const text = (p.name + ' ' + (p.description || '') + ' ' + (p.tags || []).join(' ')).toLowerCase();
      interests.forEach(i => { if (i && text.includes(i)) s += 5; });
      if (favCities.has(p.city)) s += 4;
      if (favTypes.has(p.type)) s += 3;
      if (u.budget_preference && p.price_level === u.budget_preference) s += 3;
      if (p.featured) s += 2;
      s += (p.rating || 0);
      return s;
    }

    const ranked = places
      .filter(p => !favoriteIds.has(p._id.toString()))
      .map(p => ({ p, score: score(p) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ p, score }) => { const o = { ...p, id: p._id.toString(), score }; delete o._id; delete o.__v; return o; });

    res.json({ items: ranked, based_on: { interests, favorite_cities: [...favCities] } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── AI chatbot (Pro plan and above) ─────────────────────────────────────────
app.post('/api/ai/chat', authMiddleware, requirePlan('medium'), async (req, res) => {
  try {
    const { messages = [], system } = req.body;
    const u = req.user;

    // If user has an active or upcoming trip, mention it in the system prompt
    const today = todayISO();
    const trip = await Trip.findOne({
      created_by: u.email,
      status: { $in: ['planned', 'active'] },
      end_date: { $gte: today },
    }).sort({ start_date: 1 });
    let tripContext = '';
    if (trip) {
      const tripDest = (trip.destination_city ? trip.destination_city + ', ' : '') + trip.destination_country;
      tripContext = ' The user has a trip to ' + tripDest + ' from ' + trip.start_date + ' to ' + trip.end_date + ' — proactively help with that destination.';
    }

    const sysPrompt = system || ('You are ExploreX travel assistant. The user name is ' + (u.full_name || 'Explorer') + ', interests: ' + ((u.interests || []).join(', ') || 'unknown') + ', budget: ' + u.budget_preference + ', home: ' + (u.home_city || 'unknown') + '.' + tripContext + ' Keep replies short, useful, warm. Suggest real named places, give weather tips, recommend activities. Steer back to travel if asked unrelated things.');

    if (!GROQ_API_KEY) {
      const lastUserMsg = (messages[messages.length - 1] && messages[messages.length - 1].text) || '';
      return res.json({ reply: mockChatReply(lastUserMsg, u, trip) });
    }

    const history = messages.map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text }));
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_API_KEY },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'system', content: sysPrompt }, ...history], max_tokens: 600, temperature: 0.7 }),
    });
    if (!r.ok) {
      let errBody = '';
      try { errBody = await r.text(); } catch (_) { }
      console.warn('Groq chat error:', r.status, errBody.slice(0, 400));
      // Graceful mock fallback so the user always gets a reply
      const lastUserMsg = (history.slice().reverse().find(m => m.role === 'user') || {}).content || '';
      return res.json({ reply: mockChatReply(lastUserMsg, u, activeTrip) });
    }
    const data = await r.json();
    const reply = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || 'Sorry, I had trouble responding. Try again?';
    res.json({ reply });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function mockChatReply(text, user, trip) {
  const t = (text || '').toLowerCase();
  const name = (user.full_name || '').split(' ')[0] || 'there';
  const tripStr = trip ? ' You have a trip to ' + trip.destination_country + ' coming up — happy to help with that!' : '';
  if (/weather|rain|temperature/.test(t)) return 'Today should be pleasant! Try the Weather page for a real forecast in any city.' + tripStr;
  if (/restaurant|food|eat/.test(t)) return 'Based on your ' + (user.budget_preference || 'moderate') + ' budget, check the Places page filtered by Restaurants.' + tripStr;
  if (/plan|itinerary|trip/.test(t)) return 'For a full day plan, head to the AI Planner — it tailors everything to your interests.' + tripStr;
  if (/connect|friend|chat/.test(t)) return 'Find fellow travelers on the Connect page. You can message anyone after they accept your request.';
  if (/hello|hi|hey/.test(t)) return 'Hi ' + name + '! I\'m your ExploreX travel buddy.' + tripStr;
  return 'Great question! Try the Planner for full itineraries or Weather for live conditions.' + tripStr;
}

// ─── Photos (Unsplash with key OR keyless source.unsplash.com fallback) ──────
app.get('/api/photos', authMiddleware, async (req, res) => {
  try {
    const query = req.query.query || 'travel';
    const count = Math.min(parseInt(req.query.count) || 8, 20);

    if (UNSPLASH_ACCESS_KEY) {
      const r = await fetch(
        'https://api.unsplash.com/search/photos?query=' + encodeURIComponent(query) + '&per_page=' + count + '&orientation=landscape',
        { headers: { Authorization: 'Client-ID ' + UNSPLASH_ACCESS_KEY } }
      );
      if (r.ok) {
        const data = await r.json();
        const photos = (data.results || []).map(p => ({
          id: p.id, url: p.urls.regular, thumb: p.urls.small, full: p.urls.full,
          alt: p.alt_description || query, credit: p.user.name,
          credit_url: p.user.links.html + '?utm_source=explorex&utm_medium=referral',
        }));
        if (photos.length) return res.json({ photos, source: 'unsplash' });
      } else {
        console.warn('Unsplash error: ' + r.status);
      }
    }

    // Keyless fallback: source.unsplash.com gives back a relevant photo for any
    // query string with no API key required. We synthesise distinct URLs by
    // adding a sig param so the browser sees them as different images.
    const slug = encodeURIComponent(query.replace(/\s+/g, ' ').trim());
    const photos = [];
    for (let i = 0; i < count; i++) {
      photos.push({
        id: 'src-' + i + '-' + Date.now(),
        url: 'https://source.unsplash.com/800x600/?' + slug + '&sig=' + (i * 7 + 1),
        thumb: 'https://source.unsplash.com/400x300/?' + slug + '&sig=' + (i * 7 + 1),
        full: 'https://source.unsplash.com/1600x1000/?' + slug + '&sig=' + (i * 7 + 1),
        alt: query, credit: 'Unsplash', credit_url: 'https://unsplash.com',
      });
    }
    res.json({ photos, source: 'source-unsplash' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Single-photo helper (for photo-by-photo lazy loads)
app.get('/api/photo', authMiddleware, async (req, res) => {
  try {
    const query = req.query.query || 'travel';
    const slug = encodeURIComponent(query.replace(/\s+/g, ' ').trim());
    if (UNSPLASH_ACCESS_KEY) {
      const r = await fetch(
        'https://api.unsplash.com/search/photos?query=' + encodeURIComponent(query) + '&per_page=1&orientation=landscape',
        { headers: { Authorization: 'Client-ID ' + UNSPLASH_ACCESS_KEY } }
      );
      if (r.ok) {
        const data = await r.json();
        const p = (data.results || [])[0];
        if (p) return res.json({ url: p.urls.regular, thumb: p.urls.small, alt: p.alt_description || query, source: 'unsplash' });
      }
    }
    res.json({
      url: 'https://source.unsplash.com/800x600/?' + slug,
      thumb: 'https://source.unsplash.com/400x300/?' + slug,
      alt: query, source: 'source-unsplash',
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Country basic info ───────────────────────────────────────────────────────
app.get('/api/country', authMiddleware, async (req, res) => {
  try {
    const name = req.query.name || 'France';
    const r = await fetch('https://restcountries.com/v3.1/name/' + encodeURIComponent(name) + '?fullText=false&fields=name,capital,population,region,subregion,flags,languages,currencies,timezones,latlng');
    if (r.ok) {
      const data = await r.json();
      const c = Array.isArray(data) && data[0];
      if (c) {
        return res.json({
          name: c.name.common, official: c.name.official,
          capital: (c.capital || [])[0] || '',
          region: c.region, subregion: c.subregion, population: c.population,
          flag: (c.flags && (c.flags.svg || c.flags.png)) || '',
          languages: Object.values(c.languages || {}).join(', '),
          currency: Object.values(c.currencies || {}).map(x => x.name + (x.symbol ? ' (' + x.symbol + ')' : '')).join(', '),
          timezones: (c.timezones || []).slice(0, 2).join(', '),
          latlng: c.latlng,
          best_time: bestTimeFor(c.region, c.subregion),
        });
      }
    }
    res.json({ name, capital: '', region: '', population: 0, flag: '', languages: '', currency: '' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function bestTimeFor(region, subregion) {
  const mapping = {
    'Northern Europe': 'May to September',
    'Western Europe': 'April to June, September to October',
    'Southern Europe': 'April to June, September to October',
    'Eastern Europe': 'May to September',
    'Western Asia': 'October to April',
    'Southern Asia': 'November to March',
    'South-Eastern Asia': 'November to February',
    'Eastern Asia': 'March to May, September to November',
    'Northern Africa': 'September to May',
    'Sub-Saharan Africa': 'May to October',
    'Northern America': 'May to October',
    'Caribbean': 'December to April',
    'Central America': 'December to April',
    'South America': 'December to March (south), May to October (tropical)',
    'Oceania': 'September to March',
  };
  return mapping[subregion] || mapping[region] || 'Year-round';
}

// ─── Country Places (AI-powered: REAL named places only) ──────────────────────
app.get('/api/country-places', authMiddleware, async (req, res) => {
  try {
    const country = req.query.country || 'France';

    if (GROQ_API_KEY) {
      const prompt = 'You are a professional travel planner. List 6 real, famous, named tourist attractions in ' + country + ' that genuinely exist and are well-known.\n\n' +
        'Also list 8 real activities a visitor would actually do in ' + country + ' — using real local food names, real activity names, and (where relevant) the city or neighborhood they happen in.\n\n' +
        'Return ONLY a JSON object with this exact shape, no markdown, no commentary:\n' +
        '{\n' +
        '  "overview": "2-3 sentence travel intro to the country",\n' +
        '  "highlights": ["5 short highlight strings — real signature things, no generic words"],\n' +
        '  "places": [\n' +
        '    {\n' +
        '      "name": "exact real place name (no city placeholders)",\n' +
        '      "type": "city|attraction|nature|beach|historical",\n' +
        '      "tagline": "short tagline",\n' +
        '      "description": "1-2 sentences mentioning the real city or neighborhood it is in",\n' +
        '      "unsplash_query": "3-5 word search query that will return a photo of THIS place"\n' +
        '    }\n' +
        '  ],\n' +
        '  "things_to_do": [\n' +
        '    {\n' +
        '      "name": "real activity name (e.g. \\"Eat tagine in Marrakech medina\\", not \\"local food tour\\")",\n' +
        '      "category": "food|adventure|culture|nature|nightlife|shopping",\n' +
        '      "description": "1 sentence with real specifics",\n' +
        '      "price_range": "budget|moderate|premium|luxury"\n' +
        '    }\n' +
        '  ],\n' +
        '  "best_time": "specific months",\n' +
        '  "currency": "currency name",\n' +
        '  "language": "main language"\n' +
        '}\n\n' +
        'Critical rules:\n' +
        '- Every place MUST be a real, named, well-known location (e.g. for France: Eiffel Tower, Louvre Museum, Palace of Versailles, Mont Saint-Michel; for Japan: Fushimi Inari Shrine, Senso-ji Temple, Mount Fuji, Arashiyama Bamboo Grove).\n' +
        '- Do NOT use generic placeholders like "Capital City", "Local Market", "Scenic Countryside", "Mountain Range".\n' +
        '- Activity names must reference real food, real festivals, or real neighborhoods — not "local food tour" or "city sightseeing".\n' +
        '- Respond with the raw JSON only.';

      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_API_KEY },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], max_tokens: 3000, temperature: 0.5 }),
      });
      if (r.ok) {
        const data = await r.json();
        const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
        try {
          const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(clean);
          return res.json(parsed);
        } catch (pe) { console.error('Country places parse fail:', pe.message, text.slice(0, 300)); }
      } else {
        // Log the full Groq error body so model decommissions / quota issues
        // are visible in the server logs instead of just a status code.
        let errBody = '';
        try { errBody = await r.text(); } catch (_) { }
        console.warn('Groq country-places error:', r.status, errBody.slice(0, 400));
      }
    }

    // Fallback: hard-coded real places for popular countries, generic-but-named for the rest
    res.json(fallbackCountryPlaces(country));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Hard-coded REAL named places per popular country, for when Groq is unavailable.
function fallbackCountryPlaces(country) {
  const dataMap = {
    'France': {
      overview: 'France pairs world-class art and architecture with every flavor of cuisine, from Parisian patisseries to Provençal markets.',
      highlights: ['Eiffel Tower', 'Louvre masterpieces', 'Wine country', 'French Riviera', 'Versailles palace'],
      places: [
        { name: 'Eiffel Tower', type: 'attraction', tagline: 'Paris\' iron icon', description: 'Built for the 1889 World\'s Fair, today the symbol of Paris.', unsplash_query: 'Eiffel Tower Paris' },
        { name: 'Louvre Museum', type: 'attraction', tagline: 'Mona Lisa\'s home', description: 'The world\'s most-visited museum, set inside a former royal palace in central Paris.', unsplash_query: 'Louvre Museum pyramid' },
        { name: 'Palace of Versailles', type: 'historical', tagline: 'Sun King\'s palace', description: 'Louis XIV\'s sprawling palace and gardens, 30 minutes from Paris.', unsplash_query: 'Palace of Versailles' },
        { name: 'Mont Saint-Michel', type: 'historical', tagline: 'Tidal-island abbey', description: 'A medieval abbey on a rocky islet in Normandy, surrounded by tides.', unsplash_query: 'Mont Saint Michel' },
        { name: 'French Riviera', type: 'beach', tagline: 'Côte d\'Azur', description: 'Glamorous Mediterranean coastline from Saint-Tropez to Monaco.', unsplash_query: 'French Riviera Nice' },
        { name: 'Loire Valley Châteaux', type: 'historical', tagline: 'Garden of France', description: 'Renaissance castles like Chambord and Chenonceau set among vineyards.', unsplash_query: 'Chateau Chambord Loire' },
      ],
      things_to_do: [
        { name: 'Eat croissants at a Paris boulangerie', category: 'food', description: 'Pick a Marais bakery for a buttery, flaky breakfast.', price_range: 'budget' },
        { name: 'See the Mona Lisa at the Louvre', category: 'culture', description: 'Arrive early; head straight to the Denon wing.', price_range: 'budget' },
        { name: 'Wine tasting in Bordeaux', category: 'food', description: 'Tour Saint-Émilion vineyards for classic French reds.', price_range: 'moderate' },
        { name: 'Cycle through Provence lavender fields', category: 'adventure', description: 'Best in July when the lavender blooms purple.', price_range: 'moderate' },
        { name: 'Boat ride on the Seine', category: 'nature', description: 'Sunset cruise past Notre-Dame and the Île de la Cité.', price_range: 'budget' },
        { name: 'Ski in Chamonix', category: 'adventure', description: 'World-class alpine resort beneath Mont Blanc.', price_range: 'premium' },
        { name: 'Macarons at Ladurée', category: 'food', description: 'Pick a colorful box on the Champs-Élysées.', price_range: 'budget' },
        { name: 'Disneyland Paris day', category: 'culture', description: 'Easy day trip from central Paris with kids.', price_range: 'premium' },
      ],
      best_time: 'April to June, September to October', currency: 'Euro (€)', language: 'French',
    },
    'Japan': {
      overview: 'Japan blends ultra-modern Tokyo with serene Kyoto temples, Mount Fuji vistas, and food culture that ranges from sushi to ramen.',
      highlights: ['Mount Fuji', 'Cherry blossoms', 'Tokyo neon', 'Kyoto temples', 'Bullet trains'],
      places: [
        { name: 'Fushimi Inari Shrine', type: 'historical', tagline: 'Thousand torii gates', description: 'Climb the vermillion gate trail through the forested Mount Inari in Kyoto.', unsplash_query: 'Fushimi Inari torii gates' },
        { name: 'Senso-ji Temple', type: 'historical', tagline: 'Tokyo\'s oldest temple', description: 'Asakusa\'s 7th-century Buddhist temple with its Kaminarimon lantern gate.', unsplash_query: 'Senso-ji Temple Asakusa' },
        { name: 'Mount Fuji', type: 'nature', tagline: 'Japan\'s sacred peak', description: 'Iconic 3,776m volcano visible from the Fuji Five Lakes region.', unsplash_query: 'Mount Fuji Japan' },
        { name: 'Arashiyama Bamboo Grove', type: 'nature', tagline: 'Towering bamboo path', description: 'Walk the otherworldly bamboo corridor in western Kyoto.', unsplash_query: 'Arashiyama bamboo grove' },
        { name: 'Shibuya Crossing', type: 'city', tagline: 'World\'s busiest crossing', description: 'Tokyo\'s iconic scramble crossing surrounded by neon.', unsplash_query: 'Shibuya Crossing Tokyo night' },
        { name: 'Itsukushima Shrine', type: 'historical', tagline: 'Floating torii gate', description: 'The famous orange torii of Miyajima island appears to float at high tide.', unsplash_query: 'Itsukushima floating torii' },
      ],
      things_to_do: [
        { name: 'Eat sushi at Tsukiji Outer Market', category: 'food', description: 'Tokyo\'s legendary breakfast — uni and otoro at dawn.', price_range: 'moderate' },
        { name: 'Soak in an onsen at Hakone', category: 'nature', description: 'Volcanic hot springs with views of Mount Fuji.', price_range: 'premium' },
        { name: 'Tea ceremony in Gion', category: 'culture', description: 'Traditional matcha experience in Kyoto\'s geisha district.', price_range: 'moderate' },
        { name: 'Ride the Shinkansen', category: 'adventure', description: 'Tokyo to Kyoto in 2h 15m at 300 km/h.', price_range: 'moderate' },
        { name: 'Cherry blossom hanami at Ueno Park', category: 'nature', description: 'Picnic under sakura trees in late March.', price_range: 'budget' },
        { name: 'Slurp ramen at Ichiran', category: 'food', description: 'Single-seat ramen booth chain — order via vending machine.', price_range: 'budget' },
        { name: 'Anime shopping in Akihabara', category: 'shopping', description: 'Tokyo\'s electric town for manga, games, and pop culture.', price_range: 'moderate' },
        { name: 'Karaoke in Shinjuku', category: 'nightlife', description: 'Private booths and all-you-can-drink in Tokyo\'s nightlife district.', price_range: 'moderate' },
      ],
      best_time: 'March to May (cherry blossoms), October to November (autumn leaves)', currency: 'Japanese Yen (¥)', language: 'Japanese',
    },
    'Italy': {
      overview: 'Italy serves up the Colosseum, Renaissance art, vineyards, and the world\'s most beloved cuisine — pizza, pasta, gelato.',
      highlights: ['Colosseum', 'Vatican art', 'Tuscan vineyards', 'Amalfi Coast', 'Venetian canals'],
      places: [
        { name: 'Colosseum', type: 'historical', tagline: 'Rome\'s gladiator arena', description: 'The 70 AD amphitheatre that once held 80,000 spectators.', unsplash_query: 'Colosseum Rome' },
        { name: 'Vatican City', type: 'historical', tagline: 'Sistine Chapel', description: 'Michelangelo\'s ceiling and St. Peter\'s Basilica in one square mile.', unsplash_query: 'Vatican Sistine Chapel' },
        { name: 'Venice Grand Canal', type: 'city', tagline: 'Floating city', description: 'Glide past Renaissance palaces on Venice\'s S-shaped main waterway.', unsplash_query: 'Venice Grand Canal gondola' },
        { name: 'Amalfi Coast', type: 'beach', tagline: 'Cliffside paradise', description: 'Pastel villages clinging to dramatic Tyrrhenian cliffs near Positano.', unsplash_query: 'Amalfi Coast Positano' },
        { name: 'Florence Duomo', type: 'historical', tagline: 'Brunelleschi\'s dome', description: 'The Renaissance cathedral that defined Florence\'s skyline since 1436.', unsplash_query: 'Florence Duomo' },
        { name: 'Cinque Terre', type: 'nature', tagline: 'Five rainbow villages', description: 'Hike between five seaside villages on the Ligurian coast.', unsplash_query: 'Cinque Terre Italy' },
      ],
      things_to_do: [
        { name: 'Eat Neapolitan pizza in Naples', category: 'food', description: 'Da Michele or Sorbillo — wood-fired Margherita as it was invented.', price_range: 'budget' },
        { name: 'Gondola ride in Venice', category: 'culture', description: '30-minute glide through hidden canals.', price_range: 'premium' },
        { name: 'Tuscany wine tour', category: 'food', description: 'Chianti, Brunello and Super Tuscan tasting.', price_range: 'moderate' },
        { name: 'Climb Florence\'s Duomo', category: 'adventure', description: '463 steps to the panoramic top of Brunelleschi\'s dome.', price_range: 'budget' },
        { name: 'Aperitivo in Milan', category: 'nightlife', description: 'Spritz + buffet in Navigli at sunset.', price_range: 'moderate' },
        { name: 'Drive the Amalfi Coast Road', category: 'adventure', description: 'Hairpin coastal drive from Sorrento to Salerno.', price_range: 'moderate' },
        { name: 'Pompeii ruins day trip', category: 'culture', description: 'The Vesuvius-buried Roman city, frozen in 79 AD.', price_range: 'budget' },
        { name: 'Gelato crawl in Rome', category: 'food', description: 'Giolitti, Fatamorgana, Frigidarium — find your favorite scoop.', price_range: 'budget' },
      ],
      best_time: 'April to June, September to October', currency: 'Euro (€)', language: 'Italian',
    },
    'United Kingdom': {
      overview: 'The UK ranges from London\'s royal pomp to Scottish Highland lochs, with castles, country pubs, and world-class theatre throughout.',
      highlights: ['Big Ben', 'Tower of London', 'Stonehenge', 'Edinburgh Castle', 'Lake District'],
      places: [
        { name: 'Tower of London', type: 'historical', tagline: 'Crown Jewels & ravens', description: 'Norman fortress on the Thames housing the Crown Jewels.', unsplash_query: 'Tower of London' },
        { name: 'Stonehenge', type: 'historical', tagline: '5,000-year-old stone circle', description: 'Prehistoric monument on Salisbury Plain, Wiltshire.', unsplash_query: 'Stonehenge UK' },
        { name: 'Edinburgh Castle', type: 'historical', tagline: 'Scotland\'s royal fortress', description: 'Volcanic-rock castle dominating the Edinburgh skyline.', unsplash_query: 'Edinburgh Castle' },
        { name: 'British Museum', type: 'attraction', tagline: 'Rosetta Stone & Elgin Marbles', description: 'Encyclopedic collection from across human history, free to enter.', unsplash_query: 'British Museum London' },
        { name: 'Lake District', type: 'nature', tagline: 'Wordsworth country', description: 'Glacial lakes and fells in Cumbria, England\'s prettiest national park.', unsplash_query: 'Lake District England' },
        { name: 'Buckingham Palace', type: 'historical', tagline: 'Royal residence', description: 'The Queen\'s — now King\'s — official London home, with Changing of the Guard.', unsplash_query: 'Buckingham Palace London' },
      ],
      things_to_do: [
        { name: 'West End musical in London', category: 'culture', description: 'Catch Hamilton, Les Mis, or Phantom in Theatreland.', price_range: 'premium' },
        { name: 'Pub roast on a Sunday', category: 'food', description: 'Yorkshire pudding and ale in a 200-year-old pub.', price_range: 'moderate' },
        { name: 'Afternoon tea at The Ritz', category: 'food', description: 'Scones, finger sandwiches, and Champagne in Mayfair.', price_range: 'luxury' },
        { name: 'Ride the London Eye', category: 'adventure', description: '30-minute capsule ride over the Thames skyline.', price_range: 'moderate' },
        { name: 'Hike Ben Nevis', category: 'adventure', description: 'UK\'s highest peak — 8 hours round-trip from Fort William.', price_range: 'budget' },
        { name: 'Punt the River Cam in Cambridge', category: 'nature', description: 'Wooden boat tour past historic colleges.', price_range: 'moderate' },
        { name: 'Borough Market food crawl', category: 'food', description: 'London\'s 1,000-year-old food market beside London Bridge.', price_range: 'moderate' },
        { name: 'Loch Ness boat trip', category: 'nature', description: 'Cruise the deepest Highland loch in search of Nessie.', price_range: 'moderate' },
      ],
      best_time: 'May to September', currency: 'Pound Sterling (£)', language: 'English',
    },
    'USA': {
      overview: 'From Manhattan skylines to Grand Canyon vistas, the United States offers staggering geographic and cultural variety.',
      highlights: ['Statue of Liberty', 'Grand Canyon', 'Times Square', 'Yellowstone', 'Hollywood'],
      places: [
        { name: 'Grand Canyon National Park', type: 'nature', tagline: 'Arizona\'s mile-deep gorge', description: 'The Colorado River carved this 277-mile canyon over 6 million years.', unsplash_query: 'Grand Canyon Arizona' },
        { name: 'Times Square', type: 'city', tagline: 'NYC\'s neon heart', description: 'Manhattan\'s 24-hour intersection of theater, advertising, and energy.', unsplash_query: 'Times Square New York' },
        { name: 'Statue of Liberty', type: 'historical', tagline: 'Liberty Island icon', description: '1886 French gift welcoming arrivals to New York Harbor.', unsplash_query: 'Statue of Liberty New York' },
        { name: 'Yellowstone National Park', type: 'nature', tagline: 'Geysers and wildlife', description: 'Old Faithful, bison herds, and hot springs across Wyoming.', unsplash_query: 'Yellowstone Old Faithful' },
        { name: 'Golden Gate Bridge', type: 'historical', tagline: 'San Francisco\'s landmark', description: 'The 1937 art deco suspension bridge spanning the Golden Gate strait.', unsplash_query: 'Golden Gate Bridge San Francisco' },
        { name: 'Walt Disney World', type: 'attraction', tagline: 'Orlando theme parks', description: 'Four parks and two water parks in central Florida.', unsplash_query: 'Walt Disney World Orlando' },
      ],
      things_to_do: [
        { name: 'Catch a Broadway show', category: 'culture', description: 'Wicked, Hamilton, and the Lion King run nightly in Midtown Manhattan.', price_range: 'premium' },
        { name: 'Drive Pacific Coast Highway', category: 'adventure', description: 'Highway 1 from San Francisco to Los Angeles via Big Sur.', price_range: 'moderate' },
        { name: 'In-N-Out Burger', category: 'food', description: 'California fast-food classic — order Animal Style.', price_range: 'budget' },
        { name: 'Las Vegas Strip nightlife', category: 'nightlife', description: 'Fountains of Bellagio, casino-hopping, and headliner shows.', price_range: 'premium' },
        { name: 'NBA game at Madison Square Garden', category: 'culture', description: 'Knicks home court in midtown Manhattan.', price_range: 'premium' },
        { name: 'Hike Half Dome in Yosemite', category: 'adventure', description: '14 miles round-trip with cables to the granite summit.', price_range: 'budget' },
        { name: 'Chicago deep dish at Lou Malnati\'s', category: 'food', description: 'The buttery-crust deep dish that defines Chicago.', price_range: 'budget' },
        { name: 'New Orleans jazz on Frenchmen Street', category: 'nightlife', description: 'Live brass-band clubs every night in the French Quarter.', price_range: 'moderate' },
      ],
      best_time: 'May to October (most regions)', currency: 'US Dollar ($)', language: 'English',
    },
    'India': {
      overview: 'India is a country of staggering scale: from the marble Taj Mahal to Goa\'s beaches, Mumbai street food, and Himalayan trekking.',
      highlights: ['Taj Mahal', 'Goa beaches', 'Rajasthan palaces', 'Kerala backwaters', 'Himalayan treks'],
      places: [
        { name: 'Taj Mahal', type: 'historical', tagline: 'Agra\'s marble mausoleum', description: 'Shah Jahan\'s 17th-century white marble tomb for Mumtaz Mahal.', unsplash_query: 'Taj Mahal Agra' },
        { name: 'Amber Fort', type: 'historical', tagline: 'Jaipur\'s pink palace', description: 'Sandstone-and-marble fort overlooking Maota Lake in Rajasthan.', unsplash_query: 'Amber Fort Jaipur' },
        { name: 'Kerala Backwaters', type: 'nature', tagline: 'Houseboat country', description: 'Network of palm-fringed lagoons cruised aboard wooden kettuvallam boats.', unsplash_query: 'Kerala backwaters houseboat' },
        { name: 'Varanasi Ghats', type: 'historical', tagline: 'Sacred Ganges riverfront', description: 'Steps along the Ganges where pilgrims bathe and cremations take place at dawn.', unsplash_query: 'Varanasi ghats Ganges' },
        { name: 'Goa beaches', type: 'beach', tagline: 'Arabian Sea shores', description: 'Palolem, Anjuna and Baga\'s palm-lined beaches and beach shacks.', unsplash_query: 'Goa beach India' },
        { name: 'Hawa Mahal', type: 'historical', tagline: 'Palace of Winds', description: 'Jaipur\'s 5-story honeycomb facade of 953 small windows.', unsplash_query: 'Hawa Mahal Jaipur' },
      ],
      things_to_do: [
        { name: 'Eat butter chicken in Delhi', category: 'food', description: 'Try Moti Mahal where the dish was reportedly invented.', price_range: 'budget' },
        { name: 'Yoga retreat in Rishikesh', category: 'culture', description: 'World yoga capital on the Ganges, with daily Ganga aarti.', price_range: 'moderate' },
        { name: 'Ride the Mumbai local train', category: 'adventure', description: 'The city\'s pulsing 7.5 million-passenger commuter network.', price_range: 'budget' },
        { name: 'Camel safari in Jaisalmer', category: 'adventure', description: 'Sleep in the Thar Desert dunes under the stars.', price_range: 'moderate' },
        { name: 'Holi festival in Mathura', category: 'culture', description: 'The original birthplace of the festival of colors, every March.', price_range: 'budget' },
        { name: 'Trek to Triund', category: 'adventure', description: 'One-day Himalayan ridge hike from McLeod Ganj.', price_range: 'budget' },
        { name: 'Tea estate stay in Darjeeling', category: 'food', description: 'Tour and taste at a working tea garden in West Bengal.', price_range: 'moderate' },
        { name: 'Ayurvedic massage in Kerala', category: 'culture', description: '60-minute traditional shirodhara at a coastal resort.', price_range: 'moderate' },
      ],
      best_time: 'October to March', currency: 'Indian Rupee (₹)', language: 'Hindi, English',
    },
    'UAE': {
      overview: 'The UAE turned desert into futuristic cityscapes — Burj Khalifa, Palm Jumeirah, and Sheikh Zayed Mosque, alongside dune deserts and Empty Quarter sands.',
      highlights: ['Burj Khalifa', 'Palm Jumeirah', 'Sheikh Zayed Mosque', 'Desert safari', 'Dubai Mall'],
      places: [
        { name: 'Burj Khalifa', type: 'attraction', tagline: 'World\'s tallest tower', description: 'The 828m skyscraper at the heart of Downtown Dubai.', unsplash_query: 'Burj Khalifa Dubai' },
        { name: 'Sheikh Zayed Grand Mosque', type: 'historical', tagline: 'Abu Dhabi\'s marble masterpiece', description: 'White-marble mosque with 82 domes and the world\'s largest hand-knotted carpet.', unsplash_query: 'Sheikh Zayed Mosque Abu Dhabi' },
        { name: 'Palm Jumeirah', type: 'beach', tagline: 'Man-made island', description: 'Palm-shaped artificial archipelago packed with luxury hotels and beach clubs.', unsplash_query: 'Palm Jumeirah Dubai' },
        { name: 'Dubai Mall', type: 'attraction', tagline: '1,200 stores + aquarium', description: 'World\'s largest shopping mall, beneath the Burj Khalifa.', unsplash_query: 'Dubai Mall fountain' },
        { name: 'Louvre Abu Dhabi', type: 'attraction', tagline: 'Domed art museum', description: 'Jean Nouvel\'s domed museum on Saadiyat Island, an Abu Dhabi-Paris partnership.', unsplash_query: 'Louvre Abu Dhabi' },
        { name: 'Liwa Desert', type: 'nature', tagline: 'Empty Quarter dunes', description: 'Largest sand desert on Earth — go for the towering Moreeb Dune.', unsplash_query: 'Liwa Desert UAE' },
      ],
      things_to_do: [
        { name: 'Desert safari with Bedouin BBQ', category: 'adventure', description: 'Dune bashing, falconry, camel ride and grilled dinner under the stars.', price_range: 'moderate' },
        { name: 'Brunch at Atlantis The Palm', category: 'food', description: 'Saturday Bubbalicious — 200+ stations of food and free-flow Champagne.', price_range: 'luxury' },
        { name: 'Souk shopping in Dubai Old Town', category: 'shopping', description: 'Gold Souk, Spice Souk, and abra ride across Dubai Creek.', price_range: 'budget' },
        { name: 'Ski Dubai indoor slopes', category: 'adventure', description: 'Ski real snow inside Mall of the Emirates — bring a jacket.', price_range: 'moderate' },
        { name: 'Sundowner at Burj Al Arab\'s SAL', category: 'nightlife', description: 'Beach-club cocktails with views of the sail-shaped 7-star hotel.', price_range: 'luxury' },
        { name: 'Yas Marina F1 lap', category: 'adventure', description: 'Drive the actual Abu Dhabi Grand Prix circuit on Yas Island.', price_range: 'premium' },
        { name: 'Frying Pan Adventures food tour', category: 'food', description: 'Old Dubai street-food walk through Karama and Deira.', price_range: 'moderate' },
        { name: 'Hike Jebel Jais', category: 'adventure', description: 'UAE\'s tallest peak (1,934m) in Ras Al Khaimah, with the world\'s longest zipline.', price_range: 'moderate' },
      ],
      best_time: 'November to March', currency: 'UAE Dirham (AED)', language: 'Arabic, English',
    },
    'Greece': {
      overview: 'Greece is the cradle of Western civilization, with the Parthenon, sun-bleached islands, and crystal-clear Aegean waters.',
      highlights: ['Acropolis', 'Santorini sunsets', 'Mykonos beaches', 'Delphi ruins', 'Meteora monasteries'],
      places: [
        { name: 'Acropolis of Athens', type: 'historical', tagline: 'Parthenon temple', description: '5th-century BC citadel and the iconic Parthenon temple to Athena.', unsplash_query: 'Acropolis Parthenon Athens' },
        { name: 'Santorini', type: 'beach', tagline: 'Caldera island', description: 'Whitewashed cliff villages of Oia and Fira above a flooded volcanic caldera.', unsplash_query: 'Santorini Oia sunset' },
        { name: 'Mykonos', type: 'beach', tagline: 'Cycladic party island', description: 'White houses, blue domes, and the busiest beach clubs in the Cyclades.', unsplash_query: 'Mykonos beach Greece' },
        { name: 'Meteora', type: 'historical', tagline: 'Cliff-top monasteries', description: '6 still-active Eastern Orthodox monasteries perched atop sandstone pillars.', unsplash_query: 'Meteora monasteries Greece' },
        { name: 'Delphi', type: 'historical', tagline: 'Oracle of Apollo', description: 'Ancient sanctuary on Mt Parnassus where the Pythia delivered prophecies.', unsplash_query: 'Delphi ruins Greece' },
        { name: 'Crete', type: 'beach', tagline: 'Largest Greek island', description: 'Minoan palaces at Knossos, Samaria Gorge, and the pink-sand Elafonissi beach.', unsplash_query: 'Crete Greece beach' },
      ],
      things_to_do: [
        { name: 'Sunset drinks in Oia', category: 'nightlife', description: 'Watch the world\'s most famous sunset over the Santorini caldera.', price_range: 'premium' },
        { name: 'Catamaran tour of the Aegean', category: 'adventure', description: 'Hop between Mykonos, Paros, and Santorini for the day.', price_range: 'premium' },
        { name: 'Eat moussaka in Plaka', category: 'food', description: 'Athens\' oldest neighborhood beneath the Acropolis.', price_range: 'moderate' },
        { name: 'Walk the Samaria Gorge', category: 'adventure', description: '16km hike through Crete\'s dramatic canyon.', price_range: 'budget' },
        { name: 'Wine tasting in Santorini', category: 'food', description: 'Volcanic-soil Assyrtiko at Domaine Sigalas.', price_range: 'moderate' },
        { name: 'Athens Acropolis Museum', category: 'culture', description: 'Marbles and statues from the Acropolis, with a glass-floor view of ruins.', price_range: 'budget' },
        { name: 'Elafonissi pink beach', category: 'nature', description: 'Crete\'s shallow lagoon with naturally pink sand.', price_range: 'budget' },
        { name: 'Ouzo tasting in Lesbos', category: 'food', description: 'The home of ouzo — distillery tours included.', price_range: 'moderate' },
      ],
      best_time: 'May to early October', currency: 'Euro (€)', language: 'Greek',
    },
  };
  if (dataMap[country]) return dataMap[country];
  // Generic fallback when we don't have hard-coded entries — at least mention real cities by name where possible
  return {
    overview: country + ' is a wonderful destination with rich culture and breathtaking landscapes.',
    highlights: ['Historic sites', 'Local cuisine', 'Natural beauty', 'Warm hospitality', 'Unique traditions'],
    places: [
      { name: country + ' historic capital', type: 'city', tagline: 'Cultural heart', description: 'The vibrant capital with museums, markets and architecture.', unsplash_query: country + ' capital city skyline' },
      { name: country + ' national museum', type: 'attraction', tagline: 'Heritage in one place', description: 'Curated exhibits covering the country\'s long history.', unsplash_query: country + ' national museum' },
      { name: country + ' coastline', type: 'beach', tagline: 'Sun and sea', description: 'Stunning shoreline perfect for relaxation and water sports.', unsplash_query: country + ' beach coast' },
      { name: country + ' UNESCO heritage site', type: 'historical', tagline: 'Step back in time', description: 'A protected historical landmark central to the nation\'s story.', unsplash_query: country + ' UNESCO heritage' },
      { name: country + ' mountain region', type: 'nature', tagline: 'Peaks and valleys', description: 'Majestic mountains offering hiking and panoramic views.', unsplash_query: country + ' mountains' },
      { name: country + ' old town quarter', type: 'attraction', tagline: 'Arts and traditions', description: 'Lively cultural district showcasing local art, crafts and food.', unsplash_query: country + ' old town market' },
    ],
    things_to_do: [
      { name: 'Try a local food tour', category: 'food', description: 'Sample regional flavors at markets and family-run restaurants.', price_range: 'moderate' },
      { name: 'Walking tour of the historic center', category: 'culture', description: 'Explore landmark sites with a local guide.', price_range: 'budget' },
      { name: 'Day hike to a scenic viewpoint', category: 'adventure', description: 'Trek through scenic landscapes to a panoramic spot.', price_range: 'budget' },
      { name: 'Local cooking class', category: 'food', description: 'Prepare and eat a traditional 3-course meal.', price_range: 'moderate' },
      { name: 'Bazaar shopping morning', category: 'shopping', description: 'Browse handmade goods and fresh produce.', price_range: 'budget' },
      { name: 'Half-day boat ride', category: 'nature', description: 'Boat trip along the coast or main river.', price_range: 'moderate' },
      { name: 'Folk music night', category: 'nightlife', description: 'Catch a traditional music performance with dinner.', price_range: 'moderate' },
      { name: 'Sunset photography session', category: 'culture', description: 'Iconic vistas at golden hour.', price_range: 'budget' },
    ],
    best_time: bestTimeFor('', '') || 'Spring and Autumn',
    currency: 'Local Currency', language: 'Local Language',
  };
}

// ─── Places search (DB first, AI fallback) ───────────────────────────────────
app.get('/api/places/search', authMiddleware, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const type = (req.query.type || '').trim();
    const limit = Math.min(parseInt(req.query.limit) || 60, 120);

    const filter = {};
    if (type && type !== 'all') filter.type = type;
    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ city: re }, { country: re }, { name: re }, { tags: re }, { description: re }];
    }
    const dbItems = await Place.find(filter).sort({ featured: -1, rating: -1 }).limit(limit).lean();
    const dbMapped = dbItems.map(p => { p.id = p._id.toString(); delete p._id; delete p.__v; return p; });

    // No query — just return whatever's in the DB.
    if (!q) {
      return res.json({ items: dbMapped, source: 'db' });
    }

    // We have a query. If the DB returned a healthy number of matches,
    // ship them as-is. Otherwise top-up with AI-generated samples so the
    // user always sees a rich set of real, named places for the searched
    // city/country.
    const MIN_RESULTS = 6;
    if (dbMapped.length >= MIN_RESULTS) {
      return res.json({ items: dbMapped, source: 'db' });
    }

    if (GROQ_API_KEY) {
      const want = Math.max(8, MIN_RESULTS + 2 - dbMapped.length);
      const typeHint = (type && type !== 'all')
        ? ('Focus on the type "' + type + '" only.')
        : 'Mix attractions, restaurants, and events.';
      const prompt = 'Generate ' + want + ' real, named, well-known places in or near "' + q + '" that travelers actually visit. ' + typeHint + '\n' +
        'Return ONLY raw JSON, no markdown:\n' +
        '{ "items": [ { "name": "exact real name", "type": "restaurant|attraction|event", "city": "city", "country": "country", "rating": 4.5, "price_level": "budget|moderate|premium|luxury", "avg_price": 50, "short_description": "1 sentence", "description": "2-3 sentences with real address or neighborhood", "opening_hours": "10:00 AM - 8:00 PM", "unsplash_query": "search term for a photo of this place" } ] }';
      try {
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_API_KEY },
          body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], max_tokens: 1500, temperature: 0.5 }),
        });
        if (r.ok) {
          const data = await r.json();
          const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
          const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
          let parsed;
          try {
            parsed = JSON.parse(clean);
          } catch (jsonErr) {
            // AI response was cut off — rescue complete items only
            const lastBracket = clean.lastIndexOf('}');
            const rescued = clean.slice(0, lastBracket + 1) + ']}';
            try {
              parsed = JSON.parse(rescued);
            } catch (_) {
              throw jsonErr; // still broken, let outer catch handle it
            }
          }
          const aiItems = (parsed.items || []).map((p, i) => ({
            id: 'ai-' + Date.now() + '-' + i, name: p.name, type: p.type || 'attraction', city: p.city || q, country: p.country || '',
            rating: p.rating || 4.5, price_level: p.price_level || 'moderate', avg_price: p.avg_price || 0,
            short_description: p.short_description || '', description: p.description || '', opening_hours: p.opening_hours || '',
            tags: [p.type || 'attraction', p.price_level || 'moderate'], _aiUnsplashQuery: p.unsplash_query || (p.name + ' ' + (p.city || '') + ' ' + (p.country || '')),
            _ai: true,
          }));
          // De-dupe AI results that already exist in DB by name (case-insensitive)
          const dbNames = new Set(dbMapped.map(p => String(p.name || '').toLowerCase()));
          const filteredAi = aiItems.filter(p => !dbNames.has(String(p.name).toLowerCase()));
          // Combine: DB results first, then AI fillers.
          const merged = dbMapped.concat(filteredAi);
          return res.json({
            items: merged,
            source: dbMapped.length === 0 ? 'ai' : 'mixed',
          });
        } else {
          let errBody = '';
          try { errBody = await r.text(); } catch (_) { }
          console.warn('Groq places-search error:', r.status, errBody.slice(0, 400));
        }
      } catch (e) { console.warn('places search ai fail', e.message); }
    }

    // AI not configured or failed → return whatever the DB had (possibly empty).
    res.json({ items: dbMapped, source: 'db' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Serve vanilla HTML/CSS/JS frontend ──────────────────────────────────────
const frontendPublic = path.join(__dirname, '../frontend/public');
if (fs.existsSync(frontendPublic)) {
  app.use(express.static(frontendPublic, { extensions: ['html'] }));
  const APP_PAGES = ['home', 'explore', 'planner', 'weather', 'bookings', 'connect', 'chat', 'profile', 'notifications', 'pricing', 'place', 'places', 'favorites'];
  APP_PAGES.forEach(p => {
    app.get('/' + p, (_req, res) => {
      const file = path.join(frontendPublic, 'app', p + '.html');
      if (fs.existsSync(file)) return res.sendFile(file);
      return res.status(404).sendFile(path.join(frontendPublic, '404.html'), err => { if (err) res.status(404).send('Not found'); });
    });
  });
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
    res.status(404).sendFile(path.join(frontendPublic, '404.html'), err => { if (err) res.status(404).send('Not found'); });
  });
}

// Top-level error handler so the server never crashes
app.use((err, _req, res, _next) => {
  console.error('UNHANDLED:', err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});
process.on('unhandledRejection', e => console.error('UNHANDLED REJECTION', e));

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('\nExploreX          →  http://localhost:' + PORT);
  console.log('AI Features       →  ' + (GROQ_API_KEY ? 'Enabled (Groq)' : 'Disabled (set GROQ_API_KEY)'));
  console.log('Photos            →  ' + (UNSPLASH_ACCESS_KEY ? 'Unsplash API' : 'source.unsplash.com (keyless)'));
  console.log('Weather           →  ' + (OPENWEATHER_API_KEY ? 'OpenWeatherMap' : 'mock'));
  console.log('Stripe            →  ' + (STRIPE_SECRET_KEY ? 'Enabled' : 'Disabled (set STRIPE_SECRET_KEY)'));
  console.log('');
});