import { AnalysisSnapshot, IAnalysisSnapshot } from '../models/AnalysisSnapshot.model';

export class AnalysisSnapshotRepository {
  async create(data: Partial<IAnalysisSnapshot>): Promise<IAnalysisSnapshot> {
    const snapshot = new AnalysisSnapshot(data);
    return snapshot.save();
  }

  async findByCaseId(caseId: string): Promise<IAnalysisSnapshot[]> {
    return AnalysisSnapshot.find({ case_id: caseId }).sort({ timestamp: -1 }).exec();
  }

  async findLatestByCaseId(caseId: string): Promise<IAnalysisSnapshot | null> {
    return AnalysisSnapshot.findOne({ case_id: caseId }).sort({ timestamp: -1 }).exec();
  }

  async findBySnapshotId(snapshotId: string): Promise<IAnalysisSnapshot | null> {
    return AnalysisSnapshot.findOne({ snapshot_id: snapshotId }).exec();
  }

  async findChain(snapshotId: string): Promise<IAnalysisSnapshot[]> {
    // Walk parent_snapshot_id chain to return the audit trail for a snapshot.
    const results: IAnalysisSnapshot[] = [];
    let current = await this.findBySnapshotId(snapshotId);
    while (current) {
      results.push(current);
      current = current.parent_snapshot_id
        ? await this.findBySnapshotId(current.parent_snapshot_id)
        : null;
    }
    return results;
  }
}
