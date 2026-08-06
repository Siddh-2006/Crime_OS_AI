import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import axios from 'axios';
import logger from '../../config/logger';
import env from '../../config/env';
import { Complaint } from '../../modules/complaint/models/Complaint.model';

export async function triggerComplaintIntelligencePipelineByCaseId(caseId: string): Promise<void> {
  try {
    let complaintNumber = caseId;

    const queryFilters: any[] = [{ complaintNumber: caseId }];
    if (mongoose.Types.ObjectId.isValid(caseId)) {
      queryFilters.push({ _id: new mongoose.Types.ObjectId(caseId) });
    }

    const complaint = await Complaint.findOne({ $or: queryFilters }).select('complaintNumber').lean().exec();
    if (complaint && complaint.complaintNumber) {
      complaintNumber = complaint.complaintNumber;
    }

    logger.info(`[ComplaintIntelligence] Triggering pipeline on rerun for caseId: ${caseId} (complaintNumber: ${complaintNumber})`);

    // 1. Try calling the Complaint Intelligence microservice HTTP endpoint first
    const microserviceUrl = env.COMPLAINT_INTELLIGENCE_URL || 'http://localhost:8000';
    try {
      const response = await axios.post(`${microserviceUrl}/trigger-full-pipeline`, {
        complaint_number: complaintNumber,
      }, { timeout: 5000 });

      if (response.status === 200 || response.status === 202) {
        logger.info(`[ComplaintIntelligence] Successfully triggered pipeline via HTTP microservice API for ${complaintNumber}`);
        return;
      }
    } catch (httpError: any) {
      logger.warn(`[ComplaintIntelligence] Microservice HTTP endpoint at ${microserviceUrl} un-reachable (${httpError?.message}). Falling back to process spawn.`);
    }

    // 2. Fallback: Spawn Python process directly if microservice HTTP endpoint is unavailable
    const scriptPath = path.resolve(__dirname, '../../../../services/complaint_intelligence/run_pipeline_from_atlas.py');
    const venvPythonIntell = path.resolve(__dirname, '../../../../services/complaint_intelligence/.venv/Scripts/python.exe');
    const venvPythonRoot = path.resolve(__dirname, '../../../../services/.venv/Scripts/python.exe');
    const pythonExec = process.platform === 'win32'
      ? (fs.existsSync(venvPythonIntell) ? venvPythonIntell : (fs.existsSync(venvPythonRoot) ? venvPythonRoot : 'python'))
      : 'python';

    const scriptDir = path.dirname(scriptPath);
    const pyProcess = spawn(pythonExec, [scriptPath, complaintNumber], {
      cwd: scriptDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUTF8: '1', MONGODB_DB: process.env.MONGODB_DB || 'test' }
    });

    pyProcess.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString('utf-8').split(/\r?\n/);
      for (const line of lines) {
        if (line.trim()) {
          logger.info(`[ComplaintIntelligence] ${line}`);
        }
      }
    });

    pyProcess.stderr?.on('data', (data: Buffer) => {
      const lines = data.toString('utf-8').split(/\r?\n/);
      for (const line of lines) {
        if (line.trim()) {
          logger.error(`[ComplaintIntelligence Error] ${line}`);
        }
      }
    });

    pyProcess.on('close', (code: number) => {
      if (code === 0) {
        logger.info(`[ComplaintIntelligence] Pipeline rerun completed successfully for ${complaintNumber}`);
      } else {
        logger.error(`[ComplaintIntelligence] Pipeline rerun exited with code ${code} for ${complaintNumber}`);
      }
    });
  } catch (err: any) {
    logger.error(`[ComplaintIntelligence] Failed to trigger pipeline rerun for caseId ${caseId}`, { error: err?.message });
  }
}

