'use strict';

require('dotenv').config(); // Load backend/.env

const { callLegalAgent } = require('../dist/shared/clients/legalAgentClient');
const { callIoRecommendation } = require('../dist/shared/clients/ioRecommendationClient');

async function run() {
  console.log('Testing Legal Agent Client...');
  const legalResult = await callLegalAgent('UPI fraud, KYC received, next step');
  console.log('Legal Agent Result:', JSON.stringify(legalResult, null, 2));

  console.log('\nTesting IO Recommendation Client...');
  const ioResult = await callIoRecommendation('UPI fraud, KYC received, next step');
  console.log('IO Recommendation Result:', JSON.stringify(ioResult, null, 2));

  console.log('\nTest complete.');
}

run().catch(console.error);
