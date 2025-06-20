const mammoth = require('mammoth');
const fs = require('fs'); // For async file operations
const cheerio = require('cheerio'); // For parsing HTML
const path = require('path');
const { parse } = require('csv-parse');
const AdmZip = require('adm-zip');

const isDebugging = true;

const style = 'ibn-dhakwan'; // hafs / hisham / ibn-dhakwan / qpc-nastaleeq / hafs-digital-khatt / hisham-digital-khatt / ibn-dhakwan-digital-khatt
async function csvFileToJson(filePath, delimiter = ',') {
    return new Promise((resolve, reject) => {
        const records = [];
        const parser = parse({
            delimiter: delimiter,
            columns: true, // Automatically uses the first row as column names
            skip_empty_lines: true,
            trim: true     // Trim whitespace from values
        });

        fs.createReadStream(filePath) // Create a readable stream from the file
            .pipe(parser)             // Pipe the file stream to the parser
            .on('data', (record) => {
                // Each 'data' event emits one parsed row as an object
                records.push(record);
            })
            .on('end', () => {
                // 'end' event means all data has been parsed
                resolve(records);
            })
            .on('error', (err) => {
                // Handle any errors during parsing or file reading
                console.error('Error parsing CSV:', err.message);
                reject(err);
            });
    });
}
const csvFilePath = path.join(__dirname, 'quran-styles/'+style, 'pages.csv');
async function runConversion() {
    try {
        const jsonOutput = await csvFileToJson(csvFilePath);
        console.log("JSON Output from File (using csv-parse):");
        groupByPage(jsonOutput)
    } catch (error) {
        console.error("Failed to convert CSV:", error);
    } finally {
        // Clean up the dummy file
        // fs.unlinkSync(csvFilePath);
        console.log(`\nCleaned up ${csvFilePath}`);
    }
}

runConversion();

function groupByPage(jsonFile){
    const groupedByPage = jsonFile.reduce((acc, item) => {
        const pageNumber = item.page_number;
        if (!acc[pageNumber]) {
        acc[pageNumber] = [];
        }
        acc[pageNumber].push(item);
        return acc;
    }, {});
    console.log('Group by pages.');
    const zipFilePath = path.join(__dirname, 'quran-styles/'+style, `pages.zip`);
    const outputDir = path.join(__dirname, 'quran-styles/'+style);

    // Check if any .docx file exists in the outputDir
    const docxFiles = fs.readdirSync(outputDir).filter(file => file.endsWith('.docx'));
    const docAlreadyExists = docxFiles.length > 0;
    if(docAlreadyExists){
        mappingData(groupedByPage);
    } else {
        extractDocxFromZip(zipFilePath, outputDir, groupedByPage);
    }
}

function extractDocxFromZip(zipFilePath, outputDir, groupedByPage) {
    return new Promise((resolve, reject) => {
        try {
            const zip = new AdmZip(zipFilePath);
            const zipEntries = zip.getEntries();
            
            let outputPaths = [];
            zipEntries.forEach(entry => {
                const outputPath = path.join(outputDir, entry.entryName);
                fs.writeFileSync(outputPath, entry.getData());
                outputPaths.push(outputPath);
            });

            if(zipEntries.length === outputPaths.length){
                fs.unlink(zipFilePath, (err) => {
                    if (err) {
                        console.error(`Failed to delete ${zipFilePath}:`, err);
                        reject(err);
                    } else {
                        console.log(`Deleted ${zipFilePath}`);
                        mappingData(groupedByPage);
                        resolve(outputPaths);
                    }
                });
            }
        } catch (err) {
            reject(err);
        }
    });
}

function mappingData(groupedByPage) {
    // Usage
    const totalPages = 604;
    let quranPagesData = {};
    const promises = []; // Array to hold all the promises

    for (let i = 1; i <= totalPages; i++) {
        // if (i === 552) { // Removed the conditional
            const docxFilePath = path.join(__dirname, 'quran-styles/'+style, `${i}.docx`);
            const promise = docxToJson(docxFilePath)
                .then(jsonResult => {
                    const generatedHtml = generateQuranHTML(jsonResult.page, groupedByPage[i]);
                    quranPagesData[i] = {
                        html_content: generatedHtml.content,
                        notes_content: generatedHtml.notes
                    };
                })
                .catch(err => 
                {
                    if(!isDebugging){
                        return console.error("Failed to convert:", err)
                    }
                }
                );
            promises.push(promise); // Add the promise to the array
        // }
    }

    Promise.all(promises) // Wait for all promises to resolve
        .then(() => {
            const outputJsonPath = path.join(__dirname, 'public/quran-pages', `data_${style}.json`);
            const finalData = {
                pages: quranPagesData,
            };
            fs.writeFileSync(outputJsonPath, JSON.stringify(finalData, null, 2), 'utf8');
            console.log(`Processed HTML data (page-by-page) saved to: ${outputJsonPath}`);
        });
}

async function docxToJson(filePath) {
    try {
        const result = await mammoth.convertToHtml({ path: filePath }, {
            transformDocument: j => {
                j.children.forEach(k => {
                    k.children.forEach(l => {
                        if (l.type === "run" && l.children) {
                            l.children.forEach(m => {
                                if(l.highlight && m.value && m.value.trim() && /[\w\d\u0600-\u06FF]/.test(m.value)){
                                    m.value = `~${l.highlight}~[${m.value}]`;
                                }
                            });
                        }
                    });
                });
                
                return j;
            },
        });
        const html = result.value;
        
        // Use Cheerio to parse the HTML structure
        const $ = cheerio.load(html);
        
        const content = [];
        $('body > *').each((i, element) => {
            const tagName = $(element).prop('tagName').toLowerCase();
            if (tagName === 'p') {
                content.push({
                    type: 'paragraph',
                    text: $(element).text().trim()
                });
            } else if (tagName.match(/^h[1-6]$/)) {
                content.push({
                    type: 'heading',
                    level: parseInt(tagName.replace('h', '')),
                    text: $(element).text().trim()
                });
            }
        });

        return {
            page: content
        };

    } catch (error) {
        if(!isDebugging){
            console.error("Error converting DOCX:", error);
        }
        throw error;
    }
}

function generateQuranHTML(textLines, lineMetadata) {
  let contentHtmlOutput = '';
  let textLineIndex = 0; // To keep track of which textLine we're on
  let testNumber = 1;
  let notesHtmlOutput = '';
  
  for (let i = 0; i < lineMetadata.length; i++) {
    const metadata = lineMetadata[i];
    const isCenteredClass = metadata.is_centered === '1' ? 'text-center flex justify-center' : 'flex justify-between';

    if (metadata.line_type === 'surah_name') {
        const surahNumber = metadata.surah_number;
        const paddedSurahNumber = String(surahNumber).padStart(3, '0');
        contentHtmlOutput += `
            <div class='surah-name'>
                <div class='quran-icon surah-header ${isCenteredClass}'>header</div>
                <div class='surah-icon ${isCenteredClass}'>
                    <span class='surah-name-v4 me-2'>surah${paddedSurahNumber}</span>
                    <span class='surah-name-v4'>surah-icon</span>
                </div>
            </div>`;
    } else if (metadata.line_type === 'ayah') {
      if (textLineIndex < textLines.length) {
        const lineText = textLines[textLineIndex].text;
        const lineId = `line-${metadata.page_number}-${metadata.line_number}`; // Example ID
        const firstWordId = metadata.first_word_id;
        const lastWordId = metadata.last_word_id;
        
        const words = lineText.replace(/\[(.*?)\]/g, match => match.replace(/\s+/g, '_'))
                     .split(' ')
                     .map(word => word.replace(/_/g, ' '));
        // const pageToCheck = 564;
        // const lineToCheck = 8;
        
        // if(metadata.page_number == pageToCheck && metadata.line_number == lineToCheck){
        //     console.log('words', words);
        // }
        
        const wordsWrapped = words.map(word => {
            if (word.match(/[\u0660-\u0669]+/)) {
                testNumber = testNumber+1;
                return `<span class="arabic-num-marker">${word}</span>`;
            } else if (word.includes('[') && word.includes('~')) {
                const highlightMatches = [...word.matchAll(/~(.*?)~\[(.*?)\]/g)];
                if (highlightMatches.length > 0) {
                    // If there are multiple matches, wrap each highlighted part
                    let highlightedWord = word;
                    
                    highlightMatches.forEach(match => {
                        const highlightColor = match[1];
                        const highlightText = match[2];
                        const replacement = `<span class="text" style="color: ${highlightColor};">${highlightText}</span>`;
                        highlightedWord = highlightedWord.replace(match[0], replacement);
                    });
                    // After replacing all, wrap the result in the outer span
                    
                    return `<span class="word ayah-${testNumber}">${highlightedWord}</span>`;
                }
            } else if (word.trim() !== '') {
                return `<span class="word ayah-${testNumber}"><span class="text">${word}</span></span>`;
            } else {
                return word;
            }
        }).join('');

        contentHtmlOutput += `
                <p class='quran-line ${isCenteredClass}'
                        data-pag='${metadata.page_number}'
                        data-line='${metadata.line_number}'
                        data-first-word-id='${firstWordId}'
                        data-last-word-id='${lastWordId}'
                        id='${lineId}'>
            ${wordsWrapped}
                </p>`;
        textLineIndex++;
      } else {
        // Handle cases where metadata has no corresponding text (shouldn't happen if data is perfectly aligned)
        console.warn(`Warning: No text found for metadata line ${metadata.line_number}`);
      }
    } else if (metadata.line_type === 'basmallah'){
        contentHtmlOutput += `<div class='bismillah ${isCenteredClass}'> ﷽</div>`;
    }
  }
  
  if(textLines.length > textLineIndex){
      for (let i = textLineIndex; i < textLines.length; i++) {
        
        if(!textLines[i].text.toLowerCase().includes('note')){
            if (textLines[i].text.includes('[') && textLines[i].text.includes('~')) {
                const highlightMatches = [...textLines[i].text.matchAll(/~(.*?)~\[(.*?)\]/g)];
                if (highlightMatches.length > 0) {
                    highlightMatches.forEach(match => {
                        const highlightColor = match[1];
                        const highlightText = match[2];
                        notesHtmlOutput += `<li class='notes' style="color: ${highlightColor};">${highlightText}</li>`;
                    });
                }
            } else {
                notesHtmlOutput += `<li class='notes'>${textLines[i].text}</li>`;
            }
        }
      }
  }
return { content: contentHtmlOutput, notes: notesHtmlOutput };
}