const fs = require('fs');
const path = require('path');

const seedPath = path.join(__dirname, 'prisma', 'seed.js');
let content = fs.readFileSync(seedPath, 'utf-8');

// Replace booking create blocks to include slot_date and slot_time
content = content.replace(
  /await prisma\.booking\.create\(\{([\s\S]*?)totalAmount: (.*?),\s*discount: (.*?),\s*finalAmount: (.*?)\s*(\}[\s\S]*?}\);)/g,
  (match, rest, totalAmount, discount, finalAmount, closing) => {
    // Extract scheduledAt value
    const scheduledMatch = rest.match(/scheduledAt:\s*([^,]+),/);
    let scheduledAtValue = 'new Date(Date.now() + 1 * 24 * 60 * 60 * 1000)';
    
    if (scheduledMatch) {
      scheduledAtValue = scheduledMatch[1].trim();
    }

    return `await prisma.booking.create({${rest}totalAmount: ${totalAmount},
        discount: ${discount},
        finalAmount: ${finalAmount},
        slot_date: new Date(${scheduledAtValue}).toISOString().split('T')[0],
        slot_time: '09:00:00'${closing}`;
  }
);

fs.writeFileSync(seedPath, content, 'utf-8');
console.log('✅ Fixed seed.js - added slot_date and slot_time to all booking creates');
