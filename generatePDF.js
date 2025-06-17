const puppeteer = require('puppeteer');
const PDFMerger = require('pdf-merger-js').default;
const fs = require('fs');

const style = 'ibn-dhakwan-digital-khatt'; // hafs / hisham / ibn-dhakwan / qpc-nastaleeq / hafs-digital-khatt / hisham-digital-khatt / ibn-dhakwan-digital-khatt

generatePDF();
async function generatePDF() {
    try {
        const response = await fetch(`http://127.0.0.1:5500/public/quran-pages/data_${style}.json`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        const pageKeys = Object.keys(data.pages);
        if(pageKeys.length !== 0){
            let browser;
            try {
                browser = await puppeteer.launch({
                    defaultViewport: { width: 1200, height: 1600 },
                    headless: true, // Use 'new' for new headless mode, 'false' for visible browser, 'true' for old headless
                    args: ['--no-sandbox', '--disable-setuid-sandbox'] // Recommended for production environments
                });
                const page = await browser.newPage();
                await page.setViewport({ width: 1200, height: 1600 });
                const fs = require('fs');
                const PDFDocument = require('pdfkit');
                
                for (const key of pageKeys) {
                    const doc = new PDFDocument({ autoFirstPage: false });
                    const dir = `./pdf/${style}`;
        
                    if (!fs.existsSync(dir)){
                        fs.mkdirSync(dir, { recursive: true });
                    }
        
                    doc.pipe(fs.createWriteStream(`${dir}/page-${key}.pdf`));
                    await page.goto(`http://127.0.0.1:5500/public/index.html?style=${style}&page=${key}`, { waitUntil: 'networkidle0' });
        
                    
                    // Select the specific element by its ID
                    const element = await page.$('#mushaf-display');
        
                    if (!element) {
                        console.error('Content div not found on the page.');
                        continue; // Skip to the next iteration
                    }
        
                    console.log('Generating PDF for page:', key);
                    
        
                    // Take a screenshot of the element
                    const imageBuffer = await element.screenshot({ type: 'png' });
        
                    // Add a page with A4 size and insert the image
                    const { width, height } = await element.boundingBox();
                    // Convert px to points (1 px = 0.75 pt)
                    const pageWidth = width * 0.75;
                    const pageHeight = height * 0.75;
                    doc.addPage({ size: [pageWidth, pageHeight] });
                    doc.image(imageBuffer, 0, 0, { width: pageWidth, height: pageHeight });
                    doc.end();
                }
            } catch (error) {
                console.error('Error generating PDF:', error);
            } finally {
                if (browser) {
                    await browser.close();
                }
                // Merge all generated PDFs into a single PDF
                const merger = new PDFMerger();
                const dir = `./pdf/${style}`;
                const pdfFiles = fs.readdirSync(dir)
                    .filter(file => file.endsWith('.pdf') && file.startsWith('page-'))
                    .sort((a, b) => {
                        // Extract page numbers and sort numerically
                        const numA = parseInt(a.match(/page-(\d+)\.pdf/)[1], 10);
                        const numB = parseInt(b.match(/page-(\d+)\.pdf/)[1], 10);
                        
                        return numA - numB;
                    });

                for (const file of pdfFiles) {
                    merger.add(`${dir}/${file}`);
                }
                
                await merger.save(`${dir}/all-pages.pdf`);
                console.log(`Merged PDF saved as ${dir}/all-pages.pdf`);
            }
        }
    } catch (error) {
        console.error("Could not fetch page length from JSON:", error);
    }
}