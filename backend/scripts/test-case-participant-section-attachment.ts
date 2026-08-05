import assert from 'assert/strict';
import { resolveAllowedSectionsForParticipant } from '../src/modules/investigation/services/caseParticipantService';

const snapshot = {
  suggested_legal_sections: [],
  participant_recommendations: [
    {
      name: 'Rakesh Sharma',
      roles: ['Suspect'],
      recommended_sections: [
        { code: 'IPC 420', title: 'Cheating', reason: 'Fraudulent inducement' },
      ],
    },
  ],
};

const participant = {
  name: 'Rakesh Sharma',
  roles: ['Suspect'],
};

const allowed = resolveAllowedSectionsForParticipant(snapshot as any, participant as any);
assert.equal(allowed.length, 1, 'Expected one allowed section from the participant recommendation');
assert.equal(allowed[0].code, 'IPC 420');
console.log('case-participant-section-attachment: ok');
