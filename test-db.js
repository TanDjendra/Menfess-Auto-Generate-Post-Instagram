const { db } = require('./src/config/firebase');

async function testConnection() {
  console.log('====================================================');
  console.log('       FIREBASE DATABASE CONNECTION TEST            ');
  console.log('====================================================');
  
  try {
    const testRef = db.ref('/menfess_queue_test');
    
    console.log('1. Attempting to write test node to Firebase...');
    await testRef.set({
      connectionTest: true,
      timestamp: Date.now(),
      message: "Hello from test-db.js"
    });
    console.log('✓ Successfully wrote to path: /menfess_queue_test');
    
    console.log('2. Attempting to read test node from Firebase...');
    const snapshot = await testRef.once('value');
    console.log('✓ Successfully read data:', snapshot.val());
    
    console.log('3. Cleaning up test node...');
    await testRef.remove();
    console.log('✓ Cleaned up successfully.');
    
    console.log('\n====================================================');
    console.log('✓ FIREBASE CONNECTION IS ACTIVE AND FULLY WORKING!');
    console.log('====================================================');
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Firebase connection test failed!');
    console.error('Error detail:', error.message);
    console.log('\nPlease check:');
    console.log('1. Is your FIREBASE_DATABASE_URL correct in .env?');
    console.log('2. Does FIREBASE_CREDENTIALS point to the correct JSON key file?');
    console.log('3. Are your Firebase Realtime Database Rules set up to allow read/write?');
    console.log('====================================================');
    process.exit(1);
  }
}

testConnection();
