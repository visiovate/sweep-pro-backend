const cloudinary = require('cloudinary').v2;
const { Readable } = require('stream');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload file buffer to Cloudinary
 * @param {Buffer} fileBuffer - File buffer to upload
 * @param {Object} options - Upload options
 * @param {string} options.folder - Folder path in Cloudinary
 * @param {string} options.public_id - Custom public ID
 * @param {string} options.resource_type - Resource type (image, video, raw, auto)
 * @param {Array} options.allowed_formats - Allowed file formats
 * @returns {Promise<Object>} - Cloudinary upload result
 */
const uploadFileBuffer = async (fileBuffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      resource_type: options.resource_type || 'auto',
      folder: options.folder || 'maid-documents',
      use_filename: true,
      unique_filename: true,
      overwrite: false,
      ...options
    };

    // If allowed formats specified, add them to options
    if (options.allowed_formats && options.allowed_formats.length > 0) {
      uploadOptions.allowed_formats = options.allowed_formats;
    }

    // Create a readable stream from buffer
    const stream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          reject(error);
        } else {
          resolve(result);
        }
      }
    );

    // Convert buffer to stream and pipe to Cloudinary
    const readableStream = new Readable();
    readableStream.push(fileBuffer);
    readableStream.push(null);
    readableStream.pipe(stream);
  });
};

/**
 * Upload maid document to Cloudinary
 * @param {Buffer} fileBuffer - Document file buffer
 * @param {Object} documentInfo - Document information
 * @param {string} documentInfo.maidId - Maid ID
 * @param {string} documentInfo.documentType - Document type (AADHAR_CARD, PAN_CARD, etc.)
 * @param {string} documentInfo.originalName - Original filename
 * @returns {Promise<Object>} - Upload result with URL and public ID
 */
const uploadMaidDocument = async (fileBuffer, documentInfo) => {
  try {
    const { maidId, documentType, originalName } = documentInfo;
    
    // Generate folder structure: maid-documents/maidId/documentType
    const folder = `maid-documents/${maidId}/${documentType.toLowerCase()}`;
    
    // Generate public ID with timestamp
    const timestamp = new Date().getTime();
    const public_id = `${documentType.toLowerCase()}_${timestamp}`;

    const uploadOptions = {
      folder,
      public_id,
      resource_type: 'auto',
      allowed_formats: ['jpg', 'jpeg', 'png', 'pdf', 'webp'],
      transformation: [
        { 
          quality: 'auto:good',
          fetch_format: 'auto'
        }
      ]
    };

    const result = await uploadFileBuffer(fileBuffer, uploadOptions);

    return {
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format,
      bytes: result.bytes,
      width: result.width,
      height: result.height,
      resourceType: result.resource_type,
      createdAt: result.created_at
    };

  } catch (error) {
    console.error('Error uploading maid document:', error);
    throw new Error(`Failed to upload document: ${error.message}`);
  }
};

/**
 * Delete file from Cloudinary
 * @param {string} publicId - Cloudinary public ID
 * @param {string} resourceType - Resource type (image, video, raw)
 * @returns {Promise<Object>} - Deletion result
 */
const deleteFile = async (publicId, resourceType = 'image') => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType
    });
    return {
      success: result.result === 'ok',
      result: result.result
    };
  } catch (error) {
    console.error('Error deleting file from Cloudinary:', error);
    throw new Error(`Failed to delete file: ${error.message}`);
  }
};

/**
 * Get file details from Cloudinary
 * @param {string} publicId - Cloudinary public ID
 * @param {string} resourceType - Resource type
 * @returns {Promise<Object>} - File details
 */
const getFileDetails = async (publicId, resourceType = 'image') => {
  try {
    const result = await cloudinary.api.resource(publicId, {
      resource_type: resourceType
    });
    return {
      success: true,
      url: result.secure_url,
      format: result.format,
      bytes: result.bytes,
      width: result.width,
      height: result.height,
      createdAt: result.created_at,
      folder: result.folder
    };
  } catch (error) {
    console.error('Error getting file details:', error);
    throw new Error(`Failed to get file details: ${error.message}`);
  }
};

/**
 * Generate a signed URL for private/protected resources
 * @param {string} publicId - Cloudinary public ID
 * @param {Object} options - Options for signed URL
 * @returns {string} - Signed URL
 */
const generateSignedUrl = (publicId, options = {}) => {
  try {
    const signedOptions = {
      resource_type: 'auto',
      type: 'upload',
      expires_at: Math.floor(Date.now() / 1000) + (60 * 60 * 24), // 24 hours from now
      ...options
    };

    return cloudinary.utils.private_download_zip_url({
      public_ids: [publicId],
      ...signedOptions
    });
  } catch (error) {
    console.error('Error generating signed URL:', error);
    throw new Error(`Failed to generate signed URL: ${error.message}`);
  }
};

/**
 * Validate file before upload
 * @param {Object} file - Multer file object
 * @param {Array} allowedTypes - Allowed MIME types
 * @param {number} maxSize - Maximum file size in bytes
 * @returns {Object} - Validation result
 */
const validateFile = (file, allowedTypes = [], maxSize = 5 * 1024 * 1024) => {
  const errors = [];

  // Check file size
  if (file.size > maxSize) {
    errors.push(`File size ${(file.size / (1024 * 1024)).toFixed(2)}MB exceeds maximum allowed size ${(maxSize / (1024 * 1024))}MB`);
  }

  // Check file type
  if (allowedTypes.length > 0 && !allowedTypes.includes(file.mimetype)) {
    errors.push(`File type ${file.mimetype} is not allowed. Allowed types: ${allowedTypes.join(', ')}`);
  }

  // Check for valid file - works with both memory and disk storage
  if (file.buffer) {
    // Memory storage
    if (file.buffer.length === 0) {
      errors.push('File is empty or corrupted');
    }
  } else if (file.path) {
    // Disk storage - check if file exists and has size
    const fs = require('fs');
    try {
      const stats = fs.statSync(file.path);
      if (stats.size === 0) {
        errors.push('File is empty');
      }
    } catch (fsError) {
      errors.push('File not found or corrupted');
    }
  } else {
    errors.push('No file data available');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Get upload statistics
 * @param {string} folder - Folder to get stats for
 * @returns {Promise<Object>} - Upload statistics
 */
const getUploadStats = async (folder = 'maid-documents') => {
  try {
    const result = await cloudinary.api.resources({
      type: 'upload',
      prefix: folder,
      max_results: 500
    });

    const stats = {
      totalFiles: result.resources.length,
      totalSize: result.resources.reduce((sum, resource) => sum + resource.bytes, 0),
      byFormat: {},
      byFolder: {}
    };

    result.resources.forEach(resource => {
      // Count by format
      stats.byFormat[resource.format] = (stats.byFormat[resource.format] || 0) + 1;
      
      // Count by folder
      const folderName = resource.folder || 'root';
      stats.byFolder[folderName] = (stats.byFolder[folderName] || 0) + 1;
    });

    return stats;
  } catch (error) {
    console.error('Error getting upload stats:', error);
    throw new Error(`Failed to get upload stats: ${error.message}`);
  }
};

module.exports = {
  uploadFileBuffer,
  uploadMaidDocument,
  deleteFile,
  getFileDetails,
  generateSignedUrl,
  validateFile,
  getUploadStats,
  cloudinary
};
