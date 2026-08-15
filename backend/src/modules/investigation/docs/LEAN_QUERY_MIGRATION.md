# Evidence Encryption - Lean Query Migration Guide

## Summary

When using `.lean()` with Mongoose queries, post-hooks (including decryption) are skipped for performance reasons. This guide shows how to update existing `.lean()` queries to properly decrypt Evidence data.

---

## Files That Need Updates

### 1. DepartmentPortalController.ts (Line 119)

**Current Code:**
```typescript
const evidences = await Evidence.find({ evidence_id: { $in: allEvidenceIds } }).lean();
```

**Updated Code:**
```typescript
import { EvidenceRepository } from '../../investigation/repositories/EvidenceRepository';

const repo = new EvidenceRepository();
const evidences = await repo.findByIdsLean(allEvidenceIds);
```

---

### 2. InvestigationController.ts (Lines 951 & 1241)

**Line 951 - Current Code:**
```typescript
const evidenceDocs = await Evidence.find({ case_id: id }).sort({ createdAt: -1 }).lean() as any[];
```

**Line 951 - Updated Code:**
```typescript
import { EvidenceRepository } from '../../investigation/repositories/EvidenceRepository';

const repo = new EvidenceRepository();
const evidenceDocs = await repo.findByCaseIdLean(id);
```

**Line 1241 - Current Code:**
```typescript
const evidences = await Evidence.find({ evidence_id: { $in: Array.from(allEvidenceIds) } }).lean();
```

**Line 1241 - Updated Code:**
```typescript
import { EvidenceRepository } from '../../investigation/repositories/EvidenceRepository';

const repo = new EvidenceRepository();
const evidences = await repo.findByIdsLean(Array.from(allEvidenceIds));
```

---

### 3. caseDiaryService.ts (Line 364)

**Current Code:**
```typescript
Evidence.find({ case_id: caseObjectId }).sort({ createdAt: 1 }).lean().exec(),
```

**Updated Code:**
```typescript
import { EvidenceRepository } from '../../investigation/repositories/EvidenceRepository';

const repo = new EvidenceRepository();
// In the Promise.all or async block:
const evidence = await repo.findByCaseIdLean(caseObjectId);
// Note: You may need to apply .sort() and .exec() if not in the method
```

---

### 4. ChargeSheetGenerator.ts (Line 28)

**Current Code:**
```typescript
const evidence = await Evidence.find({ case_id: caseObjectId }).lean();
```

**Updated Code:**
```typescript
import { EvidenceRepository } from '../../investigation/repositories/EvidenceRepository';

const repo = new EvidenceRepository();
const evidence = await repo.findByCaseIdLean(caseObjectId);
```

---

### 5. factsAssemblyService.ts (Line 221)

**Current Code:**
```typescript
Evidence.find({ case_id: oid }).lean().exec(),
```

**Updated Code:**
```typescript
import { EvidenceRepository } from '../../investigation/repositories/EvidenceRepository';

const repo = new EvidenceRepository();
// In the Promise.all or async block:
const evidence = await repo.findByCaseIdLean(oid);
```

---

### 6. GmailService.ts (Line 283)

**Current Code:**
```typescript
const currentEvidences = await Evidence.find({ case_id: caseId, evidence_id: { $in: evidenceIds } }).lean();
```

**Updated Code:**
```typescript
import { EvidenceRepository } from '../../../investigation/repositories/EvidenceRepository';

const repo = new EvidenceRepository();
const currentEvidences = await repo.findByIdsLean(evidenceIds);
// Note: The caseId filter is now in the repo method, adjust if needed:
// Alternative if caseId filter is critical:
const currentEvidences = await repo.findByCaseIdLean(caseId);
const filtered = currentEvidences.filter(e => evidenceIds.includes(e.evidence_id));
```

---

## Available Repository Methods

After these updates, you can use the following decryption-aware methods:

```typescript
import { EvidenceRepository } from '../repositories/EvidenceRepository';
const repo = new EvidenceRepository();

// For .lean() queries (manual decryption):
await repo.findByCaseIdLean(caseId);          // Find by case with decryption
await repo.findByEvidenceIdLean(evidenceId);  // Find one by ID with decryption
await repo.findByIdsLean(ids);                 // Find by multiple IDs with decryption
await repo.findByCaseIdAndStatusLean(caseId, status); // Find by case and status

// Without .lean() (automatic decryption via hooks):
await repo.findByCaseId(caseId);
await repo.findByEvidenceId(evidenceId);
await repo.findByCaseIdAndStatus(caseId, status);
await repo.create(data);
await repo.updateStatus(evidenceId, status);
await repo.updateAiMetadata(evidenceId, data);
```

---

## Key Differences

### With `.lean()` (Returns Plain Objects)
```typescript
const evidence = await repo.findByCaseIdLean(caseId);
// Returns: IEvidence[] (plain JS objects, no Mongoose methods)
// Decryption: Manual (handled by repository helper)
// Performance: Faster (no Mongoose wrapper)
// Use when: You only need to read data, not modify
```

### Without `.lean()` (Returns Mongoose Documents)
```typescript
const evidence = await repo.findByCaseId(caseId);
// Returns: IEvidence[] (Mongoose documents)
// Decryption: Automatic (via post-hooks)
// Performance: Slightly slower (Mongoose overhead)
// Use when: You need to modify and save documents
```

---

## Testing Updates

After updating a file, verify by:

1. **Build the TypeScript**: `npm run build` (in backend directory)
2. **Check for import errors**: Ensure `EvidenceRepository` import is correct
3. **Run tests** (if applicable): `npm test`
4. **Test the route/function**: Verify decrypted data is displayed correctly

---

## Common Issues

### Issue: "Cannot find module 'EvidenceRepository'"

**Solution**: Check the import path matches your project structure:
```typescript
// Check your file location relative to repository:
import { EvidenceRepository } from '../../investigation/repositories/EvidenceRepository';
```

### Issue: Data Still Appears Encrypted

**Cause**: Using `.lean()` without repository method or repository not imported
**Solution**: Ensure you're using one of the `*Lean` methods from the repository

### Issue: Cannot find method `sort()` on repository result

**Cause**: Repository methods already handle common operations
**Solution**: If you need custom sorting, do it in application code:
```typescript
const evidence = await repo.findByCaseIdLean(caseId);
const sorted = evidence.sort((a, b) => a.createdAt - b.createdAt);
```

---

## Priority Order (Recommended)

Update files in this order (most critical first):

1. **ChargeSheetGenerator.ts** - Used in report generation
2. **factsAssemblyService.ts** - Used in analysis
3. **InvestigationController.ts** - Core investigation endpoints
4. **DepartmentPortalController.ts** - Department portal endpoints
5. **caseDiaryService.ts** - Case diary generation
6. **GmailService.ts** - Email service

---

## Batch Update Script

If you have many files to update, you can create a script:

```bash
# Find all .lean() calls with Evidence
grep -r "Evidence\.find.*\.lean" backend/src --include="*.ts"

# Count total occurrences
grep -r "Evidence\.find.*\.lean" backend/src --include="*.ts" | wc -l
```

---

## Verification Checklist

- [ ] ENCRYPTION_KEY environment variable is set
- [ ] All 6 files have been updated with repository methods
- [ ] TypeScript compiles without errors
- [ ] No syntax errors in modified files
- [ ] Tests pass (if applicable)
- [ ] Decrypted data displays correctly in UI/API responses
- [ ] Evidence creation/update still works
- [ ] Old plaintext data still works (isEncrypted = false)
