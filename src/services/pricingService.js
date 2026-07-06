const { getPrismaClient } = require('../utils/database');

const VALID_BILLING_CYCLES = ['1month', '3month', '6month'];

class PricingService {
  /**
   * Calculate exact subscription tier price from authoritative backend data.
   *
   * @param {Object} params - Pricing lookup parameters
   * @param {string} params.planId - The ID of the ServicePlan (e.g., 'sweepro-touch-plan')
   * @param {string} params.propertyType - Property type (e.g., 'apartment')
   * @param {string} params.bhkType - BHK configuration (e.g., '2bhk', '3bhk', '4bhk')
   * @param {number|string} params.squareFeet - Exact square footage (e.g., 1100, 1300)
   * @param {string} params.billingCycle - Billing cycle ('1month', '3month', '6month')
   * @returns {Promise<{ amount: number, currency: string, pricingRecord: Object }>}
   */
  async calculatePrice({ planId, propertyType, bhkType, squareFeet, billingCycle }) {
    if (!planId || !propertyType || !bhkType || squareFeet === undefined || !billingCycle) {
      throw new Error('Missing required calculation parameters: planId, propertyType, bhkType, squareFeet, and billingCycle are required.');
    }

    // 3. Validate that billingCycle exists
    const normalizedCycle = String(billingCycle).trim();
    if (!VALID_BILLING_CYCLES.includes(normalizedCycle)) {
      throw new Error(`Invalid billing cycle: "${billingCycle}". Valid billing cycles are: ${VALID_BILLING_CYCLES.join(', ')}.`);
    }

    const sqftInt = parseInt(squareFeet, 10);
    if (isNaN(sqftInt)) {
      throw new Error(`Invalid squareFeet parameter: "${squareFeet}" must be a valid integer.`);
    }

    const prisma = getPrismaClient();

    // 1. Query PropertyPricing using planId, propertyType, bhkType, squareFeet
    const pricingRecord = await prisma.propertyPricing.findUnique({
      where: {
        planId_propertyType_bhkType_squareFeet: {
          planId: String(planId).trim(),
          propertyType: String(propertyType).trim(),
          bhkType: String(bhkType).trim(),
          squareFeet: sqftInt,
        }
      }
    });

    // 4. Throw a descriptive error if PropertyPricing is missing
    if (!pricingRecord || !pricingRecord.isActive) {
      throw new Error(
        `PropertyPricing record not found or inactive for planId="${planId}", propertyType="${propertyType}", bhkType="${bhkType}", squareFeet=${sqftInt}.`
      );
    }

    // 2. Read the amount from pricing[billingCycle]
    const pricingMap = pricingRecord.pricing;
    if (!pricingMap || typeof pricingMap !== 'object' || !(normalizedCycle in pricingMap)) {
      throw new Error(
        `Price for billing cycle "${normalizedCycle}" is not configured in PropertyPricing record (id: ${pricingRecord.id}).`
      );
    }

    const amount = Number(pricingMap[normalizedCycle]);
    if (isNaN(amount) || amount <= 0) {
      throw new Error(
        `Invalid price amount "${pricingMap[normalizedCycle]}" configured for billing cycle "${normalizedCycle}" in PropertyPricing record (id: ${pricingRecord.id}).`
      );
    }

    return {
      amount,
      currency: 'INR',
      pricingRecord
    };
  }
}

const pricingService = new PricingService();

module.exports = {
  PricingService,
  pricingService,
  calculatePrice: pricingService.calculatePrice.bind(pricingService),
  VALID_BILLING_CYCLES
};
