/**
 * Renders one card per theme (plus one animated GIF) into temp/samples so you
 * can eyeball the design without starting the bot.
 *
 *   npm run samples
 *   npm run samples -- "teks menfess kamu di sini"
 */

const fs = require('fs');
const path = require('path');

require('dotenv').config();

const { THEMES } = require('../src/services/themes');
const { generateMenfessImage, generateMenfessGif } = require('../src/services/imageProcessor');

const OUT_DIR = path.join(process.cwd(), 'temp', 'samples');
const DEFAULT_TEXT =
  'Halo min, titip pesan buat kamu yang selalu duduk di bangku pojok perpustakaan. ' +
  'Semangat ya, kamu keren banget 🌷';

async function run() {
  const text = process.argv.slice(2).join(' ') || DEFAULT_TEXT;
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`Rendering ${THEMES.length} themes into ${OUT_DIR}\n`);

  for (const theme of THEMES) {
    const output = await generateMenfessImage(text, `sample-${theme.name}`, {
      outDir: OUT_DIR,
      theme: theme.name
    });
    console.log(`  ${theme.name.padEnd(18)} ${(fs.statSync(output).size / 1024).toFixed(0)} KB`);
  }

  const gif = await generateMenfessGif(text, 'sample-animated', { outDir: OUT_DIR, enabled: true });
  if (gif) console.log(`\n  animated GIF       ${(fs.statSync(gif).size / 1024).toFixed(0)} KB -> ${gif}`);

  console.log('\nDone.');
}

run().catch(error => {
  console.error('Sample rendering failed:', error);
  process.exitCode = 1;
});
