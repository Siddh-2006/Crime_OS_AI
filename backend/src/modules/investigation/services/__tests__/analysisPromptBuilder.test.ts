import assert from 'assert';
import { buildDeepPrompt } from '../analysisPromptBuilder';

const facts = {
  evidence: {
    items: [
      {
        evidence_id: 'EV-001',
        type: 'screenshot',
        status: 'verified',
        ai_description: 'Suspicious payment screenshot',
        applicable_sections: [{ code: 'BNS-117', title: 'Cheating' }],
      },
    ],
  },
};

const prompt = buildDeepPrompt(facts as any, { retrieved_chunks: [] }, { evidence_coverage: 0.5 } as any, '(none)', 'en');

assert.match(prompt.system, /evidence_section_recommendations/i);
assert.match(prompt.user, /evidence/i);
assert.match(prompt.user, /applicable_sections/i);

console.log('analysis prompt builder test passed');
