/**
 * Notification Templates
 * Centralized templates for all notification types with multi-language support
 */

const notificationTemplates = {
  // Booking Lifecycle
  BOOKING_CREATED: {
    en: {
      customer: {
        title: 'Booking Confirmed',
        message: (data) => `Your booking for ${data.serviceName} has been created successfully for ${new Date(data.scheduledAt).toLocaleDateString()}`
      },
      admin: {
        title: 'New Booking Created',
        message: (data) => `New booking for ${data.serviceName} by ${data.customerName}`
      }
    },
    hi: {
      customer: {
        title: 'बुकिंग की पुष्टि',
        message: (data) => `${data.serviceName} के लिए आपकी बुकिंग ${new Date(data.scheduledAt).toLocaleDateString()} के लिए सफलतापूर्वक बनाई गई है`
      },
      admin: {
        title: 'नई बुकिंग बनाई गई',
        message: (data) => `${data.customerName} द्वारा ${data.serviceName} के लिए नई बुकिंग`
      }
    }
  },

  MAID_ASSIGNED: {
    en: {
      customer: {
        title: 'Maid Assigned',
        message: (data) => `${data.maidName} has been assigned to your booking`
      },
      maid: {
        title: 'New Service Assignment',
        message: (data) => `You have been assigned to a new service: ${data.serviceName} at ${data.customerAddress}`
      },
      admin: {
        title: 'Maid Assignment Completed',
        message: (data) => `${data.maidName} assigned to booking ${data.bookingId}`
      }
    },
    hi: {
      customer: {
        title: 'मेड नियुक्त',
        message: (data) => `${data.maidName} को आपकी बुकिंग के लिए नियुक्त किया गया है`
      },
      maid: {
        title: 'नई सेवा असाइनमेंट',
        message: (data) => `आपको एक नई सेवा सौंपी गई है: ${data.serviceName} ${data.customerAddress} पर`
      },
      admin: {
        title: 'मेड असाइनमेंट पूर्ण',
        message: (data) => `${data.maidName} को बुकिंग ${data.bookingId} के लिए नियुक्त किया गया`
      }
    }
  },

  ASSIGNMENT_REQUEST: {
    en: {
      maid: {
        title: 'New Service Assignment Request',
        message: (data) => `You have a new service request for ${data.serviceName} on ${new Date(data.scheduledAt).toLocaleDateString()}. Please respond within ${data.hoursToRespond} hours.`
      },
      admin: {
        title: 'Assignment Request Sent',
        message: (data) => `Assignment request sent to ${data.maidName} for booking ${data.bookingId}`
      }
    },
    hi: {
      maid: {
        title: 'नया सेवा असाइनमेंट अनुरोध',
        message: (data) => `आपके पास ${new Date(data.scheduledAt).toLocaleDateString()} को ${data.serviceName} के लिए एक नया सेवा अनुरोध है। कृपया ${data.hoursToRespond} घंटों के भीतर जवाब दें।`
      },
      admin: {
        title: 'असाइनमेंट अनुरोध भेजा गया',
        message: (data) => `बुकिंग ${data.bookingId} के लिए ${data.maidName} को असाइनमेंट अनुरोध भेजा गया`
      }
    }
  },

  ASSIGNMENT_ACCEPTED: {
    en: {
      customer: {
        title: 'Maid Accepted Assignment',
        message: (data) => `${data.maidName} has accepted your service request. Contact: ${data.maidPhone}`
      },
      admin: {
        title: 'Assignment Accepted',
        message: (data) => `${data.maidName} accepted assignment for booking ${data.bookingId}`
      }
    },
    hi: {
      customer: {
        title: 'मेड ने असाइनमेंट स्वीकार किया',
        message: (data) => `${data.maidName} ने आपका सेवा अनुरोध स्वीकार कर लिया है। संपर्क: ${data.maidPhone}`
      },
      admin: {
        title: 'असाइनमेंट स्वीकृत',
        message: (data) => `${data.maidName} ने बुकिंग ${data.bookingId} के लिए असाइनमेंट स्वीकार किया`
      }
    }
  },

  ASSIGNMENT_REJECTED: {
    en: {
      customer: {
        title: 'Assignment Request Declined',
        message: (data) => `${data.maidName} declined the service request. We're finding another maid for you.`
      },
      admin: {
        title: 'Assignment Rejected - Action Required',
        message: (data) => `${data.maidName} rejected assignment for booking ${data.bookingId}. Reason: ${data.rejectionReason || 'Not specified'}. Reassignment needed.`
      }
    },
    hi: {
      customer: {
        title: 'असाइनमेंट अनुरोध अस्वीकृत',
        message: (data) => `${data.maidName} ने सेवा अनुरोध अस्वीकार कर दिया। हम आपके लिए दूसरी मेड ढूंढ रहे हैं।`
      },
      admin: {
        title: 'असाइनमेंट अस्वीकृत - कार्रवाई आवश्यक',
        message: (data) => `${data.maidName} ने बुकिंग ${data.bookingId} के लिए असाइनमेंट अस्वीकार कर दिया। कारण: ${data.rejectionReason || 'निर्दिष्ट नहीं'}। पुनः असाइनमेंट आवश्यक।`
      }
    }
  },

  SERVICE_STARTED: {
    en: {
      customer: {
        title: 'Service Started',
        message: (data) => `Your ${data.serviceName} service has started`
      },
      admin: {
        title: 'Service Started',
        message: (data) => `Service started by ${data.maidName} for booking ${data.bookingId}`
      }
    },
    hi: {
      customer: {
        title: 'सेवा शुरू हुई',
        message: (data) => `आपकी ${data.serviceName} सेवा शुरू हो गई है`
      },
      admin: {
        title: 'सेवा शुरू हुई',
        message: (data) => `${data.maidName} द्वारा बुकिंग ${data.bookingId} के लिए सेवा शुरू की गई`
      }
    }
  },

  SERVICE_COMPLETED: {
    en: {
      customer: {
        title: 'Service Completed',
        message: (data) => `Your ${data.serviceName} service has been completed`
      },
      admin: {
        title: 'Service Completion Notification',
        message: (data) => `Service completed by ${data.maidName} for booking ${data.bookingId}`
      }
    },
    hi: {
      customer: {
        title: 'सेवा पूर्ण',
        message: (data) => `आपकी ${data.serviceName} सेवा पूर्ण हो गई है`
      },
      admin: {
        title: 'सेवा पूर्णता सूचना',
        message: (data) => `${data.maidName} द्वारा बुकिंग ${data.bookingId} के लिए सेवा पूर्ण की गई`
      }
    }
  },

  BOOKING_REMINDER: {
    en: {
      customer: {
        title: 'Service Reminder',
        message: (data) => `Your ${data.serviceName} service is scheduled for tomorrow at ${data.timeSlot || 'scheduled time'}`
      },
      maid: {
        title: 'Service Reminder',
        message: (data) => `You have a service scheduled for tomorrow: ${data.serviceName} at ${data.customerAddress}`
      }
    },
    hi: {
      customer: {
        title: 'सेवा अनुस्मारक',
        message: (data) => `आपकी ${data.serviceName} सेवा कल ${data.timeSlot || 'निर्धारित समय'} पर निर्धारित है`
      },
      maid: {
        title: 'सेवा अनुस्मारक',
        message: (data) => `आपके पास कल के लिए एक सेवा निर्धारित है: ${data.serviceName} ${data.customerAddress} पर`
      }
    }
  },

  BOOKING_APPROACHING: {
    en: {
      customer: {
        title: 'Service Starting Soon',
        message: (data) => `Your ${data.serviceName} service starts in ${data.hoursLeft} hour${data.hoursLeft > 1 ? 's' : ''}`
      },
      maid: {
        title: 'Service Starting Soon',
        message: (data) => `Service at ${data.customerName}'s location starts in ${data.hoursLeft} hour${data.hoursLeft > 1 ? 's' : ''}`
      }
    },
    hi: {
      customer: {
        title: 'सेवा जल्द शुरू होगी',
        message: (data) => `आपकी ${data.serviceName} सेवा ${data.hoursLeft} घंटे में शुरू होगी`
      },
      maid: {
        title: 'सेवा जल्द शुरू होगी',
        message: (data) => `${data.customerName} के स्थान पर सेवा ${data.hoursLeft} घंटे में शुरू होगी`
      }
    }
  },

  // Payment Notifications
  PAYMENT_RECEIVED: {
    en: {
      customer: {
        title: 'Payment Received',
        message: (data) => `Payment of ₹${data.amount} received successfully`
      },
      admin: {
        title: 'Payment Confirmation',
        message: (data) => `Payment of ₹${data.amount} received from customer`
      }
    },
    hi: {
      customer: {
        title: 'भुगतान प्राप्त',
        message: (data) => `₹${data.amount} का भुगतान सफलतापूर्वक प्राप्त हुआ`
      },
      admin: {
        title: 'भुगतान पुष्टि',
        message: (data) => `ग्राहक से ₹${data.amount} का भुगतान प्राप्त हुआ`
      }
    }
  },

  PAYMENT_FAILED: {
    en: {
      customer: {
        title: 'Payment Failed',
        message: (data) => `Payment of ₹${data.amount} failed. Please try again.`
      },
      admin: {
        title: 'Payment Failure Alert',
        message: (data) => `Payment failure for customer ${data.customerId}`
      }
    },
    hi: {
      customer: {
        title: 'भुगतान विफल',
        message: (data) => `₹${data.amount} का भुगतान विफल रहा। कृपया पुनः प्रयास करें।`
      },
      admin: {
        title: 'भुगतान विफलता चेतावनी',
        message: (data) => `ग्राहक ${data.customerId} के लिए भुगतान विफल`
      }
    }
  },

  PAYMENT_REMINDER: {
    en: {
      customer: {
        title: 'Payment Reminder',
        message: (data) => `Payment pending for your ${data.serviceName} booking. Amount: ₹${data.amount}`
      }
    },
    hi: {
      customer: {
        title: 'भुगतान अनुस्मारक',
        message: (data) => `आपकी ${data.serviceName} बुकिंग के लिए भुगतान लंबित है। राशि: ₹${data.amount}`
      }
    }
  },

  // Subscription Notifications
  SUBSCRIPTION_CREATED: {
    en: {
      customer: {
        title: 'Subscription Activated',
        message: (data) => `Your ${data.planName} subscription is now active`
      },
      admin: {
        title: 'New Subscription',
        message: (data) => `New subscription created: ${data.planName}`
      }
    },
    hi: {
      customer: {
        title: 'सदस्यता सक्रिय',
        message: (data) => `आपकी ${data.planName} सदस्यता अब सक्रिय है`
      },
      admin: {
        title: 'नई सदस्यता',
        message: (data) => `नई सदस्यता बनाई गई: ${data.planName}`
      }
    }
  },

  SUBSCRIPTION_EXPIRING: {
    en: {
      customer: {
        title: 'Subscription Expiring',
        message: (data) => `Your ${data.planName} subscription expires in ${data.daysLeft} days`
      }
    },
    hi: {
      customer: {
        title: 'सदस्यता समाप्त हो रही है',
        message: (data) => `आपकी ${data.planName} सदस्यता ${data.daysLeft} दिनों में समाप्त हो जाएगी`
      }
    }
  },

  // Feedback Notifications
  FEEDBACK_REQUEST: {
    en: {
      customer: {
        title: 'How was your service?',
        message: (data) => `Please rate your ${data.serviceName} service and help us improve`
      }
    },
    hi: {
      customer: {
        title: 'आपकी सेवा कैसी रही?',
        message: (data) => `कृपया अपनी ${data.serviceName} सेवा को रेट करें और हमें बेहतर बनाने में मदद करें`
      }
    }
  },

  POSITIVE_FEEDBACK: {
    en: {
      maid: {
        title: 'Great Job!',
        message: (data) => `You received a ${data.rating}-star rating! Keep up the excellent work!`
      }
    },
    hi: {
      maid: {
        title: 'बढ़िया काम!',
        message: (data) => `आपको ${data.rating}-स्टार रेटिंग मिली! उत्कृष्ट काम जारी रखें!`
      }
    }
  },

  // System Notifications
  SYSTEM_MAINTENANCE: {
    en: {
      all: {
        title: 'System Maintenance',
        message: (data) => `Scheduled maintenance: ${data.startTime} - ${data.endTime}. ${data.description}`
      }
    },
    hi: {
      all: {
        title: 'सिस्टम रखरखाव',
        message: (data) => `निर्धारित रखरखाव: ${data.startTime} - ${data.endTime}। ${data.description}`
      }
    }
  },

  EMERGENCY_ALERT: {
    en: {
      all: {
        title: 'Emergency Alert',
        message: (data) => data.message
      }
    },
    hi: {
      all: {
        title: 'आपातकालीन चेतावनी',
        message: (data) => data.message
      }
    }
  }
};

/**
 * Get notification template
 * @param {string} type - Notification type
 * @param {string} role - User role (customer, maid, admin, all)
 * @param {string} language - Language code (en, hi)
 * @param {object} data - Data to populate template
 * @returns {object} - Notification with title and message
 */
function getNotificationTemplate(type, role, language = 'en', data = {}) {
  try {
    const template = notificationTemplates[type];
    
    if (!template) {
      console.warn(`Template not found for type: ${type}`);
      return {
        title: 'Notification',
        message: 'You have a new notification'
      };
    }

    const langTemplate = template[language] || template['en'];
    const roleTemplate = langTemplate[role] || langTemplate['all'] || langTemplate['customer'];

    if (!roleTemplate) {
      console.warn(`Role template not found for type: ${type}, role: ${role}`);
      return {
        title: 'Notification',
        message: 'You have a new notification'
      };
    }

    return {
      title: roleTemplate.title,
      message: typeof roleTemplate.message === 'function' 
        ? roleTemplate.message(data) 
        : roleTemplate.message
    };
  } catch (error) {
    console.error('Error getting notification template:', error);
    return {
      title: 'Notification',
      message: 'You have a new notification'
    };
  }
}

module.exports = {
  notificationTemplates,
  getNotificationTemplate
};
