const puppeteer = require('puppeteer-core'); // Use puppeteer-core for serverless
const chromium = require('@sparticuz/chromium'); // For lightweight Chromium executable

module.exports = async (req, res) => {
    let browser;
    try {
        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless, // Use chromium.headless
            ignoreHTTPSErrors: true,
        });

        const page = await browser.newPage();

        await page.goto("https://quran-mushaf-reader.netlify.app?allPages=1", { waitUntil: 'networkidle0' });

        // Select the specific element by its ID
        const element = await page.$('#mushaf-display');

        if (!element) {
            return res.status(404).send('Content div not found on the page.');
        }

        // Take a screenshot of the element
        const imageBuffer = await element.screenshot({ type: 'png' });

        // Create a PDF from the image using PDFKit
        const PDFDocument = require('pdfkit');
        const doc = new PDFDocument({ autoFirstPage: false });
        let buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
            const pdfBuffer = Buffer.concat(buffers);
            res.set({
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'attachment; filename="report_from_url.pdf"',
                'Content-Length': pdfBuffer.length
            });
            res.send(pdfBuffer);
        });

        // Add a page with A4 size and insert the image
        const { width, height } = await element.boundingBox();
        // Convert px to points (1 px = 0.75 pt)
        const pageWidth = width * 0.75;
        const pageHeight = height * 0.75;
        doc.addPage({ size: [pageWidth, pageHeight] });
        doc.image(imageBuffer, 0, 0, { width: pageWidth, height: pageHeight });
        doc.end();

    } catch (error) {
        console.error('Error generating PDF:', error);
        res.status(500).send('Failed to generate PDF on Vercel: ' + error.message);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
};