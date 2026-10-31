import dotenv from 'dotenv';

dotenv.config();

const { default: app } = await import('./app.js');
const { assertAuthConfig } = await import('./config/auth.js');
const { keepSupabaseWarm } = await import('./utils/keepAlive.js');
const { startKeepAliveCron } = await import('./utils/keepAliveCron.js');

const PORT = process.env.PORT || 5000;

try {
  assertAuthConfig();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

app.listen(PORT, () => {
  console.log(`🚀 CitiCare Backend running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 Supabase URL: ${process.env.SUPABASE_URL ? 'Configured ✓' : 'Missing ✗'}`);
  // Establish (and briefly hold) the remote database connection so the first
  // page load after a backend restart is not paying a TLS handshake.
  keepSupabaseWarm();
  startKeepAliveCron(PORT);
});

export default app;
