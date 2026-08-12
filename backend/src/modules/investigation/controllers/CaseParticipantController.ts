import { Request, Response } from 'express';
import { HttpStatusCode } from '../../../common/enums/httpStatus.enum';
import { sendError, sendSuccess } from '../../../shared/utils/response.util';
import { CaseParticipantService } from '../services/caseParticipantService';

export class CaseParticipantController {
  static async listCaseParticipants(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const participants = await CaseParticipantService.listByCaseId(id);
      sendSuccess(res, HttpStatusCode.OK, 'Fetched case participants', participants);
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'PARTICIPANTS_FETCH_FAILED',
        message: error instanceof Error ? error.message : 'Failed to fetch case participants',
      });
    }
  }

  static async approveRecommendation(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { recommendation, participant_id, contact, identifiers, victimProfile, witnessProfile, suspectProfile, complainantProfile, snapshot_id } = req.body;

      if (!recommendation) {
        sendError(res, HttpStatusCode.BAD_REQUEST, { code: 'INVALID_INPUT', message: 'recommendation is required' });
        return;
      }

      const participant = await CaseParticipantService.approveRecommendation(id, {
        recommendation, participant_id, contact, identifiers, victimProfile, witnessProfile, suspectProfile, complainantProfile, snapshot_id,
      });

      sendSuccess(res, HttpStatusCode.CREATED, 'Participant recommendation approved', participant);
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'PARTICIPANT_APPROVAL_FAILED',
        message: error instanceof Error ? error.message : 'Failed to approve recommendation',
      });
    }
  }

  static async attachSections(req: Request, res: Response): Promise<void> {
    try {
      const { id, participantId } = req.params;
      const { sections } = req.body;
      const attachedByOfficerId = req.user?.sub;

      if (!attachedByOfficerId) {
        sendError(res, HttpStatusCode.UNAUTHORIZED, {
          code: 'UNAUTHORIZED',
          message: 'Authenticated officer context is required',
        });
        return;
      }

      if (!Array.isArray(sections) || sections.length === 0) {
        sendError(res, HttpStatusCode.BAD_REQUEST, {
          code: 'INVALID_INPUT',
          message: 'sections is required and must be a non-empty array',
        });
        return;
      }

      const participant = await CaseParticipantService.attachSectionsToParticipant(id, participantId, {
        sections,
        attachedByOfficerId,
      });

      sendSuccess(res, HttpStatusCode.OK, 'Sections attached to participant', participant);
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'SECTION_ATTACH_FAILED',
        message: error instanceof Error ? error.message : 'Failed to attach sections',
      });
    }
  }

  static async promoteToAccused(req: Request, res: Response): Promise<void> {
    try {
      const { id, participantId } = req.params;
      const participant = await CaseParticipantService.promoteToAccused(id, participantId);
      sendSuccess(res, HttpStatusCode.OK, 'Participant promoted to Accused', participant);
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'PROMOTE_ACCUSED_FAILED',
        message: error instanceof Error ? error.message : 'Failed to promote participant to Accused',
      });
    }
  }

  static async createParticipant(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { name, roles, contact, identifiers, victimProfile, witnessProfile, suspectProfile, complainantProfile } = req.body;

      if (!name || !Array.isArray(roles) || roles.length === 0) {
        sendError(res, HttpStatusCode.BAD_REQUEST, { code: 'INVALID_INPUT', message: 'name and roles are required' });
        return;
      }

      const participant = await CaseParticipantService.createParticipant(id, {
        name, roles, contact, identifiers, victimProfile, witnessProfile, suspectProfile, complainantProfile,
      });

      sendSuccess(res, HttpStatusCode.CREATED, 'Participant created successfully', participant);
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'PARTICIPANT_CREATE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to create participant',
      });
    }
  }

  static async updateParticipant(req: Request, res: Response): Promise<void> {
    try {
      const { id, participantId } = req.params;
      const { name, roles, contact, identifiers, victimProfile, witnessProfile, suspectProfile, complainantProfile } = req.body;

      const participant = await CaseParticipantService.updateParticipant(id, participantId, {
        name, roles, contact, identifiers, victimProfile, witnessProfile, suspectProfile, complainantProfile,
      });

      sendSuccess(res, HttpStatusCode.OK, 'Participant updated successfully', participant);
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'PARTICIPANT_UPDATE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to update participant',
      });
    }
  }

  static async deleteParticipant(req: Request, res: Response): Promise<void> {
    try {
      const { id, participantId } = req.params;

      await CaseParticipantService.deleteParticipant(id, participantId);

      sendSuccess(res, HttpStatusCode.OK, 'Participant deleted successfully', null);
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'PARTICIPANT_DELETE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to delete participant',
      });
    }
  }

  /** POST /cases/:id/participants/:participantId/statements */
  static async addStatement(req: Request, res: Response): Promise<void> {
    try {
      const { id, participantId } = req.params;
      const { content, recordedAt } = req.body;

      if (!content || typeof content !== 'string' || !content.trim()) {
        sendError(res, HttpStatusCode.BAD_REQUEST, { code: 'INVALID_INPUT', message: 'content is required' });
        return;
      }

      if (!recordedAt) {
        sendError(res, HttpStatusCode.BAD_REQUEST, { code: 'INVALID_INPUT', message: 'recordedAt is required' });
        return;
      }

      const participant = await CaseParticipantService.addStatement(id, participantId, {
        content: content.trim(),
        recordedAt: new Date(recordedAt),
      });

      sendSuccess(res, HttpStatusCode.CREATED, 'Statement added', participant);
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'STATEMENT_ADD_FAILED',
        message: error instanceof Error ? error.message : 'Failed to add statement',
      });
    }
  }

  /** DELETE /cases/:id/participants/:participantId/statements/:statementId */
  static async deleteStatement(req: Request, res: Response): Promise<void> {
    try {
      const { id, participantId, statementId } = req.params;
      const participant = await CaseParticipantService.deleteStatement(id, participantId, statementId);
      sendSuccess(res, HttpStatusCode.OK, 'Statement deleted', participant);
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'STATEMENT_DELETE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to delete statement',
      });
    }
  }

  /** POST /cases/:id/participants/:participantId/reasoning */
  static async addReasoning(req: Request, res: Response): Promise<void> {
    try {
      const { id, participantId } = req.params;
      const { content, source } = req.body;

      if (!content || typeof content !== 'string' || !content.trim()) {
        sendError(res, HttpStatusCode.BAD_REQUEST, { code: 'INVALID_INPUT', message: 'content is required' });
        return;
      }

      const participant = await CaseParticipantService.addReasoning(id, participantId, {
        content: content.trim(),
        source: source === 'ai' ? 'ai' : 'officer',
      });

      sendSuccess(res, HttpStatusCode.CREATED, 'Reasoning added', participant);
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'REASONING_ADD_FAILED',
        message: error instanceof Error ? error.message : 'Failed to add reasoning',
      });
    }
  }

  /** PATCH /cases/:id/participants/:participantId/reasoning/:reasoningId */
  static async updateReasoning(req: Request, res: Response): Promise<void> {
    try {
      const { id, participantId, reasoningId } = req.params;
      const { content } = req.body;

      if (!content || typeof content !== 'string' || !content.trim()) {
        sendError(res, HttpStatusCode.BAD_REQUEST, { code: 'INVALID_INPUT', message: 'content is required' });
        return;
      }

      const participant = await CaseParticipantService.updateReasoning(id, participantId, reasoningId, content.trim());
      sendSuccess(res, HttpStatusCode.OK, 'Reasoning updated', participant);
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'REASONING_UPDATE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to update reasoning',
      });
    }
  }

  /** DELETE /cases/:id/participants/:participantId/reasoning/:reasoningId */
  static async deleteReasoning(req: Request, res: Response): Promise<void> {
    try {
      const { id, participantId, reasoningId } = req.params;
      const participant = await CaseParticipantService.deleteReasoning(id, participantId, reasoningId);
      sendSuccess(res, HttpStatusCode.OK, 'Reasoning deleted', participant);
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'REASONING_DELETE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to delete reasoning',
      });
    }
  }

  /**
   * POST /cases/:id/participants/:participantId/identifiers/upload-signature
   * Returns a Cloudinary signed upload signature so the frontend can upload
   * an identifier document (image/audio) directly to CDN.
   * No file bytes ever reach this server.
   */
  static async getIdentifierUploadSignature(req: Request, res: Response): Promise<void> {
    try {
      const { id, participantId } = req.params;
      const cloudinary = (await import('../../../config/cloudinary')).default;
      const { v4: uuidv4 } = await import('uuid');

      const timestamp = Math.round(Date.now() / 1000);
      const publicId = `identifier_${uuidv4()}`;
      const folder = `crime-os/participants/${id}/${participantId}/identifiers`;

      const signature = cloudinary.utils.api_sign_request(
        { timestamp, folder, public_id: publicId },
        cloudinary.config().api_secret!,
      );

      sendSuccess(res, HttpStatusCode.OK, 'Upload signature generated', {
        signature,
        timestamp,
        apiKey: cloudinary.config().api_key,
        cloudName: cloudinary.config().cloud_name,
        folder,
        publicId,
      });
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'SIGNATURE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to generate upload signature',
      });
    }
  }

  /**
   * POST /cases/:id/participants/:participantId/statements/transcribe
   * Accepts a multipart audio file, forwards to the Python speech-to-text service,
   * returns only the transcript text. The audio file is NEVER persisted.
   */
  static async transcribeStatementAudio(req: Request, res: Response): Promise<void> {
    try {
      const file = (req as any).file as Express.Multer.File | undefined;

      if (!file || !file.buffer || file.buffer.length === 0) {
        sendError(res, HttpStatusCode.BAD_REQUEST, {
          code: 'INVALID_INPUT',
          message: 'Audio file is required',
        });
        return;
      }

      const { Blob } = await import('buffer');
      const microserviceUrl = process.env.COMPLAINT_INTELLIGENCE_URL || 'http://localhost:8001';

      const formData = new FormData();
      const blob = new Blob([file.buffer], { type: file.mimetype || 'audio/mpeg' });
      formData.append('file', blob, file.originalname || 'recording.audio');

      const response = await fetch(`${microserviceUrl}/audio`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const detail = await response.text();
        sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
          code: 'TRANSCRIPTION_FAILED',
          message: `Transcription service error: ${detail || response.status}`,
        });
        return;
      }

      const data: any = await response.json();

      // Return transcript only — raw_text is original language, translated_text is English
      // Prefer the original language text since police statements are usually in local language
      const transcript = data?.transcript?.raw_text || data?.transcript?.translated_text || '';
      const detectedLanguage: string = data?.transcript?.detected_language || 'unknown';
      const translatedText: string | null = data?.transcript?.translated_text || null;

      if (!transcript.trim()) {
        sendError(res, HttpStatusCode.BAD_REQUEST, {
          code: 'NO_SPEECH_DETECTED',
          message: 'No speech detected in the audio file.',
        });
        return;
      }

      sendSuccess(res, HttpStatusCode.OK, 'Transcription successful', {
        transcript,
        detectedLanguage,
        translatedText,
      });
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'TRANSCRIPTION_ERROR',
        message: error instanceof Error ? error.message : 'Failed to transcribe audio',
      });
    }
  }
}
