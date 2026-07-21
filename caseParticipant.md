# Case Participant Implementation Summary

This document summarizes what has been implemented for CaseParticipant support in the investigation workflow.

## Implemented

- Deep Analysis now returns snapshot-scoped `participant_recommendations` in addition to the existing case-level `suggested_legal_sections`.
- Participant recommendations can represent Victims, Witnesses, Suspects, Accused, and Complainants.
- Recommended legal sections inside participant recommendations are only emitted for Suspect or Accused roles.
- Existing `suspect_candidates` support remains in place for backward compatibility.
- Facts assembly now includes richer investigation context for Deep Analysis:
  - existing CaseParticipants grouped by role
  - participant identifiers
  - participant profile data where available
  - witness statements and witness evidence references
  - victim details
  - suspect and accused applied legal sections
  - evidence linked to participants
  - complaint details and existing legal section history
- The analysis snapshot model now stores `participant_recommendations` alongside the legacy snapshot fields.
- A participant approval flow was added so an Investigating Officer can convert a recommendation into a persisted `CaseParticipant` or merge it into an existing participant when a match is found.
- New investigation routes were added for:
  - listing case participants
  - approving participant recommendations
  - retrieving the current case charge sheet
- New service/controller placeholders were added for CaseParticipant and ChargeSheet handling, following the existing investigation module structure.

## Preserved Behavior

- Applicable legal sections remain case-level only.
- The Legal Agent continues to retrieve statutory provisions and SOP context.
- Deep Analysis continues to select applicable legal sections from the retrieved legal context.
- Existing investigation APIs and workflow behavior remain backward compatible.

## Notes

- CaseParticipant recommendations are AI suggestions only until explicitly approved by the Investigating Officer.
- When approval is performed, the implementation prefers updating an existing matching participant and merging roles rather than creating duplicates.