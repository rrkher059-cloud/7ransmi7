import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';

const app = new Hono();

// Configure CORS explicitly for your GitHub Pages origin
app.use('*', cors({
  origin: ['https://rrkher059-cloud.github.io', 'http://localhost:5173'],
  credentials: true,
}));

// Root health check
app.get('/', (c) => c.text('Chirp API is live and running!'));
app.get('/api/health', (c) => c.json({ status: 'ok' }));

// User auth check route
app.get('/api/auth/me', (c) => {
  return c.json({
    id: '1',
    username: 'rrkher059-cloud',
    name: 'Developer',
    avatar: '',
    banner: ''
  });
});

// App stats route
app.get('/api/stats', (c) => {
  return c.json({
    users: 1,
    posts: 0
  });
});

const port = Number(process.env.PORT) || 8787;

serve({
  fetch: app.fetch,
  port
});
