// @ts-check
const { teardownTestEnvironment } = require('./test-setup');

module.exports = async () => {
  await teardownTestEnvironment();
};