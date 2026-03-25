#!/usr/bin/env node
/**
 * scripts/generate-icons.js
 * Generates icon assets for all platforms from public/logo.png.
 * Usage: node scripts/generate-icons.js
 */

const sharp = require('sharp')
const fs = require('fs')
const path = require('path')

const input = path.join(__dirname, '..', 'public', 'logo.png')
const outDir = path.join(__dirname, '..', 'assets', 'icons')

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true })
}

const sizes = [16, 32, 48, 64, 128, 256, 512]

async function generate() {
  console.log(`[generate-icons] Reading source: ${input}`)

  // Generate all sized PNGs
  for (const size of sizes) {
    const outPath = path.join(outDir, `icon-${size}.png`)
    await sharp(input).resize(size, size).png().toFile(outPath)
    console.log(`  ✓ icon-${size}.png`)
  }

  // 512x512 as the main Linux icon
  const mainIconPath = path.join(outDir, 'icon.png')
  await sharp(input).resize(512, 512).png().toFile(mainIconPath)
  console.log('  ✓ icon.png (512x512, Linux)')

  // Windows .ico (multi-size)
  try {
    const pngToIcoModule = require('png-to-ico')
    const pngToIco = pngToIcoModule.default || pngToIcoModule.imagesToIco || pngToIcoModule
    const icoSizes = [16, 32, 48, 64, 128, 256]
    const icoInputs = icoSizes.map(s => path.join(outDir, `icon-${s}.png`))
    const buf = await pngToIco(icoInputs)
    const icoPath = path.join(outDir, 'icon.ico')
    fs.writeFileSync(icoPath, buf)
    console.log('  ✓ icon.ico (Windows, multi-size)')
  } catch (err) {
    console.warn('  ⚠ Could not generate icon.ico:', err.message)
  }

  console.log(`\n[generate-icons] Done! Icons written to: ${outDir}`)
}

generate().catch(err => {
  console.error('[generate-icons] Error:', err)
  process.exit(1)
})
