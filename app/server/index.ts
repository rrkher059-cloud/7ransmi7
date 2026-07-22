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

const mockUser = {
  id: '1',
  username: 'rrkher059-cloud',
  name: 'Developer',
  avatar: '',
  banner: '',
  bio: 'Building 7ransmi7',
  followersCount: 0,
  followingCount: 0,
  tweetsCount: 0
};

// Auth GET check
app.get('/api/auth/me', (c) => c.json({ user: mockUser, ...mockUser }));

// Auth POST routes for login/signup/logout
app.post('/api/auth/login', (c) => c.json({ success: true, token: 'mock-jwt-token', user: mockUser }));
app.post('/api/auth/signup', (c) => c.json({ success: true, token: 'mock-jwt-token', user: mockUser }));
app.post('/api/auth/logout', (c) => c.json({ success: true }));

// Stats endpoint with direct numerical fallbacks to fix NaN
app.get('/api/stats', (c) => c.json({
  users: 1,
  posts: 0,
  tweets: 0,
  totalUsers: 1,
  totalPosts: 0,
  activeUsers: 1,
  stats: {
    users: 1,
    posts: 0,
    tweets: 0
  }
}));

// Feature fallbacks
app.get('/api/tweets', (c) => c.json([]));
app.post('/api/tweets', (c) => c.json({ id: Date.now().toString(), text: 'New post', user: mockUser }));
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
