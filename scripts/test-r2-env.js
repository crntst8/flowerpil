// Test script to verify R2 environment variables are loaded
console.log('Testing R2 Environment Variables:');
console.log('=====================================');
console.log('R2_ACCOUNT_ID:', process.env.R2_ACCOUNT_ID ? '✓ SET' : '✗ NOT SET');
console.log('R2_ACCESS_KEY_ID:', process.env.R2_ACCESS_KEY_ID ? '✓ SET' : '✗ NOT SET');
console.log('R2_SECRET_ACCESS_KEY:', process.env.R2_SECRET_ACCESS_KEY ? '✓ SET (hidden)' : '✗ NOT SET');
console.log('R2_BUCKET_NAME:', process.env.R2_BUCKET_NAME || '✗ NOT SET');
console.log('R2_PUBLIC_URL:', process.env.R2_PUBLIC_URL || '✗ NOT SET');
console.log('=====================================');

// Test R2 client initialization
try {
  const { S3Client } = await import('@aws-sdk/client-s3');

  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    console.log('❌ FAIL: Missing required R2 environment variables');
    process.exit(1);
  }

  const r2Client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });

  console.log('✓ R2 client initialized successfully');
  console.log('✓ ALL TESTS PASSED');
  process.exit(0);

} catch (error) {
  console.log('❌ FAIL: Error initializing R2 client:', error.message);
  process.exit(1);
}
