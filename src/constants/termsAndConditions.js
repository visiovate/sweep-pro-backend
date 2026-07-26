const CUSTOMER_TERMS = {
  type: "customer",
  title: "SWEEPRO - CUSTOMER TERMS & CONDITIONS",
  companyName: "SWEEPRO PRIVATE LIMITED",
  registeredOffice: "Hyderabad, Telangana",
  customerSupportEmail: "sweeprocustomerservice@gmail.com",
  effectiveDate: null, // Will be set dynamically when user accepts
  lastUpdated: null, // Will be set dynamically
  sections: [
    {
      id: "1",
      title: "1. Service Overview",
      content: `Sweepro provides professional housekeeping and maid services on a subscription basis (Monthly, 3-Month, and 6-Month plans) for household tasks, including cleaning, mopping, utensils, laundry, and related services.`
    },
    {
      id: "2",
      title: "2. Service Plans",
      content: `Customers may choose from different subscription plans as per their requirements. Plan details, inclusions, and pricing are available on the official Sweepro website or app. Sweepro reserves the right to revise service plans and pricing with prior notice.`
    },
    {
      id: "3",
      title: "3. Payments & Billing",
      content: `All payments must be made in advance before the start of the subscription. Payment modes accepted: UPI, Debit/Credit Cards, Net Banking, and Wallets. There will be no cash payments directly to maids or Sweepro staff. Any advance paid is non-refundable unless service cancellation is initiated by Sweepro.`
    },
    {
      id: "4",
      title: "4. Service Execution",
      content: `Maids will be assigned by Sweepro based on availability and customer requirements. Sweepro ensures proper background verification, ID proof, and training of all staff. The customer must not request additional unpaid services from maids directly. Any direct payment or service deal between the customer and maid is strictly prohibited.`
    },
    {
      id: "5",
      title: "5. Prohibited Interactions Between Customers & Maids",
      content: `Customers are not allowed to negotiate payments, subscription cancellations, or direct hiring of Sweepro maids without informing the company. If any such activity is found, Sweepro reserves the right to terminate the subscription immediately without any refund.`
    },
    {
      id: "6",
      title: "6. Customer Responsibilities",
      content: `Ensure safe and respectful behavior towards Sweepro staff. Provide proper access to the premises and necessary cleaning materials, if required. Report any issues regarding service or staff behavior within 24 hours.`
    },
    {
      id: "7",
      title: "7. Company Responsibilities",
      content: `Sweepro ensures verified and trained staff, timely service delivery, and maintaining customer data confidentiality. Sweepro is not liable for delays caused by unavoidable circumstances like weather, natural disasters, or government restrictions.`
    },
    {
      id: "8",
      title: "8. Cancellation & Refund Policy",
      content: `Customers may request subscription cancellation at least 7 days in advance. Refunds (if applicable) will be processed as per company policy. No refunds will be issued if the customer terminates the service mid-plan.`
    },
    {
      id: "9",
      title: "9. Liability & Damage Policy",
      content: `Sweepro shall not be liable for accidental damages caused during service. Loss of valuables is not Sweepro's responsibility unless proven theft occurs under Sweepro management (not by maids). In case of proven theft under Sweepro management, Sweepro will cooperate fully with law enforcement.`
    },
    {
      id: "10",
      title: "10. Privacy & Data Protection",
      content: `Customer data, including contact details and addresses, will be kept confidential. Sweepro will never sell, rent, or misuse customer data.`
    },
    {
      id: "11",
      title: "11. Prohibited Activities",
      content: `Misbehavior, harassment, abuse, or threats towards Sweepro staff will lead to immediate termination of services without refund. Any attempt to hire Sweepro maids privately will attract a penalty of ₹50,000.`
    },
    {
      id: "12",
      title: "12. Dispute Resolution",
      content: `In case of disputes, customers must first approach Sweepro customer support. If unresolved, disputes will be handled under the Arbitration and Conciliation Act, 1996. Jurisdiction: Hyderabad, Telangana.`
    },
    {
      id: "13",
      title: "13. Amendments",
      content: `Sweepro reserves the right to modify, add, or remove any terms at any time. Customers will be notified via email or SMS before implementation.`
    },
    {
      id: "14",
      title: "14. Contact Information",
      content: `For queries, complaints, or feedback, contact us at sweeprocustomerservice@gmail.com, Hyderabad, Telangana.`
    }
  ]
};

const WORKER_TERMS = {
  type: "worker",
  title: "HOME CARE PARTNERS TERMS AND CONDITIONS",
  companyName: "SWEEPRO",
  registeredOffice: "Hyderabad, Telangana",
  effectiveDate: null, // Will be set dynamically when user accepts
  lastUpdated: null, // Will be set dynamically
  sections: [
    {
      id: "1",
      title: "1. Nature of Engagement",
      content: `The Worker is engaged as an independent service partner, not as a permanent employee of Sweepro at present. Sweepro acts as a service platform and system provider, not a labor contractor or employer. This agreement does not create any employer–employee relationship, partnership, or agency.`
    },
    {
      id: "2",
      title: "2. Scope of Services",
      content: `The Worker may be assigned household services including but not limited to: Cleaning, Mopping, Utensils washing, Laundry, Other domestic tasks as per subscription plan. Services must be delivered strictly as per Sweepro's service guidelines and customer subscription scope.`
    },
    {
      id: "3",
      title: "3. Work Allocation & Attendance",
      content: `Work assignments will be allocated by Sweepro based on availability, location, and performance. The Worker must report on time and complete the assigned duties professionally. Repeated late arrivals, absenteeism, or refusal of duties may lead to suspension or termination. In case of leave or emergency, prior intimation to Sweepro is mandatory.`
    },
    {
      id: "4",
      title: "4. Identity & Background Verification",
      content: `The Worker must provide valid: Government ID proof, Address proof, Police verification (if required). False documents or misrepresentation will lead to immediate removal and blacklisting.`
    },
    {
      id: "5",
      title: "5. Prohibition on Direct Engagement with Customers",
      content: `The Worker shall not negotiate directly with customers for: Salary or service charges, Private employment, Additional paid services. Direct hiring or private arrangements with Sweepro customers is strictly prohibited. If found, the Worker will be liable for: Immediate termination, Penalty as per company policy, Legal action if required.`
    },
    {
      id: "6",
      title: "6. Code of Conduct",
      content: `The Worker must: Maintain polite, respectful, and professional behavior, Follow hygiene, dress code, and grooming standards prescribed by Sweepro, Protect customer privacy and confidentiality, Refrain from abusive language, misconduct, or harassment. Misbehavior, theft, dishonesty, or misconduct will result in immediate termination and legal proceedings.`
    },
    {
      id: "7",
      title: "7. Payments & Compensation",
      content: `Payments will be processed only by Sweepro as per agreed payout structure. No cash or digital payments shall be accepted directly from customers. Any direct payment acceptance is strictly prohibited and will lead to immediate termination. Payout cycles and deductions (if any) shall be communicated separately during onboarding.`
    },
    {
      id: "8",
      title: "8. Use of Company Branding & Uniform",
      content: `The Worker shall wear Sweepro-provided uniform / ID while on duty. Company branding, ID cards, and materials remain the property of Sweepro and must be returned upon exit. Misuse of branding is strictly prohibited.`
    },
    {
      id: "9",
      title: "9. Confidentiality & Data Protection",
      content: `Customer information (address, phone number, routines, etc.) must be kept strictly confidential. The Worker shall not share, store, or misuse any customer data. Violation of confidentiality may attract termination and legal liability.`
    },
    {
      id: "10",
      title: "10. Safety & Liability",
      content: `The Worker must follow safety practices while performing duties. Sweepro shall not be responsible for: Injuries caused due to worker negligence, Personal belongings lost by the Worker, Disputes arising from misconduct. Any damage caused intentionally or due to gross negligence may be recovered from the Worker.`
    },
    {
      id: "11",
      title: "11. Performance Monitoring",
      content: `The Worker's performance may be monitored through: Customer feedback, Attendance records, Supervisor reviews. Repeated complaints or poor performance may lead to retraining, suspension, or termination.`
    },
    {
      id: "12",
      title: "12. Termination",
      content: `Sweepro reserves the right to terminate the Worker immediately in cases of: Misconduct or theft, Direct dealing with customers, Repeated absenteeism, Breach of confidentiality, False documentation. The Worker may also exit by giving prior notice as per company policy.`
    },
    {
      id: "13",
      title: "13. Dispute Resolution",
      content: `Any disputes must first be reported to Sweepro management. If unresolved, disputes shall be governed by the Arbitration and Conciliation Act, 1996. Jurisdiction: Hyderabad, Telangana.`
    },
    {
      id: "14",
      title: "14. Amendments",
      content: `Sweepro reserves the right to modify these terms at any time. Updated terms shall be binding upon communication.`
    },
    {
      id: "15",
      title: "15. Declaration",
      content: `I hereby confirm that I have read, understood, and agreed to all the above Terms & Conditions and shall abide by Sweepro's policies and code of conduct. Worker Name: _______________________`
    }
  ]
};

module.exports = {
  CUSTOMER_TERMS,
  WORKER_TERMS
};
