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
  handle: 'rrkher059-cloud',
  name: 'Developer',
  avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Developer',
  avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Developer',
  banner: '',
  bannerUrl: '',
  bio: 'Building 7ransmi7',
  location: 'Earth',
  website: 'https://rrkher059-cloud.github.io/7ransmi7/',
  joinedDate: '2026-01-01',
  createdAt: '2026-01-01T00:00:00.000Z',
  followersCount: 0,
  followingCount: 0,
  tweetsCount: 1,
  postsCount: 1
};

const mockTweet = {
  id: '1',
  text: 'Welcome to 7ransmi7! The network is live.',
  content: 'Welcome to 7ransmi7! The network is live.',
  createdAt: '2026-07-22T22:00:00.000Z',
  date: '2026-07-22',
  timestamp: 'Just now',
  likesCount: 0,
  retweetsCount: 0,
  repliesCount: 0,
  likes: 0,
  retweets: 0,
  replies: 0,
  user: mockUser,
  author: mockUser
};

// Auth endpoints
app.get('/api/auth/me', (c) => c.json({ user: mockUser, ...mockUser }));
app.post('/api/auth/login', (c) => c.json({ success: true, token: 'mock-jwt-token', user: mockUser }));
app.post('/api/auth/signup', (c) => c.json({ success: true, token: 'mock-jwt-token', user: mockUser }));
app.post('/api/auth/logout', (c) => c.json({ success: true }));

// Stats endpoint
app.get('/api/stats', (c) => c.json({
  users: 1,
  posts: 1,
  tweets: 1,
  totalUsers: 1,
  totalPosts: 1,
  activeUsers: 1,
  stats: {
    users: 1,
    posts: 1,
    tweets: 1
  }
}));

// Feed & Explore endpoints
app.get('/api/tweets', (c) => c.json([mockTweet]));
app.post('/api/tweets', (c) => c.json(mockTweet));
app.get('/api/explore/trending', (c) => c.json([
  { id: '1', category: 'Tech', tag: '#7ransmi7', name: '#7ransmi7', tweetsCount: 100, posts: 100 }
]));
app.get('/api/explore/suggestions', (c) => c.json([mockUser]));
app.get('/api/messages', (c) => c.json([]));
app.get('/api/notifications', (c) => c.json([]));
app.get('/api/ai/status', (c) => c.json({ status: 'active' }));

const port = Number(process.env.PORT) || 8787;

serve({
  fetch: app.fetch,
  port
});
