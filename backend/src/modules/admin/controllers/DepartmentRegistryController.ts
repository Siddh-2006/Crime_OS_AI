import { Request, Response } from 'express';
import axios from 'axios';
import { DepartmentRegistry } from '../models/DepartmentRegistry.model';
import { sendSuccess, sendError } from '../../../shared/utils/response.util';
import { HttpStatusCode } from '../../../common/enums/httpStatus.enum';
import env from '../../../config/env';
import logger from '../../../config/logger';

// ─── OLD implementation (subprocess + mock accounts + JSON sync) ──────────────
// Removed: exec(python embed_records ...), syncToJSON(), createMockAccount()
// Replaced with: HTTP calls to legal_agent FastAPI /registry/upsert and /registry/:uuid
// ─────────────────────────────────────────────────────────────────────────────

const legalAgentUrl = env.LEGAL_AGENT_URL; // http://localhost:8004

/**
 * Call legal_agent to embed a single dept record and upsert into Qdrant.
 * Returns the qdrant_uuid to store back in MongoDB.
 * Falls back gracefully — a missing qdrant_uuid just means no vector exists yet.
 */
async function upsertDeptVector(deptData: any, existingUuid?: string): Promise<string | null> {
  try {
    logger.info(`[DeptRegistry] Requesting embedding for "${deptData.entity_id}" via legal_agent /registry/upsert (BGE primary, Nomic fallback)`);
    const res = await axios.post(`${legalAgentUrl}/registry/upsert`, {
      ...deptData,
      act: 'department_registry',
      qdrant_uuid: existingUuid ?? null,
    }, { timeout: 120_000 });
    const uuid = res.data?.qdrant_uuid ?? null;
    logger.info(`[DeptRegistry] Embedding complete for "${deptData.entity_id}" — qdrant_uuid: ${uuid ?? 'null'}`);
    return uuid;
  } catch (err: any) {
    logger.warn(`[DeptRegistry] Failed to upsert vector for "${deptData.entity_id}": ${err.message} — check legal_agent logs for embedding backend details`);
    return null;
  }
}

/**
 * Call legal_agent to delete a single Qdrant point by UUID.
 */
async function deleteDeptVector(uuid: string): Promise<void> {
  try {
    await axios.delete(`${legalAgentUrl}/registry/${uuid}`, { timeout: 15_000 });
  } catch (err: any) {
    logger.warn(`[DeptRegistry] Failed to delete vector ${uuid}: ${err.message}`);
  }
}

export class DepartmentRegistryController {

  /** GET /admin/departments — list all (active + inactive) */
  static async getDepartments(_req: Request, res: Response): Promise<void> {
    try {
      // Return all departments so admin can see inactive ones and re-activate
      const departments = await DepartmentRegistry.find().sort({ isActive: -1, entity_name: 1 });
      sendSuccess(res, HttpStatusCode.OK, 'Departments retrieved successfully', departments);
    } catch (error: any) {
      logger.error('Error fetching departments:', error);
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, 'Error fetching departments');
    }
  }

  /** POST /admin/departments — create new department */
  static async addDepartment(req: Request, res: Response): Promise<void> {
    try {
      const deptData = req.body;

      const existing = await DepartmentRegistry.findOne({ entity_id: deptData.entity_id });
      if (existing) {
        sendError(res, HttpStatusCode.BAD_REQUEST, 'A department with this entity_id already exists');
        return;
      }

      const newDept = new DepartmentRegistry({ ...deptData, isActive: true });
      await newDept.save();

      // Embed and store the Qdrant UUID back into MongoDB (fire-and-update)
      const qdrantUuid = await upsertDeptVector(deptData);
      if (qdrantUuid) {
        await DepartmentRegistry.findByIdAndUpdate(newDept._id, { qdrant_uuid: qdrantUuid });
        (newDept as any).qdrant_uuid = qdrantUuid;
      }

      sendSuccess(res, HttpStatusCode.CREATED, 'Department added successfully', newDept);
    } catch (error: any) {
      logger.error('Error adding department:', error);
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, 'Error adding department');
    }
  }

  /** PUT /admin/departments/:id — update existing department */
  static async updateDepartment(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const deptData = req.body;

      const existing = await DepartmentRegistry.findById(id);
      if (!existing) {
        sendError(res, HttpStatusCode.NOT_FOUND, 'Department not found');
        return;
      }

      const updated = await DepartmentRegistry.findByIdAndUpdate(id, deptData, { new: true });
      if (!updated) {
        sendError(res, HttpStatusCode.NOT_FOUND, 'Department not found');
        return;
      }

      // Re-embed with same UUID so Qdrant point is overwritten in-place
      const qdrantUuid = await upsertDeptVector(
        { ...updated.toObject(), ...deptData },
        existing.qdrant_uuid ?? undefined,
      );
      if (qdrantUuid && qdrantUuid !== existing.qdrant_uuid) {
        await DepartmentRegistry.findByIdAndUpdate(id, { qdrant_uuid: qdrantUuid });
        (updated as any).qdrant_uuid = qdrantUuid;
      }

      sendSuccess(res, HttpStatusCode.OK, 'Department updated successfully', updated);
    } catch (error: any) {
      logger.error('Error updating department:', error);
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, 'Error updating department');
    }
  }

  /** PATCH /admin/departments/:id/deactivate — soft-delete, remove vector */
  static async deactivateDepartment(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const existing = await DepartmentRegistry.findById(id);
      if (!existing) {
        sendError(res, HttpStatusCode.NOT_FOUND, 'Department not found');
        return;
      }

      const updated = await DepartmentRegistry.findByIdAndUpdate(
        id,
        { isActive: false },
        { new: true },
      );

      // Remove from Qdrant so it no longer appears in RAG queries
      if (existing.qdrant_uuid) {
        await deleteDeptVector(existing.qdrant_uuid);
      }

      sendSuccess(res, HttpStatusCode.OK, 'Department deactivated successfully', updated);
    } catch (error: any) {
      logger.error('Error deactivating department:', error);
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, 'Error deactivating department');
    }
  }

  /** PATCH /admin/departments/:id/activate — re-activate, re-embed vector */
  static async activateDepartment(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const existing = await DepartmentRegistry.findById(id);
      if (!existing) {
        sendError(res, HttpStatusCode.NOT_FOUND, 'Department not found');
        return;
      }

      const updated = await DepartmentRegistry.findByIdAndUpdate(
        id,
        { isActive: true },
        { new: true },
      );

      // Re-embed — reuse existing UUID if available so the same Qdrant point is restored
      const qdrantUuid = await upsertDeptVector(
        existing.toObject(),
        existing.qdrant_uuid ?? undefined,
      );
      if (qdrantUuid) {
        await DepartmentRegistry.findByIdAndUpdate(id, { qdrant_uuid: qdrantUuid });
      }

      sendSuccess(res, HttpStatusCode.OK, 'Department activated successfully', updated);
    } catch (error: any) {
      logger.error('Error activating department:', error);
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, 'Error activating department');
    }
  }
}
