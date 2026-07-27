/**
 * Integration smoke test: renders cards, checks the caption generator and the
 * Instagram credentials without posting anything.
 *
 *   npm test              -> render + caption + credential check
 *   npm test -- --upload  -> also test the public image upload step
 */

const fs = require('fs');
const path = require('path');

require('dotenv').config();

const WANT_UPLOAD = process.argv.includes('--upload');
const OUT_DIR = path.join(process.cwd(), 'temp', 'test-output');

const SAMPLES = [
  {
    id: 'love',
    text: 'Halo min, aku suka banget sama anak kelas sebelah yang sering nongkrong di kantin. Dia tinggi, pakai kacamata, dan senyumnya manis banget 🥺 tapi aku malu buat kenalan. Ada yang tau IG-nya?'
  },
  { id: 'short', text: 'AKHIRNYA LULUS SIDANG!!! 🎉' },
  { id: 'study', text: 'Semangat ya buat yang lagi nugas malem ini! Jangan lupa tidur, kesehatan kalian tuh mahal.' },
  {
    id: 'long',
    text: 'Kenapa ya rasanya capek banget belakangan ini. Pengen nangis tapi ga tau harus cerita ke siapa. Ada yang pernah ngerasain hal yang sama? Kayaknya semua orang lebih maju dan aku jalan di tempat aja. Padahal aku udah usaha sebisaku, tapi tetep ngerasa kurang terus.'
  }
];

function heading(title) {
  console.log(`\n--- ${title} ---`);
}

async function testRenderer() {
  heading('1. Kawaii card renderer (PNG)');
  const { generateMenfessImage } = require('./src/services/imageProcessor');

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const paths = [];
  for (const sample of SAMPLES) {
    const started = Date.now();
    const result = await generateMenfessImage(sample.text, `test_${sample.id}`, { outDir: OUT_DIR });
    const kb = (fs.statSync(result).size / 1024).toFixed(0);
    console.log(`  ok ${sample.id.padEnd(6)} ${kb.padStart(4)} KB  ${Date.now() - started}ms`);
    paths.push(result);
  }
  return paths;
}

async function testGif() {
  heading('2. Animated GIF renderer');
  const { generateMenfessGif } = require('./src/services/imageProcessor');

  const started = Date.now();
  const gifPath = await generateMenfessGif(SAMPLES[0].text, 'test_gif', { outDir: OUT_DIR, enabled: true });
  if (!gifPath) {
    console.log('  ! GIF generation is disabled (GIF_ENABLED=false).');
    return null;
  }

  const buffer = fs.readFileSync(gifPath);
  const header = buffer.slice(0, 6).toString('ascii');
  const width = buffer.readUInt16LE(6);
  const loops = buffer.includes(Buffer.from('NETSCAPE2.0'));

  console.log(`  ok ${header} ${width}x${buffer.readUInt16LE(8)}, loop=${loops}, ` +
    `${(buffer.length / 1024).toFixed(0)} KB, ${Date.now() - started}ms`);

  if (header !== 'GIF89a') throw new Error('Generated file is not a valid GIF89a');
  return gifPath;
}

async function testCaption() {
  heading('3. Gemini caption generator');
  const { generateCaption, MODEL_CHAIN } = require('./src/services/geminiService');
  const { detectMood } = require('./src/services/themes');

  console.log(`  model chain: ${MODEL_CHAIN.join(' -> ')}`);
  const sample = SAMPLES[2];
  const { mood } = detectMood(sample.text);
  const caption = await generateCaption(sample.text, mood);

  console.log(`  mood: ${mood}`);
  console.log('  ------------------------------------------------');
  console.log(caption.split('\n').map(line => `  ${line}`).join('\n'));
  console.log('  ------------------------------------------------');
}

async function testInstagram() {
  heading('4. Instagram credentials');
  const { isConfigured, verifyCredentials } = require('./src/services/instagramService');

  if (!isConfigured()) {
    console.log('  ! IG_USER_ID / IG_ACCESS_TOKEN missing or placeholder - bot will run in render-only mode.');
    return;
  }

  const result = await verifyCredentials();
  if (result.ok) console.log(`  ok connected as @${result.username}`);
  else console.log(`  x credential check failed: ${result.error}`);
}

async function testUpload(localPath) {
  heading('5. Public image hosting');
  const { uploadImageToPublicUrl } = require('./src/services/instagramService');

  if (!WANT_UPLOAD) {
    console.log('  - skipped (run "npm test -- --upload" to include it)');
    return;
  }
  if (!localPath || !fs.existsSync(localPath)) {
    console.log('  ! skipped: no local image available');
    return;
  }

  try {
    console.log(`  ok ${await uploadImageToPublicUrl(localPath)}`);
  } catch (error) {
    console.log(`  x upload failed: ${error.message}`);
  }
}

async function run() {
  console.log('================================================================');
  console.log('           AUTO-MENFESS MODULE INTEGRATION RUNNER');
  console.log('================================================================');

  try {
    const images = await testRenderer();
    await testGif();
    await testCaption();
    await testInstagram();
    await testUpload(images[0]);

    console.log('\n================================================================');
    console.log('All module tests finished.');
    console.log(`Preview the rendered cards in: ${OUT_DIR}`);
    console.log('Start the bot with: npm start');
    console.log('================================================================');
  } catch (error) {
    console.error('\nx Integration run aborted:', error.message);
    process.exitCode = 1;
  }
}

run();
