const { app } = require('./app');
const { seedDemoUsers } = require('./seedDemoUsers');

const PORT = process.env.PORT || 3001;

async function start() {
  if (process.env.DEMO_MODE === 'true') {
    await seedDemoUsers();
  }
  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

start();