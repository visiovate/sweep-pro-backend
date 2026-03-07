const { getPrismaClient } = require('../utils/database');
const { PrismaClient } = require('@prisma/client');
const { validateDocumentType, getRequiredDocuments } = require('../utils/fileUpload');
const { uploadMaidDocument, deleteFile, validateFile } = require('../services/cloudinaryService');
const fs = require('fs');

const prisma = getPrismaClient();

// Upload document (for maids) - stores as binary data
const uploadDocument = async (req, res) => {
  try {
    const maidId = req.user.id;
    const { type, documentNumber, expiryDate } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Validate document type
    if (!validateDocumentType(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid document type'
      });
    }

    // Check if maid has a profile
    const maidProfile = await prisma.maidProfile.findUnique({
      where: { userId: maidId }
    });

    if (!maidProfile) {
      return res.status(404).json({
        success: false,
        message: 'Maid profile not found'
      });
    }

    // Read file data
    const documentData = fs.readFileSync(file.path);

    // Check if document of this type already exists
    const existingDocument = await prisma.maidDocument.findFirst({
      where: {
        maidId: maidProfile.id,
        type: type
      }
    });

    if (existingDocument) {
      // Update existing document
      const updatedDocument = await prisma.maidDocument.update({
        where: { id: existingDocument.id },
        data: {
          fileName: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype,
          documentData: documentData,
          documentNumber: documentNumber || null,
          expiryDate: expiryDate ? new Date(expiryDate) : null,
          verificationStatus: 'PENDING',
          verified: false,
          verifiedBy: null,
          verifiedAt: null,
          rejectionReason: null,
          adminNotes: null,
          updatedAt: new Date()
        }
      });

      // Clean up temporary file
      fs.unlinkSync(file.path);

      return res.json({
        success: true,
        message: 'Document updated successfully',
        data: {
          id: updatedDocument.id,
          type: updatedDocument.type,
          fileName: updatedDocument.fileName,
          fileSize: updatedDocument.fileSize,
          verificationStatus: updatedDocument.verificationStatus,
          createdAt: updatedDocument.createdAt,
          updatedAt: updatedDocument.updatedAt
        }
      });
    }

    // Create new document record
    const document = await prisma.maidDocument.create({
      data: {
        maidId: maidProfile.id,
        type: type,
        documentNumber: documentNumber || null,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        documentData: documentData,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        verificationStatus: 'PENDING'
      }
    });

    // Clean up temporary file
    fs.unlinkSync(file.path);

    res.json({
      success: true,
      message: 'Document uploaded successfully',
      data: {
        id: document.id,
        type: document.type,
        fileName: document.fileName,
        fileSize: document.fileSize,
        verificationStatus: document.verificationStatus,
        createdAt: document.createdAt
      }
    });

  } catch (error) {
    console.error('Error uploading document:', error);
    
    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to upload document'
    });
  }
};

// Bulk document upload for maid verification page (handles multiple documents) - Uses Cloudinary
const uploadMaidVerificationDocuments = async (req, res) => {
  try {
    const maidId = req.user.id;

    console.log('Upload verification request received for user:', maidId);
    console.log('Files received:', req.files ? Object.keys(req.files) : 'No files');
    console.log('Body:', req.body);

    // Get maid profile
    const maidProfile = await prisma.maidProfile.findUnique({
      where: { userId: maidId }
    });

    if (!maidProfile) {
      console.log('Maid profile not found for user:', maidId);
      return res.status(404).json({
        success: false,
        message: 'Maid profile not found'
      });
    }

    if (maidProfile.isVerified || maidProfile.status === 'ACTIVE') {
      return res.status(403).json({
        success: false,
        message: 'Your account is already verified. Document re-upload is not allowed.'
      });
    }

    console.log('Maid profile found:', maidProfile.id);

    const uploadedDocs = [];
    const errors = [];

    // Map frontend document names to our backend types
    const documentTypeMapping = {
      'aadharCard': 'AADHAR_CARD',
      'panCard': 'PAN_CARD',
      'electricityBill': 'ADDRESS_PROOF',
      'policeVerification': 'POLICE_VERIFICATION',
      'photo': 'PHOTO'
    };

    // Handle each uploaded file
    for (const [fieldName, fileArray] of Object.entries(req.files || {})) {
      console.log(`Processing field: ${fieldName}`);
      if (!fileArray || !fileArray[0]) {
        console.log(`No file found for field: ${fieldName}`);
        continue;
      }
      
      const uploadedFile = fileArray[0];
      const documentType = documentTypeMapping[fieldName];
      
      // Debug file properties
      console.log(`File details for ${fieldName}:`, {
        originalname: uploadedFile.originalname,
        mimetype: uploadedFile.mimetype,
        size: uploadedFile.size,
        path: uploadedFile.path,
        fieldname: uploadedFile.fieldname,
        hasBuffer: !!uploadedFile.buffer,
        pathExists: uploadedFile.path ? require('fs').existsSync(uploadedFile.path) : false
      });
      
      if (!documentType) {
        errors.push(`Unknown document type: ${fieldName}`);
        continue;
      }

      try {
        // Validate file
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf', 'image/webp'];
        const validation = validateFile(uploadedFile, allowedTypes, 5 * 1024 * 1024); // 5MB limit
        
        if (!validation.isValid) {
          errors.push(`${fieldName}: ${validation.errors.join(', ')}`);
          continue;
        }

        // Read file buffer
        const fileBuffer = fs.readFileSync(uploadedFile.path);
        
        // Upload to Cloudinary
        const cloudinaryResult = await uploadMaidDocument(fileBuffer, {
          maidId: maidProfile.id,
          documentType: documentType,
          originalName: uploadedFile.originalname
        });

        if (!cloudinaryResult.success) {
          errors.push(`Failed to upload ${fieldName} to cloud storage`);
          continue;
        }

        // Check if document already exists and delete old one from Cloudinary
        const existingDocument = await prisma.maidDocument.findFirst({
          where: {
            maidId: maidProfile.id,
            type: documentType
          }
        });

        if (existingDocument && existingDocument.cloudinaryPublicId) {
          try {
            await deleteFile(existingDocument.cloudinaryPublicId, cloudinaryResult.resourceType);
          } catch (deleteError) {
            console.warn(`Failed to delete old file from Cloudinary: ${deleteError.message}`);
          }
        }

        const documentPayload = {
          fileName: uploadedFile.originalname,
          fileSize: cloudinaryResult.bytes,
          mimeType: uploadedFile.mimetype,
          cloudinaryUrl: cloudinaryResult.url,
          cloudinaryPublicId: cloudinaryResult.publicId,
          verificationStatus: 'PENDING',
          verified: false,
          verifiedBy: null,
          verifiedAt: null,
          rejectionReason: null,
          adminNotes: null
        };

        if (existingDocument) {
          // Update document
          const updatedDoc = await prisma.maidDocument.update({
            where: { id: existingDocument.id },
            data: { ...documentPayload, updatedAt: new Date() }
          });
          uploadedDocs.push(updatedDoc);
        } else {
          // Create new document
          const newDoc = await prisma.maidDocument.create({
            data: {
              maidId: maidProfile.id,
              type: documentType,
              ...documentPayload
            }
          });
          uploadedDocs.push(newDoc);
        }

        // Clean up temporary file
        if (fs.existsSync(uploadedFile.path)) {
          fs.unlinkSync(uploadedFile.path);
        }
        
      } catch (error) {
        console.error(`Error uploading ${fieldName}:`, error);
        errors.push(`Failed to upload ${fieldName}: ${error.message}`);
        
        // Clean up file on error
        if (fs.existsSync(uploadedFile.path)) {
          fs.unlinkSync(uploadedFile.path);
        }
      }
    }

    // Update maid status based on documents
    await updateMaidStatusBasedOnDocuments(maidProfile.id);

    if (uploadedDocs.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No documents were uploaded successfully',
        errors
      });
    }

    res.json({
      success: true,
      message: `${uploadedDocs.length} document(s) uploaded successfully`,
      data: {
        uploadedDocuments: uploadedDocs.map(doc => ({
          id: doc.id,
          type: doc.type,
          fileName: doc.fileName,
          fileSize: doc.fileSize,
          cloudinaryUrl: doc.cloudinaryUrl,
          verificationStatus: doc.verificationStatus,
          createdAt: doc.createdAt
        })),
        errors: errors.length > 0 ? errors : undefined
      }
    });

  } catch (error) {
    console.error('Error uploading verification documents:', error);
    
    // Clean up uploaded files on error
    if (req.files) {
      Object.values(req.files).forEach(fileArray => {
        if (Array.isArray(fileArray)) {
          fileArray.forEach(file => {
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          });
        }
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to upload verification documents'
    });
  }
};

// Get maid's documents
const getMaidDocuments = async (req, res) => {
  try {
    const maidId = req.user.id;

    // Get maid profile
    const maidProfile = await prisma.maidProfile.findUnique({
      where: { userId: maidId }
    });

    if (!maidProfile) {
      return res.status(404).json({
        success: false,
        message: 'Maid profile not found'
      });
    }

    // Get all documents for the maid (without binary data)
    const documents = await prisma.maidDocument.findMany({
      where: { maidId: maidProfile.id },
      select: {
        id: true,
        type: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        verificationStatus: true,
        verified: true,
        verifiedAt: true,
        rejectionReason: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    // Get required documents list
    const requiredDocuments = getRequiredDocuments();
    
    // Create a comprehensive list showing which documents are uploaded and which are missing
    const documentStatus = requiredDocuments.map(reqDoc => {
      const uploadedDoc = documents.find(doc => doc.type === reqDoc.type);
      return {
        ...reqDoc,
        uploaded: !!uploadedDoc,
        document: uploadedDoc || null
      };
    });

    res.json({
      success: true,
      data: {
        documents: documentStatus,
        uploadedDocuments: documents
      }
    });

  } catch (error) {
    console.error('Error fetching maid documents:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch documents'
    });
  }
};

// Get maid verification status for frontend MaidVerification component
const getMaidVerificationStatus = async (req, res) => {
  try {
    const maidId = req.user.id;

    if (req.user.role !== 'MAID') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Maid privileges required.'
      });
    }

    // Get maid profile
    // Some legacy flows may have created a MAID user without a MaidProfile.
    // Treat that as "not submitted" and create a default profile on-demand.
    const maidProfile = await prisma.maidProfile.upsert({
      where: { userId: maidId },
      update: {},
      create: {
        userId: maidId,
        skills: [],
        languages: ['English'],
        availability: {
          monday: { start: '09:00', end: '18:00', available: true },
          tuesday: { start: '09:00', end: '18:00', available: true },
          wednesday: { start: '09:00', end: '18:00', available: true },
          thursday: { start: '09:00', end: '18:00', available: true },
          friday: { start: '09:00', end: '18:00', available: true },
          saturday: { start: '09:00', end: '16:00', available: true },
          sunday: { start: '10:00', end: '16:00', available: false }
        },
        status: 'PENDING_VERIFICATION',
        isFloatingMaid: false,
        maxDailyBookings: 3,
        serviceRadius: 2.0
      },
      include: {
        documents: {
          select: {
            id: true,
            type: true,
            fileName: true,
            fileSize: true,
            verificationStatus: true,
            verified: true,
            verifiedAt: true,
            rejectionReason: true,
            createdAt: true
          }
        }
      }
    });

    // Map documents to frontend format
    const documents = maidProfile.documents;
    const aadharCard = documents.find(d => d.type === 'AADHAR_CARD');
    const panCard = documents.find(d => d.type === 'PAN_CARD');
    const electricityBill = documents.find(d => d.type === 'ADDRESS_PROOF');

    // Calculate overall verification status based on documents
    const requiredDocs = getRequiredDocuments().filter(doc => doc.required);
    const allRequiredUploaded = requiredDocs.every(reqDoc => 
      documents.some(doc => doc.type === reqDoc.type)
    );
    const allRequiredApproved = requiredDocs.every(reqDoc => 
      documents.some(doc => doc.type === reqDoc.type && doc.verificationStatus === 'APPROVED')
    );
    const anyRejected = documents.some(doc => doc.verificationStatus === 'REJECTED');
    
    let overallStatus = 'NOT_SUBMITTED';
    if (maidProfile.isVerified || maidProfile.status === 'ACTIVE') {
      overallStatus = 'APPROVED';
    } else if (documents.length === 0) {
      overallStatus = 'NOT_SUBMITTED';
    } else if (allRequiredApproved) {
      overallStatus = 'APPROVED';
    } else if (anyRejected) {
      overallStatus = 'REJECTED';
    } else {
      overallStatus = 'PENDING';
    }

    // Build verification status
    const overallRejectionReason = documents.find(d => d.verificationStatus === 'REJECTED')?.rejectionReason || null;
    const verificationStatus = {
      hasDocuments: documents.length > 0,
      overallStatus: overallStatus,
      maidStatus: maidProfile.status,
      rejectionReason: overallRejectionReason,
      submittedAt: documents.length > 0 ? documents[0].createdAt : null,
      reviewedAt: documents.find(d => d.verifiedAt)?.verifiedAt || null,
      documents: documents,
      transformedDocuments: {
        aadharCard: aadharCard ? {
          id: aadharCard.id,
          filename: aadharCard.fileName,
          status: aadharCard.verificationStatus,
          uploadedAt: aadharCard.createdAt,
          rejectionReason: aadharCard.rejectionReason
        } : null,
        panCard: panCard ? {
          id: panCard.id,
          filename: panCard.fileName,
          status: panCard.verificationStatus,
          uploadedAt: panCard.createdAt,
          rejectionReason: panCard.rejectionReason
        } : null,
        electricityBill: electricityBill ? {
          id: electricityBill.id,
          filename: electricityBill.fileName,
          status: electricityBill.verificationStatus,
          uploadedAt: electricityBill.createdAt,
          rejectionReason: electricityBill.rejectionReason
        } : null
      },
      progress: {
        uploaded: [aadharCard, panCard, electricityBill].filter(Boolean).length,
        total: 3,
        approved: [aadharCard, panCard, electricityBill].filter(d => d?.verificationStatus === 'APPROVED').length
      }
    };

    res.json({
      success: true,
      data: verificationStatus
    });

  } catch (error) {
    console.error('Error fetching maid verification status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch verification status'
    });
  }
};

// Get maid verification data for admin (includes all documents in expected format)
const getMaidVerificationData = async (req, res) => {
  try {
    const maids = await prisma.maidProfile.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            address: true,
            createdAt: true,
            status: true
          }
        },
        documents: {
          select: {
            id: true,
            type: true,
            fileName: true,
            fileSize: true,
            verificationStatus: true,
            verified: true,
            verifiedAt: true,
            verifiedBy: true,
            rejectionReason: true,
            adminNotes: true,
            createdAt: true
          },
          orderBy: { createdAt: 'desc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Transform data to match AdminMaidVerification interface
    const verificationData = maids.map(maid => {
      const documents = maid.documents;
      
      // Find documents by type
      const aadharCard = documents.find(d => d.type === 'AADHAR_CARD');
      const panCard = documents.find(d => d.type === 'PAN_CARD');
      const electricityBill = documents.find(d => d.type === 'ADDRESS_PROOF');

      // Count uploaded documents (only required ones)
      const uploadedCount = [aadharCard, panCard, electricityBill].filter(Boolean).length;

      // Determine overall status
      const allRequiredDocs = [aadharCard, panCard, electricityBill];
      const allApproved = allRequiredDocs.every(doc => doc?.verificationStatus === 'APPROVED');
      const anyRejected = allRequiredDocs.some(doc => doc?.verificationStatus === 'REJECTED');
      const anyPending = allRequiredDocs.some(doc => doc?.verificationStatus === 'PENDING');
      
      let overallStatus = 'PENDING';
      if (uploadedCount === 0) overallStatus = 'NOT_SUBMITTED';
      else if (allApproved) overallStatus = 'APPROVED';
      else if (anyRejected) overallStatus = 'REJECTED';
      else if (anyPending) overallStatus = 'PENDING';
      
      return {
        id: `ver_${maid.id}`,
        maidId: maid.id,
        maid: {
          id: maid.user.id,
          name: maid.user.name,
          email: maid.user.email,
          phone: maid.user.phone,
          address: maid.user.address || 'No address provided',
          joinedDate: maid.user.createdAt,
          totalServices: maid.completedBookings || 0,
          rating: maid.rating || 0
        },
        documents: {
          aadharCard: aadharCard ? {
            id: aadharCard.id,
            filename: aadharCard.fileName || 'aadhar_card',
            uploadedAt: aadharCard.createdAt,
            fileSize: aadharCard.fileSize || 0,
            status: aadharCard.verificationStatus
          } : null,
          panCard: panCard ? {
            id: panCard.id,
            filename: panCard.fileName || 'pan_card',
            uploadedAt: panCard.createdAt,
            fileSize: panCard.fileSize || 0,
            status: panCard.verificationStatus
          } : null,
          electricityBill: electricityBill ? {
            id: electricityBill.id,
            filename: electricityBill.fileName || 'electricity_bill',
            uploadedAt: electricityBill.createdAt,
            fileSize: electricityBill.fileSize || 0,
            status: electricityBill.verificationStatus
          } : null
        },
        status: overallStatus,
        submittedAt: documents.length > 0 ? documents[0].createdAt : null,
        reviewedAt: allRequiredDocs.find(doc => doc?.verifiedAt)?.verifiedAt,
        reviewedBy: allRequiredDocs.find(doc => doc?.verifiedBy)?.verifiedBy,
        rejectionReason: allRequiredDocs.find(doc => doc?.rejectionReason)?.rejectionReason,
        adminNotes: allRequiredDocs.find(doc => doc?.adminNotes)?.adminNotes,
        documentCounts: {
          uploaded: uploadedCount,
          total: 3,
          verified: allRequiredDocs.filter(doc => doc?.verificationStatus === 'APPROVED').length,
          pending: allRequiredDocs.filter(doc => doc?.verificationStatus === 'PENDING').length,
          rejected: allRequiredDocs.filter(doc => doc?.verificationStatus === 'REJECTED').length
        }
      };
    });

    res.json({
      success: true,
      data: verificationData
    });

  } catch (error) {
    console.error('Error fetching maid verification data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch maid verification data'
    });
  }
};

// Download/view document endpoint - redirects to Cloudinary URL
const downloadDocument = async (req, res) => {
  try {
    const { documentId } = req.params;
    const userRole = req.user.role;
    const userId = req.user.id;

    const document = await prisma.maidDocument.findUnique({
      where: { id: documentId },
      include: {
        maid: {
          include: {
            user: {
              select: { id: true }
            }
          }
        }
      }
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Check authorization
    if (userRole !== 'ADMIN' && document.maid.user.id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to download this document'
      });
    }

    // For documents with Cloudinary URL, redirect to Cloudinary
    if (document.cloudinaryUrl) {
      return res.json({
        success: true,
        data: {
          url: document.cloudinaryUrl,
          fileName: document.fileName,
          fileSize: document.fileSize,
          mimeType: document.mimeType
        }
      });
    }

    // Fallback for old documents with binary data (backward compatibility)
    if (document.documentData) {
      res.setHeader('Content-Type', document.mimeType || 'application/octet-stream');
      res.setHeader('Content-Length', document.fileSize);
      res.setHeader('Content-Disposition', `inline; filename="${document.fileName}"`);
      return res.send(document.documentData);
    }

    // No document data available
    return res.status(404).json({
      success: false,
      message: 'Document data not available'
    });

  } catch (error) {
    console.error('Error downloading document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download document'
    });
  }
};

// Verify/Reject document (admin only)
const verifyDocument = async (req, res) => {
  try {
    const { documentId } = req.params;
    const { action, rejectionReason, adminNotes } = req.body;
    const adminId = req.user.id;

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Must be "approve" or "reject"'
      });
    }

    if (action === 'reject' && !rejectionReason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required when rejecting a document'
      });
    }

    // Update document verification status
    const updatedDocument = await prisma.maidDocument.update({
      where: { id: documentId },
      data: {
        verificationStatus: action === 'approve' ? 'APPROVED' : 'REJECTED',
        verified: action === 'approve',
        verifiedBy: adminId,
        verifiedAt: new Date(),
        rejectionReason: action === 'reject' ? rejectionReason : null,
        adminNotes: adminNotes || null
      },
      include: {
        maid: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }
      }
    });

    // Check if all required documents are now verified and update maid status
    await updateMaidStatusBasedOnDocuments(updatedDocument.maidId);

    // Create notification for maid
    await prisma.notification.create({
      data: {
        userId: updatedDocument.maid.userId,
        type: 'SYSTEM_ALERT',
        title: action === 'approve' ? 'Document Approved' : 'Document Rejected',
        message: action === 'approve' 
          ? `Your ${updatedDocument.type.replace('_', ' ')} has been approved.`
          : `Your ${updatedDocument.type.replace('_', ' ')} has been rejected. Reason: ${rejectionReason}`,
        data: {
          documentId: documentId,
          documentType: updatedDocument.type,
          action: action
        }
      }
    });

    res.json({
      success: true,
      message: `Document ${action === 'approve' ? 'approved' : 'rejected'} successfully`,
      data: {
        id: updatedDocument.id,
        type: updatedDocument.type,
        verificationStatus: updatedDocument.verificationStatus,
        verified: updatedDocument.verified,
        verifiedAt: updatedDocument.verifiedAt,
        rejectionReason: updatedDocument.rejectionReason
      }
    });

  } catch (error) {
    console.error('Error verifying document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify document'
    });
  }
};

// Approve verification for a specific maid (admin only)
const approveVerification = async (req, res) => {
  try {
    const { verificationId } = req.params;
    const { adminNotes } = req.body;
    const adminId = req.user.id;

    // Parse the verification ID to get maid ID
    const maidId = verificationId.replace('ver_', '');

    // Get maid profile
    const maidProfile = await prisma.maidProfile.findUnique({
      where: { id: maidId },
      include: {
        documents: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    if (!maidProfile) {
      return res.status(404).json({
        success: false,
        message: 'Maid profile not found'
      });
    }

    // Get required document types
    const requiredTypes = ['AADHAR_CARD', 'PAN_CARD', 'ADDRESS_PROOF'];
    
    // Approve all uploaded required documents
    const documentsToUpdate = maidProfile.documents.filter(doc => 
      requiredTypes.includes(doc.type) && doc.verificationStatus === 'PENDING'
    );

    if (documentsToUpdate.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No pending documents to approve'
      });
    }

    // Update all pending documents to approved
    await prisma.maidDocument.updateMany({
      where: {
        id: { in: documentsToUpdate.map(doc => doc.id) }
      },
      data: {
        verificationStatus: 'APPROVED',
        verified: true,
        verifiedBy: adminId,
        verifiedAt: new Date(),
        adminNotes: adminNotes || null
      }
    });

    // Update maid status
    await updateMaidStatusBasedOnDocuments(maidId);

    // Create notification for maid
    await prisma.notification.create({
      data: {
        userId: maidProfile.user.id,
        type: 'SYSTEM_ALERT',
        title: 'Documents Approved',
        message: 'All your verification documents have been approved. Your account is now active!',
        data: {
          verificationApproved: true,
          adminNotes: adminNotes || null
        }
      }
    });

    res.json({
      success: true,
      message: 'Verification approved successfully',
      data: {
        verificationId,
        approvedDocuments: documentsToUpdate.length,
        adminNotes
      }
    });

  } catch (error) {
    console.error('Error approving verification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve verification'
    });
  }
};

// Reject verification for a specific maid (admin only)
const rejectVerification = async (req, res) => {
  try {
    const { verificationId } = req.params;
    const { rejectionReason, adminNotes } = req.body;
    const adminId = req.user.id;

    if (!rejectionReason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    // Parse the verification ID to get maid ID
    const maidId = verificationId.replace('ver_', '');

    // Get maid profile
    const maidProfile = await prisma.maidProfile.findUnique({
      where: { id: maidId },
      include: {
        documents: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    if (!maidProfile) {
      return res.status(404).json({
        success: false,
        message: 'Maid profile not found'
      });
    }

    // Get required document types
    const requiredTypes = ['AADHAR_CARD', 'PAN_CARD', 'ADDRESS_PROOF'];
    
    // Reject all uploaded required documents that are pending
    const documentsToUpdate = maidProfile.documents.filter(doc => 
      requiredTypes.includes(doc.type) && doc.verificationStatus === 'PENDING'
    );

    if (documentsToUpdate.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No pending documents to reject'
      });
    }

    // Update all pending documents to rejected
    await prisma.maidDocument.updateMany({
      where: {
        id: { in: documentsToUpdate.map(doc => doc.id) }
      },
      data: {
        verificationStatus: 'REJECTED',
        verified: false,
        verifiedBy: adminId,
        verifiedAt: new Date(),
        rejectionReason,
        adminNotes: adminNotes || null
      }
    });

    // Update maid status
    await updateMaidStatusBasedOnDocuments(maidId);

    // Create notification for maid
    await prisma.notification.create({
      data: {
        userId: maidProfile.user.id,
        type: 'SYSTEM_ALERT',
        title: 'Documents Rejected',
        message: `Your verification documents have been rejected. Reason: ${rejectionReason}`,
        data: {
          verificationRejected: true,
          rejectionReason,
          adminNotes: adminNotes || null
        }
      }
    });

    res.json({
      success: true,
      message: 'Verification rejected successfully',
      data: {
        verificationId,
        rejectedDocuments: documentsToUpdate.length,
        rejectionReason,
        adminNotes
      }
    });

  } catch (error) {
    console.error('Error rejecting verification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject verification'
    });
  }
};

// Helper function to update maid status based on document verification
const updateMaidStatusBasedOnDocuments = async (maidProfileId) => {
  try {
    const maidProfile = await prisma.maidProfile.findUnique({
      where: { id: maidProfileId },
      include: { documents: true }
    });

    if (!maidProfile) return;

    const requiredDocs = getRequiredDocuments().filter(doc => doc.required);
    const allRequiredVerified = requiredDocs.every(reqDoc => 
      maidProfile.documents.some(doc => 
        doc.type === reqDoc.type && doc.verificationStatus === 'APPROVED'
      )
    );

    // Update maid status if all required documents are verified
    if (allRequiredVerified && maidProfile.status === 'PENDING_VERIFICATION') {
      await prisma.maidProfile.update({
        where: { id: maidProfileId },
        data: { 
          status: 'ACTIVE',
          isVerified: true,
          verificationDate: new Date()
        }
      });

      // Create notification for maid
      await prisma.notification.create({
        data: {
          userId: maidProfile.userId,
          type: 'SYSTEM_ALERT',
          title: 'Account Verified',
          message: 'Congratulations! All your documents have been verified and your account is now active. You can start receiving bookings.',
          data: {
            statusChange: 'PENDING_VERIFICATION_TO_ACTIVE'
          }
        }
      });
    }
    // Set back to pending if some documents are rejected and maid was active
    else if (maidProfile.status === 'ACTIVE') {
      const hasRejectedDocs = maidProfile.documents.some(doc => 
        doc.verificationStatus === 'REJECTED'
      );
      
      if (hasRejectedDocs) {
        await prisma.maidProfile.update({
          where: { id: maidProfileId },
          data: { status: 'PENDING_VERIFICATION' }
        });

        await prisma.notification.create({
          data: {
            userId: maidProfile.userId,
            type: 'SYSTEM_ALERT',
            title: 'Account Under Review',
            message: 'Some of your documents need resubmission. Please check your document verification status.',
            data: {
              statusChange: 'ACTIVE_TO_PENDING_VERIFICATION'
            }
          }
        });
      }
    }

  } catch (error) {
    console.error('Error updating maid status based on documents:', error);
  }
};

// Get required documents list
const getRequiredDocumentsList = async (req, res) => {
  try {
    res.json({
      success: true,
      data: getRequiredDocuments()
    });
  } catch (error) {
    console.error('Error fetching required documents:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch required documents list'
    });
  }
};

// Delete document
const deleteDocument = async (req, res) => {
  try {
    const { documentId } = req.params;
    const maidId = req.user.id;

    // Get maid profile
    const maidProfile = await prisma.maidProfile.findUnique({
      where: { userId: maidId }
    });

    if (!maidProfile) {
      return res.status(404).json({
        success: false,
        message: 'Maid profile not found'
      });
    }

    // Find document and verify ownership
    const document = await prisma.maidDocument.findFirst({
      where: {
        id: documentId,
        maidId: maidProfile.id
      }
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Delete document record (binary data is automatically deleted)
    await prisma.maidDocument.delete({
      where: { id: documentId }
    });

    // Update maid status based on remaining documents
    await updateMaidStatusBasedOnDocuments(maidProfile.id);

    res.json({
      success: true,
      message: 'Document deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete document'
    });
  }
};

// Get verification statistics (admin only)
const getVerificationStats = async (req, res) => {
  try {
    const stats = await prisma.maidDocument.groupBy({
      by: ['verificationStatus'],
      _count: {
        verificationStatus: true
      }
    });

    const totalMaids = await prisma.maidProfile.count();
    const pendingVerificationMaids = await prisma.maidProfile.count({
      where: { status: 'PENDING_VERIFICATION' }
    });
    const activeMaids = await prisma.maidProfile.count({
      where: { status: 'ACTIVE' }
    });

    const verificationStats = {
      documents: {
        pending: stats.find(s => s.verificationStatus === 'PENDING')?._count.verificationStatus || 0,
        approved: stats.find(s => s.verificationStatus === 'APPROVED')?._count.verificationStatus || 0,
        rejected: stats.find(s => s.verificationStatus === 'REJECTED')?._count.verificationStatus || 0
      },
      maids: {
        total: totalMaids,
        pendingVerification: pendingVerificationMaids,
        active: activeMaids
      }
    };

    res.json({
      success: true,
      data: verificationStats
    });

  } catch (error) {
    console.error('Error fetching verification stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch verification statistics'
    });
  }
};

// Get all maids with document verification status (admin only)
const getAllMaidsWithDocumentStatus = async (req, res) => {
  try {
    const maids = await prisma.maidProfile.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            status: true,
            createdAt: true
          }
        },
        documents: {
          select: {
            id: true,
            type: true,
            fileName: true,
            fileSize: true,
            verificationStatus: true,
            verified: true,
            verifiedAt: true,
            rejectionReason: true,
            createdAt: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Calculate document verification status for each maid
    const maidsWithStatus = maids.map(maid => {
      const requiredDocs = getRequiredDocuments().filter(doc => doc.required);
      const totalRequired = requiredDocs.length;
      const uploaded = requiredDocs.filter(reqDoc => 
        maid.documents.some(doc => doc.type === reqDoc.type)
      ).length;
      const verified = requiredDocs.filter(reqDoc => 
        maid.documents.some(doc => doc.type === reqDoc.type && doc.verificationStatus === 'APPROVED')
      ).length;
      const pending = requiredDocs.filter(reqDoc => 
        maid.documents.some(doc => doc.type === reqDoc.type && doc.verificationStatus === 'PENDING')
      ).length;
      const rejected = requiredDocs.filter(reqDoc => 
        maid.documents.some(doc => doc.type === reqDoc.type && doc.verificationStatus === 'REJECTED')
      ).length;

      return {
        ...maid,
        documentStats: {
          totalRequired,
          uploaded,
          verified,
          pending,
          rejected,
          verificationProgress: totalRequired > 0 ? Math.round((verified / totalRequired) * 100) : 0,
          allRequiredUploaded: uploaded === totalRequired,
          allRequiredVerified: verified === totalRequired
        }
      };
    });

    res.json({
      success: true,
      data: maidsWithStatus
    });

  } catch (error) {
    console.error('Error fetching maids with document status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch maids with document status'
    });
  }
};

// Get documents for admin review (by maid ID)
const getDocumentsForReview = async (req, res) => {
  try {
    const { maidId } = req.params;

    // Get maid profile with user details
    const maidProfile = await prisma.maidProfile.findUnique({
      where: { id: maidId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            createdAt: true
          }
        },
        documents: {
          select: {
            id: true,
            type: true,
            fileName: true,
            fileSize: true,
            mimeType: true,
            verificationStatus: true,
            verified: true,
            verifiedAt: true,
            rejectionReason: true,
            createdAt: true
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!maidProfile) {
      return res.status(404).json({
        success: false,
        message: 'Maid profile not found'
      });
    }

    // Get required documents list
    const requiredDocuments = getRequiredDocuments();
    
    // Create comprehensive document status
    const documentStatus = requiredDocuments.map(reqDoc => {
      const uploadedDoc = maidProfile.documents.find(doc => doc.type === reqDoc.type);
      return {
        ...reqDoc,
        uploaded: !!uploadedDoc,
        document: uploadedDoc || null
      };
    });

    // Calculate verification progress
    const totalRequired = requiredDocuments.filter(doc => doc.required).length;
    const verifiedRequired = documentStatus.filter(doc => 
      doc.required && doc.uploaded && doc.document?.verificationStatus === 'APPROVED'
    ).length;
    const verificationProgress = totalRequired > 0 ? Math.round((verifiedRequired / totalRequired) * 100) : 0;

    res.json({
      success: true,
      data: {
        maidProfile,
        documentStatus,
        verificationProgress,
        allRequiredUploaded: requiredDocuments.filter(doc => doc.required).every(reqDoc => 
          documentStatus.find(doc => doc.type === reqDoc.type)?.uploaded
        ),
        allRequiredVerified: requiredDocuments.filter(doc => doc.required).every(reqDoc => {
          const doc = documentStatus.find(d => d.type === reqDoc.type);
          return doc?.uploaded && doc?.document?.verificationStatus === 'APPROVED';
        })
      }
    });

  } catch (error) {
    console.error('Error fetching documents for review:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch documents for review'
    });
  }
};

// Get specific document by ID (for viewing)
const getDocumentById = async (req, res) => {
  try {
    const { documentId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const document = await prisma.maidDocument.findUnique({
      where: { id: documentId },
      include: {
        maid: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }
      }
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Check authorization - maid can only view their own documents, admin can view all
    if (userRole !== 'ADMIN' && document.maid.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to view this document'
      });
    }

    res.json({
      success: true,
      data: document
    });

  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch document'
    });
  }
};


module.exports = {
  uploadDocument,
  getMaidDocuments,
  getDocumentsForReview,
  verifyDocument,
  deleteDocument,
  getAllMaidsWithDocumentStatus,
  getRequiredDocumentsList,
  getDocumentById,
  getVerificationStats,
  updateMaidStatusBasedOnDocuments,
  uploadMaidVerificationDocuments,
  getMaidVerificationData,
  downloadDocument,
  approveVerification,
  rejectVerification,
  getMaidVerificationStatus
};
