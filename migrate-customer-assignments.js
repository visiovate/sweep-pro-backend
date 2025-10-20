const { execSync } = require('child_process');

console.log('🔄 Running Prisma database migration for CustomerMaidAssignment...');

try {
  // Generate Prisma client with new schema
  console.log('📦 Generating Prisma client...');
  execSync('npx prisma generate', { stdio: 'inherit' });
  
  // Push schema changes to database
  console.log('🗄️ Pushing schema changes to database...');
  execSync('npx prisma db push', { stdio: 'inherit' });
  
  console.log('✅ Migration completed successfully!');
  console.log('🚀 You can now use the customer assignment API endpoints.');
  
} catch (error) {
  console.error('❌ Migration failed:', error.message);
  console.log('💡 Try running these commands manually:');
  console.log('   npx prisma generate');
  console.log('   npx prisma db push');
}
