import crypto from 'crypto';
import QRCode from 'qrcode';
import { Types } from 'mongoose';
import cloudinary from '../../../config/cloudinary';
import { physicalEvidenceRepository } from '../repositories/PhysicalEvidenceRepository';
import {
  IPhysicalEvidence,
  ICustodyNode,
  PhysicalEvidenceCategory,
  PhysicalEvidenceStatus,
  TransferAction,
  IOfficerDetails,
} from '../models/PhysicalEvidence.model';

export interface ICreatePhysicalEvidenceInput {
  case_id: string;
  firNumber?: string;
  itemName: string;
  category: PhysicalEvidenceCategory;
  description: string;
  quantityOrWeight?: string;
  conditionOnSeizure: string;
  seizureMemoNo: string;
  seizedByOfficer: IOfficerDetails;
  seizureDate?: Date;
  seizureLocation: string;
  witnesses?: Array<{ name: string; contact?: string; address?: string }>;
  sealNumber: string;
  itemPhotoUrl?: string;
  policeStationId?: string;
  malkhanaRegisterNo?: string;
  rackNo?: string;
  shelfNo?: string;
  lockerNo?: string;
}

export interface IDispatchInput {
  transferAction: TransferAction; // 'FSL_DISPATCH' | 'STATION_TRANSFER' | 'COURT_PRODUCTION'
  destinationName: string; // e.g. "State Forensic Science Laboratory, DFS"
  escortOfficer: IOfficerDetails;
  roadCertificateNo?: string;
  remarks?: string;
}

export interface IAcknowledgeReceiptInput {
  receivedByOfficer: IOfficerDetails;
  receiptLocation: string;
  fslLabEntryNo?: string;
  sealCondition: 'INTACT' | 'DAMAGED' | 'RE_SEALED';
  newSealNumber?: string;
  remarks?: string;
}

export class PhysicalEvidenceService {
  private computeNodeHash(node: {
    previousHash: string;
    step: number;
    transferAction: string;
    fromOfficerId: string;
    toOfficerName: string;
    toLocation: string;
    timestamp: Date | string;
    sealNumberOnTransfer: string;
    roadCertificateNo?: string;
  }): string {
    const tsISO = typeof node.timestamp === 'string' ? new Date(node.timestamp).toISOString() : node.timestamp.toISOString();
    const rawString = `${node.previousHash}|${node.step}|${node.transferAction}|${node.fromOfficerId}|${node.toOfficerName}|${node.toLocation}|${tsISO}|${node.sealNumberOnTransfer}|${node.roadCertificateNo || ''}`;
    return crypto.createHash('sha256').update(rawString).digest('hex');
  }

  private generateTagId(): string {
    const year = new Date().getFullYear();
    const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `PEV-${year}-${randomHex}`;
  }

  private generateRoadCertificateNo(): string {
    const year = new Date().getFullYear();
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    return `RC-${year}-${randomNum}`;
  }

  async createPhysicalEvidence(input: ICreatePhysicalEvidenceInput): Promise<IPhysicalEvidence> {
    const evidenceTagId = this.generateTagId();
    const seizureDate = input.seizureDate ? new Date(input.seizureDate) : new Date();

    // Compute Genesis Hash (Step 1)
    const genesisPreviousHash = '0000000000000000000000000000000000000000000000000000000000000000';
    const toLocation = input.policeStationId || 'PS-CENTRAL-01';

    const genesisHash = this.computeNodeHash({
      previousHash: genesisPreviousHash,
      step: 1,
      transferAction: 'INITIAL_SEIZURE',
      fromOfficerId: input.seizedByOfficer.id,
      toOfficerName: input.seizedByOfficer.name,
      toLocation,
      timestamp: seizureDate,
      sealNumberOnTransfer: input.sealNumber,
    });

    // Generate QR Code Data URL (Web URL for direct phone camera scanning)
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const qrPayload = `${frontendUrl}/verify-custody/${evidenceTagId}`;
    const qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 300, margin: 2 });

    const initialNode: ICustodyNode = {
      step: 1,
      timestamp: seizureDate,
      transferAction: 'INITIAL_SEIZURE',
      fromOfficer: input.seizedByOfficer,
      toOfficer: input.seizedByOfficer,
      fromLocation: input.seizureLocation,
      toLocation,
      sealNumberOnTransfer: input.sealNumber,
      sealCondition: 'INTACT',
      previousHash: genesisPreviousHash,
      currentHash: genesisHash,
      transferStatus: 'ACCEPTED',
      remarks: `Initial seizure logged under Panchnama / Seizure Memo #${input.seizureMemoNo}`,
    };

    // Upload evidence photo to Cloudinary if provided as a Data URL
    let uploadedPhotoUrl = input.itemPhotoUrl;
    if (uploadedPhotoUrl && uploadedPhotoUrl.startsWith('data:')) {
      try {
        const uploadRes = await cloudinary.uploader.upload(uploadedPhotoUrl, {
          folder: 'crime_os_ai/physical_evidence',
          resource_type: 'image',
        });
        uploadedPhotoUrl = uploadRes.secure_url;
      } catch (err: any) {
        console.error('[PhysicalEvidenceService] Cloudinary photo upload failed:', err?.message || err);
      }
    }

    const evidenceDoc = await physicalEvidenceRepository.create({
      evidenceTagId,
      case_id: new Types.ObjectId(input.case_id),
      firNumber: input.firNumber,
      itemName: input.itemName,
      category: input.category,
      description: input.description,
      quantityOrWeight: input.quantityOrWeight,
      conditionOnSeizure: input.conditionOnSeizure,
      seizureMemoNo: input.seizureMemoNo,
      seizedByOfficerId: input.seizedByOfficer.id,
      seizedByOfficerName: input.seizedByOfficer.name,
      seizureDate,
      seizureLocation: input.seizureLocation,
      witnesses: input.witnesses || [],
      sealNumber: input.sealNumber,
      sealStatus: 'INTACT',
      itemPhotoUrl: uploadedPhotoUrl,
      policeStationId: input.policeStationId || 'PS-CENTRAL-01',
      malkhanaRegisterNo: input.malkhanaRegisterNo,
      rackNo: input.rackNo,
      shelfNo: input.shelfNo,
      lockerNo: input.lockerNo,
      currentCustodian: {
        holderId: input.seizedByOfficer.id,
        holderName: input.seizedByOfficer.name,
        holderRole: 'Investigating Officer',
        location: input.seizureLocation,
        heldSince: seizureDate,
        isTransiting: false,
      },
      status: 'SEIZED',
      qrDataUrl,
      custodyChain: [initialNode],
    });

    return evidenceDoc;
  }

  async getByTagId(tagId: string): Promise<IPhysicalEvidence> {
    const item = await physicalEvidenceRepository.findByTagId(tagId);
    if (!item) throw new Error(`Physical Evidence with tag ${tagId} not found.`);
    return item;
  }

  async getById(id: string): Promise<IPhysicalEvidence> {
    const item = await physicalEvidenceRepository.findById(id);
    if (!item) throw new Error(`Physical Evidence not found.`);
    return item;
  }

  async getByCaseId(caseId: string): Promise<IPhysicalEvidence[]> {
    return await physicalEvidenceRepository.findByCaseId(caseId);
  }

  async initiateDispatch(
    id: string,
    dispatchInput: IDispatchInput,
    fromOfficer: IOfficerDetails
  ): Promise<IPhysicalEvidence> {
    const item = await this.getById(id);

    if (item.status.includes('IN_TRANSIT')) {
      const lastRC = item.custodyChain[item.custodyChain.length - 1]?.roadCertificateNo || '';
      throw new Error(`Cannot dispatch: Item is currently IN TRANSIT under Road Certificate #${lastRC}. It must be received at its destination first.`);
    }

    const lastNode = item.custodyChain[item.custodyChain.length - 1];
    const previousHash = lastNode ? lastNode.currentHash : '0'.repeat(64);
    const nextStep = item.custodyChain.length + 1;
    const now = new Date();
    const rcNo = dispatchInput.roadCertificateNo || this.generateRoadCertificateNo();

    const currentHash = this.computeNodeHash({
      previousHash,
      step: nextStep,
      transferAction: dispatchInput.transferAction,
      fromOfficerId: fromOfficer.id,
      toOfficerName: dispatchInput.escortOfficer.name,
      toLocation: dispatchInput.destinationName,
      timestamp: now,
      sealNumberOnTransfer: item.sealNumber,
      roadCertificateNo: rcNo,
    });

    let newStatus: PhysicalEvidenceStatus = 'IN_TRANSIT_TO_FSL';
    if (dispatchInput.transferAction === 'COURT_PRODUCTION') {
      newStatus = 'IN_TRANSIT_TO_COURT';
    } else if (dispatchInput.transferAction === 'RELEASE_TO_OWNER') {
      newStatus = 'RELEASED_TO_OWNER';
    } else if (
      dispatchInput.transferAction === 'STATION_TRANSFER' ||
      dispatchInput.transferAction === 'HOSPITAL_MEDICAL_DISPATCH' ||
      dispatchInput.transferAction === 'FACILITY_DISPATCH'
    ) {
      newStatus = 'IN_TRANSIT_TO_FACILITY';
    }

    const dispatchNode: ICustodyNode = {
      step: nextStep,
      timestamp: now,
      transferAction: dispatchInput.transferAction,
      fromOfficer,
      toOfficer: dispatchInput.escortOfficer,
      fromLocation: item.currentCustodian.location,
      toLocation: dispatchInput.destinationName,
      roadCertificateNo: rcNo,
      sealNumberOnTransfer: item.sealNumber,
      sealCondition: item.sealStatus,
      previousHash,
      currentHash,
      transferStatus: 'DISPATCHED',
      remarks: dispatchInput.remarks || `Dispatched via Road Certificate #${rcNo} to ${dispatchInput.destinationName}`,
    };

    const newCustodian = {
      holderId: dispatchInput.escortOfficer.id,
      holderName: `${dispatchInput.escortOfficer.name} (Escort Officer)`,
      holderRole: 'Escort Courier',
      location: `In Transit -> ${dispatchInput.destinationName} (RC #${rcNo})`,
      heldSince: now,
      isTransiting: true,
    };

    const updated = await physicalEvidenceRepository.appendCustodyNode(
      id,
      dispatchNode,
      newCustodian,
      newStatus
    );

    if (!updated) throw new Error('Failed to update physical evidence custody dispatch');
    return updated;
  }

  async acknowledgeReceipt(
    id: string,
    ackInput: IAcknowledgeReceiptInput,
    currentOfficer: IOfficerDetails
  ): Promise<IPhysicalEvidence> {
    const item = await this.getById(id);

    if (!item.status.includes('IN_TRANSIT')) {
      throw new Error(`Cannot acknowledge receipt: Item is currently stored at '${item.status?.replace(/_/g, ' ')}' and not in transit.`);
    }

    const lastNode = item.custodyChain[item.custodyChain.length - 1];
    const previousHash = lastNode ? lastNode.currentHash : '0'.repeat(64);
    const nextStep = item.custodyChain.length + 1;
    const now = new Date();
    const sealNumber = ackInput.newSealNumber || item.sealNumber;

    let transferAction: TransferAction = 'FACILITY_RECEIPT';
    let newStatus: PhysicalEvidenceStatus = 'STORED_AT_FACILITY';

    const destLower = ackInput.receiptLocation?.toLowerCase() || '';
    if (destLower.includes('fsl') || destLower.includes('forensic')) {
      transferAction = 'FSL_RECEIPT';
      newStatus = 'STORED_AT_FSL';
    } else if (item.status === 'IN_TRANSIT_TO_COURT' || destLower.includes('court')) {
      transferAction = 'COURT_PRODUCTION';
      newStatus = 'PRODUCED_IN_COURT';
    } else if (destLower.includes('malkhana') || destLower.includes('station') || destLower.includes('police')) {
      transferAction = 'MALKHANA_DEPOSIT';
      newStatus = 'STORED_IN_MALKHANA';
    } else if (destLower.includes('hospital') || destLower.includes('medical') || destLower.includes('mortuary')) {
      transferAction = 'FACILITY_RECEIPT';
      newStatus = 'STORED_AT_FACILITY';
    }

    const fromOfficer = lastNode ? lastNode.toOfficer : currentOfficer;

    const currentHash = this.computeNodeHash({
      previousHash,
      step: nextStep,
      transferAction,
      fromOfficerId: fromOfficer.id,
      toOfficerName: ackInput.receivedByOfficer.name,
      toLocation: ackInput.receiptLocation,
      timestamp: now,
      sealNumberOnTransfer: sealNumber,
      roadCertificateNo: lastNode?.roadCertificateNo,
    });

    const ackNode: ICustodyNode = {
      step: nextStep,
      timestamp: now,
      transferAction,
      fromOfficer,
      toOfficer: ackInput.receivedByOfficer,
      fromLocation: lastNode ? lastNode.toLocation : 'In Transit',
      toLocation: ackInput.receiptLocation,
      roadCertificateNo: lastNode?.roadCertificateNo,
      fslLabEntryNo: ackInput.fslLabEntryNo,
      sealNumberOnTransfer: sealNumber,
      sealCondition: ackInput.sealCondition,
      previousHash,
      currentHash,
      transferStatus: 'ACCEPTED',
      remarks: ackInput.remarks || `Receipt acknowledged at ${ackInput.receiptLocation}. Seal verified: ${ackInput.sealCondition}`,
    };

    const newCustodian = {
      holderId: ackInput.receivedByOfficer.id,
      holderName: ackInput.receivedByOfficer.name,
      holderRole: 'Custodian / Lab Specialist',
      location: ackInput.receiptLocation,
      heldSince: now,
      isTransiting: false,
    };

    const updated = await physicalEvidenceRepository.appendCustodyNode(
      id,
      ackNode,
      newCustodian,
      newStatus,
      sealNumber,
      ackInput.sealCondition
    );

    if (!updated) throw new Error('Failed to acknowledge physical evidence receipt');
    return updated;
  }

  async verifyIntegrity(id: string): Promise<{ isValid: boolean; brokenStep?: number; message: string }> {
    const item = await this.getById(id);
    let previousHash = '0000000000000000000000000000000000000000000000000000000000000000';

    for (let i = 0; i < item.custodyChain.length; i++) {
      const node = item.custodyChain[i];

      if (node.previousHash !== previousHash) {
        return {
          isValid: false,
          brokenStep: node.step,
          message: `Chain broken at step ${node.step}: previousHash mismatch! Expected ${previousHash}, got ${node.previousHash}`,
        };
      }

      const expectedHash = this.computeNodeHash({
        previousHash: node.previousHash,
        step: node.step,
        transferAction: node.transferAction,
        fromOfficerId: node.fromOfficer.id,
        toOfficerName: node.toOfficer.name,
        toLocation: node.toLocation,
        timestamp: node.timestamp,
        sealNumberOnTransfer: node.sealNumberOnTransfer,
        roadCertificateNo: node.roadCertificateNo,
      });

      if (expectedHash !== node.currentHash) {
        return {
          isValid: false,
          brokenStep: node.step,
          message: `Chain broken at step ${node.step}: currentHash validation failed! Expected ${expectedHash}, got ${node.currentHash}`,
        };
      }

      previousHash = node.currentHash;
    }

    return { isValid: true, message: 'All custody chain SHA-256 hashes are 100% verified & intact.' };
  }
}

export const physicalEvidenceService = new PhysicalEvidenceService();
