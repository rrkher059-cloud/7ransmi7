import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';

const app = new Hono();

app.use('*', cors());

// Root health check route so Render gets a 200 OK
app.get('/', (c) => c.text('Chirp API is live and running!'));

// Example API endpoint
app.get('/api/health', (c) => c.json({ status: 'ok' }));

// Use Render environment port, fallback to 8787 locally
const port = Number(process.env.PORT) || 8787;

console.log(`Server starting on port ${port}...`);

serve({
  fetch: app.fetch,
  port
});
