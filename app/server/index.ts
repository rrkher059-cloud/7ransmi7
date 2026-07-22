import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';

const app = new Hono();

app.use('*', cors());

// Root route
app.get('/', (c) => c.text('Chirp API is live and running!'));

// Health check endpoint
app.get('/api/health', (c) => c.json({ status: 'ok' }));

const port = Number(process.env.PORT) || 8787;

console.log(`Server starting on port ${port}...`);

serve({
  fetch: app.fetch,
  port
});
