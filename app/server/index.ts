import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';

const app = new Hono();

app.use('*', cors({
  origin: ['https://rrkher059-cloud.github.io', 'http://localhost:5173', 'http://localhost:8787'],
  credentials: true,
}));

// Root health check
app.get('/', (c) => c.text('Chirp API is live and running!'));
app.get('/api/health', (c) => c.json({ status: 'ok' }));

// Auth endpoint
app.get('/api/auth/me', (c) => c.json({
  id: '1',
  username: 'rrkher059-cloud',
  name: 'Developer',
  avatar: '',
  banner: '',
  bio: 'Building 7ransmi7'
}));

// Stats endpoint (contains both flat & nested stats to prevent UI crashes)
app.get('/api/stats', (c) => c.json({
  users: 1,
  posts: 0,
  tweets: 0,
  stats: {
    users: 1,
    posts: 0,
    tweets: 0
  }
}));

// Fallback endpoints for remaining UI features
app.get('/api/tweets', (c) => c.json([]));
app.get('/api/explore/trending', (c) => c.json([]));
app.get('/api/explore/suggestions', (c) => c.json([]));
app.get('/api/messages', (c) => c.json([]));
app.get('/api/notifications', (c) => c.json([]));
app.get('/api/ai/status', (c) => c.json({ status: 'active' }));

const port = Number(process.env.PORT) || 8787;

serve({
  fetch: app.fetch,
  port
});
