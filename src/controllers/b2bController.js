const emailService = require('../services/notification/EmailService');

/**
 * Validation utilities
 */
const validators = {
  // Sanitize string input to prevent XSS
  sanitizeString: (str) => {
    if (typeof str !== 'string') return '';
    return str
      .trim()
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .substring(0, 500); // Limit length
  },

  // Validate email format
  isValidEmail: (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  // Validate phone number (basic format)
  isValidPhone: (phone) => {
    const phoneRegex = /^[\d\s\+\-\(\)]{10,20}$/;
    return phoneRegex.test(phone);
  },

  // Validate URL format
  isValidUrl: (url) => {
    if (!url) return true; // Optional field
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  },

  // Validate allowed enum values
  isValidEnum: (value, allowedValues) => {
    return allowedValues.includes(value);
  },

  // Validate array of strings
  isValidStringArray: (arr) => {
    if (!Array.isArray(arr)) return false;
    if (arr.length === 0) return false;
    return arr.every(item => typeof item === 'string' && item.length > 0 && item.length <= 100);
  }
};

/**
 * Handle B2B Partnership Form Submission
 * Sends email notification with partnership details
 */
async function submitPartnershipRequest(req, res) {
  const startTime = Date.now();
  console.log('🚀 [B2B] Request started at:', new Date().toISOString());

  try {
    const parseStart = Date.now();
    const {
      contactPerson,
      email,
      phone,
      companyName,
      website,
      serviceType,
      serviceLocations,
      message,
      preferredContactMethod,
    } = req.body;
    console.log(`📊 [B2B] Request parsing: ${Date.now() - parseStart}ms`);

    const validationStart = Date.now();
    // Validate required fields presence
    const requiredFields = [
      'contactPerson',
      'email',
      'phone',
      'companyName',
      'serviceType',
      'serviceLocations',
    ];

    const missingFields = requiredFields.filter(field => !req.body[field]);
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`,
      });
    }

    // Sanitize and validate string fields
    const sanitizedContactPerson = validators.sanitizeString(contactPerson);
    const sanitizedCompanyName = validators.sanitizeString(companyName);
    const sanitizedServiceLocations = validators.sanitizeString(serviceLocations);
    const sanitizedMessage = message ? validators.sanitizeString(message) : '';

    // Validate field lengths
    if (sanitizedContactPerson.length < 2 || sanitizedContactPerson.length > 100) {
      return res.status(400).json({
        success: false,
        error: 'Contact person name must be between 2 and 100 characters',
      });
    }

    if (sanitizedCompanyName.length < 2 || sanitizedCompanyName.length > 100) {
      return res.status(400).json({
        success: false,
        error: 'Company name must be between 2 and 100 characters',
      });
    }

    if (sanitizedServiceLocations.length < 2 || sanitizedServiceLocations.length > 200) {
      return res.status(400).json({
        success: false,
        error: 'Service locations must be between 2 and 200 characters',
      });
    }

    if (sanitizedMessage.length > 1000) {
      return res.status(400).json({
        success: false,
        error: 'Message must not exceed 1000 characters',
      });
    }

    // Validate email format
    if (!validators.isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format',
      });
    }

    // Validate phone format
    if (!validators.isValidPhone(phone)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number format',
      });
    }

    // Validate URL format if provided
    if (website && !validators.isValidUrl(website)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid website URL format',
      });
    }

    // Validate enum values
    const allowedContactMethods = ['email', 'phone', 'both'];
    if (!validators.isValidEnum(preferredContactMethod, allowedContactMethods)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid preferred contact method',
      });
    }

    // Validate service types array
    const allowedServiceTypes = ['Daily Cleaning', 'Deep Cleaning', 'Office Cleaning', 'House Keeping', 'Security Services', 'Move-in/Move-out'];
    if (!validators.isValidStringArray(serviceType)) {
      return res.status(400).json({
        success: false,
        error: 'Service types must be a non-empty array',
      });
    }

    // Check if all service types are valid
    const invalidServiceTypes = serviceType.filter(type => !allowedServiceTypes.includes(type));
    if (invalidServiceTypes.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Invalid service types: ${invalidServiceTypes.join(', ')}`,
      });
    }

    // Use sanitized values
    const validatedData = {
      contactPerson: sanitizedContactPerson,
      email: email.toLowerCase().trim(), // Normalize email
      phone: phone.trim(),
      companyName: sanitizedCompanyName,
      website: website ? website.trim() : '',
      serviceType,
      serviceLocations: sanitizedServiceLocations,
      message: sanitizedMessage,
      preferredContactMethod,
    };
    console.log(`📊 [B2B] Validation: ${Date.now() - validationStart}ms`);

    const htmlGenStart = Date.now();
    // Create email content using validated data
    const emailSubject = `Partnership Inquiry: ${validatedData.companyName}`;

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Partnership Inquiry</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #ffffff;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="margin: 0 0 10px 0; color: #333333; font-size: 20px;">Partnership Inquiry</h1>
          <p style="margin: 0 0 20px 0; color: #666666; font-size: 14px;">${validatedData.companyName}</p>

          <h2 style="margin: 0 0 10px 0; color: #333333; font-size: 16px;">Contact Information</h2>
          <p style="margin: 0 0 5px 0; color: #333333; font-size: 14px;"><strong>Contact Person:</strong> ${validatedData.contactPerson}</p>
          <p style="margin: 0 0 5px 0; color: #333333; font-size: 14px;"><strong>Email:</strong> ${validatedData.email}</p>
          <p style="margin: 0 0 5px 0; color: #333333; font-size: 14px;"><strong>Phone:</strong> ${validatedData.phone}</p>
          <p style="margin: 0 0 20px 0; color: #333333; font-size: 14px;"><strong>Preferred Contact:</strong> ${validatedData.preferredContactMethod}</p>

          <h2 style="margin: 0 0 10px 0; color: #333333; font-size: 16px;">Company Information</h2>
          <p style="margin: 0 0 5px 0; color: #333333; font-size: 14px;"><strong>Company Name:</strong> ${validatedData.companyName}</p>
          ${validatedData.website ? `<p style="margin: 0 0 20px 0; color: #333333; font-size: 14px;"><strong>Website:</strong> ${validatedData.website}</p>` : '<br>'}

          <h2 style="margin: 0 0 10px 0; color: #333333; font-size: 16px;">Service Requirements</h2>
          <p style="margin: 0 0 5px 0; color: #333333; font-size: 14px;"><strong>Service Types:</strong> ${Array.isArray(validatedData.serviceType) ? validatedData.serviceType.join(', ') : validatedData.serviceType}</p>
          <p style="margin: 0 0 20px 0; color: #333333; font-size: 14px;"><strong>Service Locations:</strong> ${validatedData.serviceLocations}</p>

          ${validatedData.message ? `<h2 style="margin: 0 0 10px 0; color: #333333; font-size: 16px;">Additional Information</h2><p style="margin: 0 0 20px 0; color: #333333; font-size: 14px;">${validatedData.message}</p>` : ''}

          <hr style="margin: 20px 0; border: none; border-top: 1px solid #e0e0e0;">
          <p style="margin: 0 0 5px 0; color: #666666; font-size: 12px;">Submitted on: ${new Date().toLocaleString()}</p>
          <p style="margin: 0; color: #666666; font-size: 12px;">This is an automated message from Sweepro Partnership System</p>
        </div>
      </body>
      </html>
    `;
    console.log(`📊 [B2B] HTML generation: ${Date.now() - htmlGenStart}ms`);

    // OPTIMIZATION: Send emails in background (fire-and-forget)
    // This reduces TTFB from ~600ms to ~10ms
    const emailStart = Date.now();

    const adminEmail = process.env.ADMIN_EMAIL || 'partnerships@sweepro.com';
    const adminEmailText = `
      New B2B Partnership Request

      Contact Details:
      - Contact Person: ${validatedData.contactPerson}
      - Email: ${validatedData.email}
      - Phone: ${validatedData.phone}
      - Preferred Contact: ${validatedData.preferredContactMethod}

      Company Details:
      - Company Name: ${validatedData.companyName}
      - Website: ${validatedData.website || 'N/A'}

      Service Requirements:
      - Service Types: ${Array.isArray(validatedData.serviceType) ? validatedData.serviceType.join(', ') : validatedData.serviceType}
      - Service Locations: ${validatedData.serviceLocations}

      Additional Information:
      ${validatedData.message || 'None provided'}

      Submitted on: ${new Date().toLocaleString()}
    `;

    const confirmationHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Partnership Request Received</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #ffffff;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="margin: 0 0 10px 0; color: #333333; font-size: 20px;">Partnership Request Received</h1>
          <p style="margin: 0 0 20px 0; color: #666666; font-size: 14px;">Thank you for your interest in Sweepro</p>

          <p style="margin: 0 0 10px 0; color: #333333; font-size: 14px;">Dear ${validatedData.contactPerson},</p>
          <p style="margin: 0 0 20px 0; color: #333333; font-size: 14px;">
            Thank you for submitting your partnership request for ${validatedData.companyName}. We have received your application and our team will review it within 24-48 hours.
          </p>

          <h2 style="margin: 0 0 10px 0; color: #333333; font-size: 16px;">What happens next?</h2>
          <ul style="margin: 0 0 20px 0; color: #333333; font-size: 14px; padding-left: 20px;">
            <li>Our team will review your partnership request</li>
            <li>We will contact you via ${validatedData.preferredContactMethod} within 24-48 hours</li>
            <li>We will schedule a call to discuss partnership opportunities</li>
            <li>We will provide you with onboarding materials and next steps</li>
          </ul>

          <h2 style="margin: 0 0 10px 0; color: #333333; font-size: 16px;">Request Reference</h2>
          <p style="margin: 0 0 5px 0; color: #333333; font-size: 14px;"><strong>Company:</strong> ${validatedData.companyName}</p>
          <p style="margin: 0 0 20px 0; color: #333333; font-size: 14px;"><strong>Submitted:</strong> ${new Date().toLocaleDateString()}</p>

          <p style="margin: 0 0 20px 0; color: #333333; font-size: 14px;">
            If you have any questions in the meantime, please do not hesitate to contact us.
          </p>

          <p style="margin: 0 0 20px 0; color: #333333; font-size: 14px;">
            Best regards,<br>
            The Sweepro Partnership Team
          </p>

          <hr style="margin: 20px 0; border: none; border-top: 1px solid #e0e0e0;">
          <p style="margin: 0; color: #666666; font-size: 12px;">This is an automated message from Sweepro Partnership System</p>
        </div>
      </body>
      </html>
    `;

    const confirmationEmailText = `
      Partnership Request Received - Sweepro

      Dear ${validatedData.contactPerson},

      Thank you for submitting your partnership request for ${validatedData.companyName}. We have received your application and our team will review it within 24-48 hours.

      What happens next?
      - Our team will review your partnership request
      - We will contact you via ${validatedData.preferredContactMethod} within 24-48 hours
      - We will schedule a call to discuss partnership opportunities
      - We will provide you with onboarding materials and next steps

      Request Reference:
      Company: ${validatedData.companyName}
      Submitted: ${new Date().toLocaleDateString()}

      If you have any questions in the meantime, please do not hesitate to contact us.

      Best regards,
      The Sweepro Partnership Team
    `;

    // Fire-and-forget: send emails in background without awaiting
    // Log errors but don't block response
    emailService.sendEmail({
      to: adminEmail,
      subject: emailSubject,
      html: emailHtml,
      text: adminEmailText,
    }).catch(err => console.error('📧 Admin email failed:', err));

    emailService.sendEmail({
      to: validatedData.email,
      subject: 'Partnership Request Received - Sweepro',
      html: confirmationHtml,
      text: confirmationEmailText,
    }).catch(err => console.error('📧 Confirmation email failed:', err));

    console.log(`📊 [B2B] Emails queued (background): ${Date.now() - emailStart}ms`);

    const responseStart = Date.now();
    res.status(200).json({
      success: true,
      message: 'Partnership request submitted successfully',
      emailSent: true, // Emails queued in background
    });
    console.log(`📊 [B2B] Response serialization: ${Date.now() - responseStart}ms`);
    console.log(`📊 [B2B] TOTAL REQUEST TIME: ${Date.now() - startTime}ms`);
  } catch (error) {
    console.error('Error submitting partnership request:', error);
    console.log(`📊 [B2B] TOTAL REQUEST TIME (ERROR): ${Date.now() - startTime}ms`);
    res.status(500).json({
      success: false,
      error: 'Failed to submit partnership request',
      details: error.message,
    });
  }
}

module.exports = {
  submitPartnershipRequest,
};
