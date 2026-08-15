import { Types } from 'mongoose';
import { CaseRoomMessage, ICaseRoomMessage } from '../models/CaseRoomMessage.model';
import { Complaint } from '../../complaint/models/Complaint.model';
import { encryptValue, decryptValue } from '../../../shared/utils/encryption.util';

export class CaseRoomService {
  /**
   * Save an encrypted message to the case room.
   */
  static async saveMessage(
    caseId: string,
    senderId: string,
    senderName: string,
    plaintext: string,
  ): Promise<ICaseRoomMessage> {
    const encryptedContent = encryptValue(plaintext);
    const msg = await CaseRoomMessage.create({
      case_id: new Types.ObjectId(caseId),
      sender_id: new Types.ObjectId(senderId),
      sender_name: senderName,
      content: encryptedContent,
      isEncrypted: true,
      sent_at: new Date(),
    });

    const msgObj = msg.toObject ? msg.toObject() : msg;
    (msgObj as any).content = plaintext;
    return msgObj as ICaseRoomMessage;
  }

  /**
   * Fetch decrypted message history for a case room.
   */
  static async getMessages(caseId: string, page = 1, limit = 50): Promise<{ messages: ICaseRoomMessage[]; total: number }> {
    const caseObjectId = new Types.ObjectId(caseId);
    const skip = (page - 1) * limit;

    const [rawMessages, total] = await Promise.all([
      CaseRoomMessage.find({ case_id: caseObjectId })
        .sort({ sent_at: 1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      CaseRoomMessage.countDocuments({ case_id: caseObjectId }),
    ]);

    const messages = rawMessages.map((m: any) => ({
      ...m,
      content: decryptValue(m.content),
    }));

    return { messages, total };
  }

  /**
   * Check if a case room is eligible (≥ 2 assigned IOs).
   */
  static async isRoomEligible(caseId: string): Promise<{ eligible: boolean; ioCount: number }> {
    const complaint = await Complaint.findById(caseId).select('assignedIOs assignedIO').lean().exec();
    if (!complaint) return { eligible: false, ioCount: 0 };

    const ioCount = Array.isArray(complaint.assignedIOs)
      ? complaint.assignedIOs.length
      : complaint.assignedIO ? 1 : 0;

    return { eligible: ioCount >= 2, ioCount };
  }
}
