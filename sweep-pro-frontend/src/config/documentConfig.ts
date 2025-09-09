export interface RequiredDocument {
  type: string;
  displayName: string;
  description: string;
  required: boolean;
  acceptedFormats: string[];
  maxSizeInMB: number;
}

export const REQUIRED_DOCUMENTS: RequiredDocument[] = [
  {
    type: 'AADHAR_CARD',
    displayName: 'Aadhar Card',
    description: 'Government issued identity proof (front and back)',
    required: true,
    acceptedFormats: ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'],
    maxSizeInMB: 5
  },
  {
    type: 'POLICE_VERIFICATION',
    displayName: 'Police Verification Certificate',
    description: 'Police clearance certificate for background verification',
    required: true,
    acceptedFormats: ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'],
    maxSizeInMB: 5
  },
  {
    type: 'PHOTO',
    displayName: 'Profile Photo',
    description: 'Recent passport-size photograph',
    required: true,
    acceptedFormats: ['image/jpeg', 'image/jpg', 'image/png'],
    maxSizeInMB: 2
  }
];

export const getRequiredDocumentByType = (type: string): RequiredDocument | undefined => {
  return REQUIRED_DOCUMENTS.find(doc => doc.type === type);
};

export const getAllRequiredDocumentTypes = (): string[] => {
  return REQUIRED_DOCUMENTS.filter(doc => doc.required).map(doc => doc.type);
};
