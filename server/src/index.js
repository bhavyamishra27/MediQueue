import http from 'node:http';
import { app } from './app.js';
import { env } from './config/env.js';
import { configureDatabase, prisma } from './config/prisma.js';
import { rebuildQueues } from './services/queue.service.js';
import { initSocketServer } from './realtime/socket.js';

async function start() {
  await configureDatabase();

  const queueState = await rebuildQueues();
  console.log(
    `Rebuilt ${queueState.doctors} doctor queue(s) from SQLite (${queueState.activeEntries} active entries for ${queueState.date}).`,
  );

  const server = http.createServer(app);
  const io = initSocketServer(server);

  server.listen(env.port, () => {
    console.log(`MediQueue API listening on http://localhost:${env.port}`);
    console.log(`Health check: http://localhost:${env.port}/api/health`);
    console.log('Socket.IO realtime updates are enabled.');
  });

  const shutdown = (signal) => {
    console.log(`\n${signal} received. Shutting down...`);
    io.close();
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });

    // Do not let a stuck connection keep the process alive forever.
    setTimeout(() => process.exit(1), 5000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch(async (error) => {
  console.error('Failed to start MediQueue API:', error);
  await prisma.$disconnect();
  process.exit(1);
});
