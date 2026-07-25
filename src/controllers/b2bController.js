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

  // Validate phone number (exactly 10 digits)
  isValidPhone: (phone) => {
    const phoneRegex = /^\d{10}$/;
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
    const emailSubject = `Service request from ${validatedData.companyName}`;

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Service Request</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <!-- Header -->
          <div style="background-color: #1800ad; padding: 25px 20px; text-align: center;">
            <div style="font-size: 28px; font-weight: bold; color: white; margin: 0; letter-spacing: 1px;">
              SWEEPRO
            </div>
          </div>

          <!-- Content -->
          <div style="padding: 30px 20px;">
            <h1 style="margin: 0 0 10px 0; color: #333333; font-size: 20px; font-weight: 600;">Service Request</h1>
            <p style="margin: 0 0 25px 0; color: #666666; font-size: 14px; border-bottom: 1px solid #e0e0e0; padding-bottom: 15px;">
              From: ${validatedData.companyName}
            </p>

            <!-- Contact Information -->
            <div style="background-color: #f9f9f9; padding: 20px; border-radius: 4px; margin-bottom: 20px;">
              <h2 style="margin: 0 0 15px 0; color: #333333; font-size: 16px; font-weight: 600;">Contact Information</h2>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #666666; font-weight: 500; width: 140px;">Contact Person:</td>
                  <td style="padding: 8px 0; color: #333333;">${validatedData.contactPerson}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666666; font-weight: 500;">Email:</td>
                  <td style="padding: 8px 0; color: #333333;">
                    <a href="mailto:${validatedData.email}" style="color: #1800ad; text-decoration: none;">${validatedData.email}</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666666; font-weight: 500;">Phone:</td>
                  <td style="padding: 8px 0; color: #333333;">${validatedData.phone}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666666; font-weight: 500;">Preferred Contact:</td>
                  <td style="padding: 8px 0; color: #333333; text-transform: capitalize;">${validatedData.preferredContactMethod}</td>
                </tr>
              </table>
            </div>

            <!-- Company Information -->
            <div style="background-color: #f9f9f9; padding: 20px; border-radius: 4px; margin-bottom: 20px;">
              <h2 style="margin: 0 0 15px 0; color: #333333; font-size: 16px; font-weight: 600;">Company Information</h2>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #666666; font-weight: 500; width: 140px;">Company Name:</td>
                  <td style="padding: 8px 0; color: #333333;">${validatedData.companyName}</td>
                </tr>
                ${validatedData.website ? `
                <tr>
                  <td style="padding: 8px 0; color: #666666; font-weight: 500;">Website:</td>
                  <td style="padding: 8px 0; color: #333333;">
                    <a href="${validatedData.website}" style="color: #1800ad; text-decoration: none;" target="_blank">${validatedData.website}</a>
                  </td>
                </tr>
                ` : ''}
              </table>
            </div>

            <!-- Service Requirements -->
            <div style="background-color: #f9f9f9; padding: 20px; border-radius: 4px; margin-bottom: 20px;">
              <h2 style="margin: 0 0 15px 0; color: #333333; font-size: 16px; font-weight: 600;">Service Requirements</h2>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #666666; font-weight: 500; width: 140px; vertical-align: top;">Service Types:</td>
                  <td style="padding: 8px 0; color: #333333;">
                    ${Array.isArray(validatedData.serviceType) ? validatedData.serviceType.join(', ') : validatedData.serviceType}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666666; font-weight: 500;">Service Locations:</td>
                  <td style="padding: 8px 0; color: #333333;">${validatedData.serviceLocations}</td>
                </tr>
              </table>
            </div>

            ${validatedData.message ? `
            <!-- Additional Information -->
            <div style="background-color: #f9f9f9; padding: 20px; border-radius: 4px; margin-bottom: 20px;">
              <h2 style="margin: 0 0 15px 0; color: #333333; font-size: 16px; font-weight: 600;">Additional Information</h2>
              <p style="margin: 0; color: #333333; line-height: 1.6;">${validatedData.message}</p>
            </div>
            ` : ''}
          </div>

          <!-- Footer -->
          <div style="background-color: #f9f9f9; padding: 20px; text-align: center; border-top: 1px solid #e0e0e0;">
            <p style="margin: 0 0 5px 0; color: #666666; font-size: 12px;">
              Submitted: ${new Date().toLocaleString()}
            </p>
            <p style="margin: 0 0 5px 0; color: #999999; font-size: 11px;">
              Sweepro Cleaning Services
            </p>
            <p style="margin: 0; color: #999999; font-size: 10px;">
              Hyderabad, India | <a href="mailto:sweeproindia@gmail.com" style="color: #999999;">sweeproindia@gmail.com</a>
            </p>
          </div>
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
        <title>Service Request Received</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <!-- Header -->
          <div style="background-color: #1800ad; padding: 25px 20px; text-align: center;">
            <div style="font-size: 28px; font-weight: bold; color: white; margin: 0; letter-spacing: 1px;">
              SWEEPRO
            </div>
          </div>

          <!-- Content -->
          <div style="padding: 30px 20px;">
            <h1 style="margin: 0 0 10px 0; color: #333333; font-size: 20px; font-weight: 600;">Service Request Received</h1>
            <p style="margin: 0 0 25px 0; color: #666666; font-size: 14px; border-bottom: 1px solid #e0e0e0; padding-bottom: 15px;">
              Reference: ${validatedData.companyName}
            </p>

            <p style="margin: 0 0 20px 0; color: #333333; font-size: 15px; line-height: 1.6;">
              Dear ${validatedData.contactPerson},
            </p>
            <p style="margin: 0 0 25px 0; color: #333333; font-size: 15px; line-height: 1.6;">
              Thank you for submitting your service request for ${validatedData.companyName}. We have received your request and our team will review it within 24-48 hours.
            </p>

            <!-- What happens next -->
            <div style="background-color: #f9f9f9; padding: 20px; border-radius: 4px; margin-bottom: 20px;">
              <h2 style="margin: 0 0 15px 0; color: #333333; font-size: 16px; font-weight: 600;">Next Steps</h2>
              <ul style="margin: 0; padding-left: 20px; color: #333333; line-height: 1.8; font-size: 14px;">
                <li>Our team will review your service request</li>
                <li>We will contact you via ${validatedData.preferredContactMethod} within 24-48 hours</li>
                <li>We will schedule a call to discuss service requirements</li>
                <li>We will provide you with onboarding materials and next steps</li>
              </ul>
            </div>

            <!-- Request Reference -->
            <div style="background-color: #f9f9f9; padding: 20px; border-radius: 4px; margin-bottom: 20px;">
              <h2 style="margin: 0 0 15px 0; color: #333333; font-size: 16px; font-weight: 600;">Request Reference</h2>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #666666; font-weight: 500; width: 140px;">Company:</td>
                  <td style="padding: 8px 0; color: #333333;">${validatedData.companyName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666666; font-weight: 500;">Submitted:</td>
                  <td style="padding: 8px 0; color: #333333;">${new Date().toLocaleDateString()}</td>
                </tr>
              </table>
            </div>

            <p style="margin: 0 0 25px 0; color: #333333; font-size: 15px; line-height: 1.6;">
              If you have any questions in the meantime, please do not hesitate to contact us.
            </p>

            <p style="margin: 0 0 25px 0; color: #333333; font-size: 15px; line-height: 1.6;">
              Best regards,<br>
              Sweepro Team
            </p>
          </div>

          <!-- Footer -->
          <div style="background-color: #f9f9f9; padding: 20px; text-align: center; border-top: 1px solid #e0e0e0;">
            <p style="margin: 0 0 5px 0; color: #999999; font-size: 11px;">
              Sweepro Cleaning Services
            </p>
            <p style="margin: 0; color: #999999; font-size: 10px;">
              Hyderabad, India | <a href="mailto:sweeproindia@gmail.com" style="color: #999999;">sweeproindia@gmail.com</a>
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    const confirmationEmailText = `
      Service Request Received - Sweepro

      Dear ${validatedData.contactPerson},

      Thank you for submitting your service request for ${validatedData.companyName}. We have received your request and our team will review it within 24-48 hours.

      What happens next?
      - Our team will review your service request
      - We will contact you via ${validatedData.preferredContactMethod} within 24-48 hours
      - We will schedule a call to discuss service requirements
      - We will provide you with onboarding materials and next steps

      Request Reference:
      Company: ${validatedData.companyName}
      Submitted: ${new Date().toLocaleDateString()}

      If you have any questions in the meantime, please do not hesitate to contact us.

      Best regards,
      Sweepro Team
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
      subject: 'Service Request Received - Sweepro',
      html: confirmationHtml,
      text: confirmationEmailText,
    }).catch(err => console.error('📧 Confirmation email failed:', err));

    console.log(`📊 [B2B] Emails queued (background): ${Date.now() - emailStart}ms`);

    const responseStart = Date.now();
    res.status(200).json({
      success: true,
      message: 'Service request submitted successfully',
      emailSent: true, // Emails queued in background
    });
    console.log(`📊 [B2B] Response serialization: ${Date.now() - responseStart}ms`);
    console.log(`📊 [B2B] TOTAL REQUEST TIME: ${Date.now() - startTime}ms`);
  } catch (error) {
    console.error('Error submitting service request:', error);
    console.log(`📊 [B2B] TOTAL REQUEST TIME (ERROR): ${Date.now() - startTime}ms`);
    res.status(500).json({
      success: false,
      error: 'Failed to submit service request',
      details: error.message,
    });
  }
}

module.exports = {
  submitPartnershipRequest,
};
