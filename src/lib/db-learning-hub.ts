import { createPool } from './db/pool';

const learningHubPool = createPool(process.env.LEARNING_HUB_DB_NAME || 'learning_hub_db', {
  key: 'learning-hub',
  label: 'learningHubPool',
});

export default learningHubPool;
