#!/usr/bin/env node

/**
 * Simple helper to extract text from a PDF using pdf-parse.
 *
 * Usage:
 *   node scripts/extract-pdf-text.js documents/YMCA003.pdf [output.txt]
 *
 * The first argument is the PDF path (relative to repo root or absolute).
 * The optional second argument writes the extracted text to a file; otherwise,
 * the text is printed to stdout.
 */

const fs = require('fs');
const path = require('path');
// pdf-parse v2 ships ESM with a CJS entry; handle both shapes.
const pdfModule = require('pdf-parse');
const pdf = pdfModule.default || pdfModule;

async function main() {
  const inputArg = process.argv[2] || 'documents/YMCA003.pdf';
  const outputArg = process.argv[3];

  const pdfPath = path.resolve(process.cwd(), inputArg);
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF not found at: ${pdfPath}`);
  }

  const buffer = await fs.promises.readFile(pdfPath);
  const { text, info, metadata, numpages } = await pdf(buffer);

  if (outputArg) {
    const outPath = path.resolve(process.cwd(), outputArg);
    await fs.promises.writeFile(outPath, text, 'utf8');
    console.error(
      `Extracted ${numpages ?? 'unknown'} pages (${info?.Title ?? 'untitled'}) -> ${outPath}`
    );
  } else {
    console.log(text);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

