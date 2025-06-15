const puppeteer = require('puppeteer-core'); // Use puppeteer-core for serverless
module.exports = async (req, res) => {
    let browser;
    try {
        // const chromium = await import('@sparticuz/chromium');
        const importedChromiumModule = await import('@sparticuz/chromium');
        // This line checks if the 'default' export exists and uses it, otherwise uses the module directly.
        const actualChromiumExports = importedChromiumModule.default || importedChromiumModule;
        browser = await puppeteer.launch({
            args: [...actualChromiumExports.args, '--hide-scrollbars', '--disable-web-security', '--disable-features=site-per-process'],
            defaultViewport: actualChromiumExports.defaultViewport,
            executablePath: await actualChromiumExports.executablePath(),
            headless: actualChromiumExports.headless,
            ignoreHTTPSErrors: true,
        });

        const page = await browser.newPage();

        await page.goto("https://quran-mushaf-reader.vercel.app", { waitUntil: 'domcontentloaded' });

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