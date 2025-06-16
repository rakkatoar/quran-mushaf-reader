const isVercel = process.env.VERCEL === '1';
let actualChromiumExports; // Use puppeteer-core for serverless
module.exports = async (req, res) => {
    let browser;
    try {
        if (isVercel) {
            // On Vercel, use @sparticuz/chromium
            const importedChromiumModule = await import('@sparticuz/chromium');
            actualChromiumExports = importedChromiumModule.default || importedChromiumModule;
        } else {
            // Locally, we don't need @sparticuz/chromium for executablePath etc.
            // Puppeteer itself will manage the browser.
            actualChromiumExports = {
                args: [],
                executablePath: null,
                headless: true,
                defaultViewport: { width: 1200, height: 1600 } // Set larger default viewport, height 1600 is good for A4 portrait
            };
        }

        // Launch options for Puppeteer
        const launchOptions = {
            args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            ...(isVercel ? actualChromiumExports.args : []),
            '--hide-scrollbars',
            '--disable-web-security',
            '--disable-features=site-per-process'
            ],
            headless: isVercel ? actualChromiumExports.headless : true,
            defaultViewport: isVercel ? actualChromiumExports.defaultViewport : { width: 1200, height: 1600 }, // Force large viewport locally
            ignoreHTTPSErrors: true,
            executablePath: isVercel ? await actualChromiumExports.executablePath() : undefined
        };

        browser = await puppeteer.launch(launchOptions);

        const page = await browser.newPage();

        // Optionally, force viewport again (sometimes needed)
        await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 2 });

        await page.goto("http://localhost:3000/?allPages=1", { waitUntil: 'networkidle0' });

        // Optionally, wait for the element to resize/render
        await page.waitForSelector('#mushaf-display');

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
        doc.on('end', async () => {
            const pdfBuffer = Buffer.concat(buffers);

            if (process.env.NODE_ENV === 'development') {
            await fs.writeFile('/tmp/generated_test.pdf', pdfBuffer);
            console.log('PDF saved to /tmp/generated_test.pdf for local inspection.');
            } else {
            console.log('PDF Buffer Start (Hex):', pdfBuffer.toString('hex', 0, 20));
            }
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename="report_from_url.pdf"');
            res.setHeader('Content-Length', pdfBuffer.length);
            res.send(pdfBuffer);
        });

        // Add a page with A4 size and insert the image
        const { width, height } = await element.boundingBox();
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