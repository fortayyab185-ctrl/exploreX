// Smoke-test the weather endpoint logic without DB
process.env.MONGODB_URI = 'mongodb://127.0.0.1:1';  // Will fail to connect; that's fine
process.env.JWT_SECRET = 'test';

const express = require('express');
const app = express();

// Pull in the weather route logic in isolation by replicating the exact behavior.
const OPENWEATHER_API_KEY = process.env.OPENWEATHERMAP_API_KEY;

app.get('/test-weather', async (req, res) => {
  const rawCity = (req.query.city || 'Dubai').trim();
  const city = rawCity;

  const COUNTRY_TO_CAPITAL = {
    'france':'Paris','japan':'Tokyo','italy':'Rome','spain':'Madrid','germany':'Berlin',
    'united kingdom':'London','uk':'London','england':'London','greece':'Athens',
    'usa':'New York','united states':'New York','uae':'Dubai',
  };
  const candidates = [city];
  const lower = city.toLowerCase();
  if (COUNTRY_TO_CAPITAL[lower]) candidates.push(COUNTRY_TO_CAPITAL[lower]);

  const mockTemps = { Dubai: 38, London: 14, Paris: 18, Tokyo: 22 };
  const mockKey = mockTemps[city] != null ? city : (COUNTRY_TO_CAPITAL[lower] && mockTemps[COUNTRY_TO_CAPITAL[lower]] != null ? COUNTRY_TO_CAPITAL[lower] : null);
  const t = mockKey ? mockTemps[mockKey] : 22;
  res.json({ city: mockKey || city, requested: rawCity, source: 'mock', temp: t, candidates });
});

app.listen(3999, () => {
  console.log('test server up');
});
