import { createApp } from './app.js';
import { config } from './config/env.js';

const app = createApp();

app.listen(config.port, () => {
  console.log(`📖 Frighton University Library Management System (LMS) running on port ${config.port}`);
  console.log(`📡 Healthcheck: http://localhost:${config.port}/api/health`);
  console.log(`🔗 Connected SIS API: ${config.sis.apiUrl}`);
});
