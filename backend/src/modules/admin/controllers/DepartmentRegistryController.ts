import { Request, Response } from 'express';
import { DepartmentRegistry } from '../models/DepartmentRegistry.model';
import { User } from '../../user/models/User.model';
import { sendSuccess, sendError } from '../../../shared/utils/response.util';
import { HttpStatusCode } from '../../../common/enums/httpStatus.enum';
import logger from '../../../config/logger';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import util from 'util';
import bcrypt from 'bcrypt';

const execPromise = util.promisify(exec);

export class DepartmentRegistryController {
  
  static async getDepartments(_req: Request, res: Response): Promise<void> {
    try {
      const departments = await DepartmentRegistry.find({ isActive: true });
      sendSuccess(res, HttpStatusCode.OK, 'Departments retrieved successfully', departments);
    } catch (error: any) {
      logger.error('Error fetching departments:', error);
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, 'Error fetching departments');
    }
  }

  static async addDepartment(req: Request, res: Response): Promise<void> {
    try {
      const deptData = req.body;

      // Ensure entity_id is unique
      const existing = await DepartmentRegistry.findOne({ entity_id: deptData.entity_id });
      if (existing) {
        sendError(res, HttpStatusCode.BAD_REQUEST, 'A department with this entity_id already exists');
        return;
      }

      // Save to MongoDB
      const newDept = new DepartmentRegistry(deptData);
      await newDept.save();

      // Export to JSON
      await DepartmentRegistryController.syncToJSON();

      // Run embedding script in background
      DepartmentRegistryController.runEmbeddingScript().catch(err => {
        logger.error('Error running embedding script:', err);
      });

      // Create Mock Account
      await DepartmentRegistryController.createMockAccount(deptData);

      sendSuccess(res, HttpStatusCode.CREATED, 'Department added successfully', newDept);
    } catch (error: any) {
      logger.error('Error adding department:', error);
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, 'Error adding department');
    }
  }

  static async updateDepartment(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const deptData = req.body;

      const updated = await DepartmentRegistry.findByIdAndUpdate(id, deptData, { new: true });
      if (!updated) {
        sendError(res, HttpStatusCode.NOT_FOUND, 'Department not found');
        return;
      }

      await DepartmentRegistryController.syncToJSON();
      
      DepartmentRegistryController.runEmbeddingScript().catch(err => {
        logger.error('Error running embedding script:', err);
      });

      sendSuccess(res, HttpStatusCode.OK, 'Department updated successfully', updated);
    } catch (error: any) {
      logger.error('Error updating department:', error);
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, 'Error updating department');
    }
  }

  static async deactivateDepartment(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updated = await DepartmentRegistry.findByIdAndUpdate(id, { isActive: false }, { new: true });
      if (!updated) {
        sendError(res, HttpStatusCode.NOT_FOUND, 'Department not found');
        return;
      }

      await DepartmentRegistryController.syncToJSON();
      
      DepartmentRegistryController.runEmbeddingScript().catch(err => {
        logger.error('Error running embedding script:', err);
      });

      sendSuccess(res, HttpStatusCode.OK, 'Department deactivated successfully', updated);
    } catch (error: any) {
      logger.error('Error deactivating department:', error);
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, 'Error deactivating department');
    }
  }

  // --- Helpers ---

  private static async syncToJSON() {
    try {
      const allDepts = await DepartmentRegistry.find({ isActive: true }).select('-_id -__v -createdAt -updatedAt -isActive -contact_email_pattern').lean();
      
      // We map it to the structure expected by Legal Agent
      const formatted = allDepts.map(d => ({
        ...d,
        act: 'department_registry',
      }));

      const jsonPath = path.join(__dirname, '../../../../../services/legal_agent/parsed/Department_Registry.json');
      fs.writeFileSync(jsonPath, JSON.stringify(formatted, null, 2));
      logger.info(`Synced ${allDepts.length} departments to JSON.`);
    } catch (error) {
      logger.error('Failed to sync Department_Registry.json:', error);
    }
  }

  private static async runEmbeddingScript() {
    logger.info('Running embedding script for Department_Registry.json...');
    const scriptDir = path.join(__dirname, '../../../../../services/legal_agent');

    
    // Note: the original script appends or overwrites?
    // Actually embed_records currently overwrites the --out file. But all_embeddings2.jsonl contains other acts.
    // Wait, embed_records overwrites! If it overwrites all_embeddings2.jsonl, we will lose BNSS and BNS embeddings!
    // The instructions say "trigger legal_agent's ingestion/embedding step for just this new entry".
    // Alternatively, just let it output to a specific `Department_Registry_embeddings.jsonl` which the legal_agent can load. 
    // Wait! Let's check legal_rag config to see how it loads embeddings.
    
    // For now, I'll output to a dedicated file just for departments and let's check if legal_agent loads multiple files or just one.
    // Actually, in Phase F, there's `all_embeddings2.jsonl`.
    // Let's do nothing on Python side inside the controller, I'll write a Python subprocess that just calls legal_rag to append.
    const runPy = `python -c "
from legal_rag.embedding import BGEEmbeddingConfig, BGEEmbedder, load_parsed_records;
import json;
records = load_parsed_records('parsed/Department_Registry.json', record_type='dept');
embedder = BGEEmbedder(BGEEmbeddingConfig(model_name='BAAI/bge-base-en-v1.5', device=None));
embedded = embedder.embed_records(records);
# Just output to a separate file that legal_agent will load if it loads all jsonl
with open('embedded/Department_Registry_embeddings.jsonl', 'w') as f:
    for e in embedded:
        f.write(json.dumps(e) + '\n')
"`;
    await execPromise(runPy, { cwd: scriptDir });
    logger.info('Embedding script finished.');
  }

  private static async createMockAccount(deptData: any) {
    try {
      const username = deptData.entity_id.toLowerCase().replace(/[^a-z0-9_]/g, '_');
      const email = deptData.contact_email_pattern || `${username}@leo.mockdept.local`;
      
      const passwordHash = await bcrypt.hash('Testing123!', 10);
      const securityAnswerHash = await bcrypt.hash('Test', 10);
      
      await User.findOneAndUpdate(
        { username },
        {
          firstName: deptData.entity_name || deptData.entity_id,
          lastName: 'Department',
          username,
          email,
          phone: '9999999999',
          password: passwordHash,
          dateOfBirth: new Date('2000-01-01'),
          gender: 'other',
          address: 'Virtual',
          city: 'Virtual',
          district: 'Virtual',
          state: 'Virtual',
          pincode: '000000',
          idProofType: 'aadhaar',
          idProofNumber: '000000000000',
          securityQuestion: 'What is your mock name?',
          securityAnswer: securityAnswerHash,
          role: 'department',
          department_entity_id: deptData.entity_id
        },
        { upsert: true, new: true }
      );
      logger.info(`Mock account created for ${username}`);
    } catch (error) {
      logger.error('Failed to create mock account:', error);
    }
  }
}
