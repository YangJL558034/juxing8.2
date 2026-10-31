import 'dotenv/config';
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { setupChatSocket } from './lib/chat-socket';
import { startContractReminderScheduler } from './lib/contract-reminder';

const dev =
  process.argv.includes('--dev') ||
  process.env.npm_lifecycle_event === 'dev' ||
  (process.env.NODE_ENV !== 'production' &&
    process.env.COZE_PROJECT_ENV !== 'PROD' &&
    process.env.npm_lifecycle_event !== 'start');
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '5000', 10);

// Create Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });

  setupChatSocket(server);
  startContractReminderScheduler();

  server.once('error', err => {
    console.error(err);
    process.exit(1);
  });
  server.listen({ port, host: '::' }, () => {
    console.log(
      `> Server listening at http://${hostname}:${port} as ${
        dev ? 'development' : process.env.COZE_PROJECT_ENV
      }`,
    );
    console.log(`> IPv4: http://localhost:${port}`);
    console.log(`> IPv6: http://[::1]:${port}`);
  });
});
