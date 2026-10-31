import cron from 'node-cron';

export const startKeepAliveCron = (port) => {
  if (process.env.NODE_ENV === 'test') return;

  const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;
  const url = `${baseUrl.replace(/\/$/, '')}/health`;

  cron.schedule('*/10 * * * *', async () => {
    try {
      const response = await fetch(url);
      console.log(`Keep-alive ping ${response.ok ? 'succeeded' : 'failed'} (${response.status})`);
    } catch (error) {
      console.error('Keep-alive ping failed:', error.message);
    }
  });
};
