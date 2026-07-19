require('dotenv').config();
const { computeConfidenceScore } = require('../dist/modules/investigation/services/confidenceScoringService');

function runTest() {
  console.log("=== CONFIDENCE SCORING ALGORITHM TEST ===");

  // Helper to build a mock FactsObject
  const buildMockFacts = (completedSteps, proofCount, requiredCount, maxCorroboration) => {
    return {
      checklist: {
        steps: [
          {
            step_id: 'step_1',
            status: completedSteps >= 1 ? 'completed' : 'pending',
            criticality: 'high',
            required_evidence: Array(requiredCount).fill('req'),
            proof_evidence_ids: Array(proofCount).fill('proof')
          },
          {
            step_id: 'step_2',
            status: completedSteps >= 2 ? 'completed' : 'pending',
            criticality: 'medium',
            required_evidence: Array(requiredCount).fill('req'),
            proof_evidence_ids: Array(proofCount).fill('proof')
          },
          {
            step_id: 'step_3',
            status: completedSteps >= 3 ? 'completed' : 'pending',
            criticality: 'low',
            required_evidence: [],
            proof_evidence_ids: []
          }
        ]
      },
      entities: {
        raw: [
          {
            corroborating_evidence_ids: Array(maxCorroboration).fill('ev')
          }
        ]
      }
    };
  };

  // 1. Low evidence / Low progress
  const lowFacts = buildMockFacts(0, 0, 2, 0);
  const lowScore = computeConfidenceScore(lowFacts);
  console.log("\n[STATE 1] LOW PROGRESS:");
  console.log(JSON.stringify(lowScore, null, 2));

  // 2. Partial progress
  const partialFacts = buildMockFacts(1, 1, 2, 1);
  const partialScore = computeConfidenceScore(partialFacts);
  console.log("\n[STATE 2] PARTIAL PROGRESS:");
  console.log(JSON.stringify(partialScore, null, 2));

  // 3. Strong / Complete progress
  const strongFacts = buildMockFacts(3, 2, 2, 3);
  const strongScore = computeConfidenceScore(strongFacts);
  console.log("\n[STATE 3] STRONG PROGRESS:");
  console.log(JSON.stringify(strongScore, null, 2));

  // Basic Assertions
  if (lowScore.final_score < partialScore.final_score && partialScore.final_score < strongScore.final_score) {
    console.log("\n✅ SUCCESS: Scores move in the expected direction!");
  } else {
    console.log("\n❌ ERROR: Scores did not increase correctly.");
  }
}

runTest();
