import 'dotenv/config';
import { createApp } from './app.js';

const PORT = process.env.PORT || 4000;

const app = createApp();
app.listen(PORT, () => {
  console.log(`Dayflow HRMS API running at http://localhost:${PORT}`);
});
