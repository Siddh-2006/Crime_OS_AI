// @ts-ignore
import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import SVGtoPDF from 'svg-to-pdfkit';

/**
 * Applies a watermark to the CURRENT page of a PDFKit document.
 */
// @ts-ignore
export function applyWatermark(doc: typeof PDFDocument, options?: any) {
  doc.save();

  // Save current x and y positions so the layout isn't affected
  const startX = doc.x;
  const startY = doc.y;

  // Try to find the SVG logo
  let logoPath = path.join(__dirname, '../../../../frontend/public/logo.svg');
  if (!fs.existsSync(logoPath)) {
    logoPath = path.join(process.cwd(), '../frontend/public/logo.svg'); // fallback
  }

  if (fs.existsSync(logoPath)) {
    let svgContent = fs.readFileSync(logoPath, 'utf8');
    
    // Inject opacity to the root SVG tag to make it 30% visible
    if (!svgContent.includes('opacity=')) {
      svgContent = svgContent.replace('<svg ', '<svg opacity="0.30" ');
    } else {
      svgContent = svgContent.replace(/opacity="[^"]*"/, 'opacity="0.30"');
    }

    // Scale logo to 80% of the page
    const boxWidth = doc.page.width * 0.8;
    const boxHeight = doc.page.height * 0.8;
    
    // Exact center
    const imgX = (doc.page.width - boxWidth) / 2;
    const imgY = (doc.page.height - boxHeight) / 2; 
    
    // Render SVG
    SVGtoPDF(doc, svgContent, imgX, imgY, { 
      width: boxWidth, 
      height: boxHeight,
      preserveAspectRatio: 'xMidYMid meet'
    });
  }

  doc.restore();

  // Restore x and y to ensure the main document text starts exactly where it should
  doc.x = startX;
  doc.y = startY;
}

/**
 * Hooks into the pageAdded event to apply the watermark on every new page,
 * and immediately applies it to the first page (which is already created).
 */
// @ts-ignore
export function applyWatermarkAllPages(doc: typeof PDFDocument, options?: any) {
  // Apply to the first page immediately
  applyWatermark(doc);

  // Hook for all subsequent pages
  doc.on('pageAdded', () => {
    applyWatermark(doc);
  });
}
