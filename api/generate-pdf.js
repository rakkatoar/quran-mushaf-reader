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

         const htmlContent = req.body && req.body.html ? req.body.html : '<h1>Error: No HTML content provided in request body.</h1>';

        // Set content directly - much faster as no external network request within the function
        await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });

        // *** Generate PDF directly from the page ***
        const pdfBuffer = await page.pdf({
            format: 'A4', // Or whatever format you need
            printBackground: true, // Important for background colors/images
            margin: {
                top: '20mm',
                right: '20mm',
                bottom: '20mm',
                left: '20mm'
            },
            // Add more options for multi-page if needed (see Puppeteer docs)
            // e.g., printBackground: true, scale: 1, preferCSSPageSize: true
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="generated_mushaf.pdf"');
        res.send(pdfBuffer);

    } catch (error) {
        console.error('Error generating PDF:', error);
        res.status(500).send('Failed to generate PDF on Vercel: ' + error.message);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
};