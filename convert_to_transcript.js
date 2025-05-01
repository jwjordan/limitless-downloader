#!/usr/bin/env node

/**
 * Limitless Lifelog Transcript Generator
 * Converts JSON lifelog files into readable TXT transcript files
 */

// Import dependencies
const fs = require('fs-extra');
const path = require('path');
const moment = require('moment');

// Configuration
const LIFELOGS_DIR = path.join(__dirname, 'lifelogs');
const TRANSCRIPTS_DIR = path.join(__dirname, 'transcripts');

// Ensure transcripts directory exists
try {
  fs.ensureDirSync(TRANSCRIPTS_DIR);
  console.log(`Ensuring transcripts directory exists at: ${TRANSCRIPTS_DIR}`);
} catch (error) {
  console.error(`Failed to create transcripts directory: ${error.message}`);
  process.exit(1);
}

/**
 * Generate a human-readable timestamp from ISO format
 */
function formatTimestamp(isoTimestamp) {
  return moment(isoTimestamp).format('MM/DD/YYYY, h:mm:ss A');
}

/**
 * Convert a JSON lifelog to a human-readable transcript
 */
function convertToTranscript(jsonData) {
  const transcript = [];
  
  // Add title/header if available
  if (jsonData.contents && jsonData.contents[0] && jsonData.contents[0].type === 'heading1') {
    transcript.push('# ' + jsonData.contents[0].content);
    transcript.push('');
  }
  
  // Add metadata if available
  if (jsonData.id) {
    transcript.push(`Conversation ID: ${jsonData.id}`);
  }
  if (jsonData.startTime) {
    transcript.push(`Date: ${formatTimestamp(jsonData.startTime)}`);
  }
  if (jsonData.transcribedItems?.length > 0) {
    // Handle transcript data from transcribedItems if available
    transcript.push('\n## TRANSCRIPT\n');
    
    jsonData.transcribedItems.forEach(item => {
      if (item.text) {
        const speakerName = item.speakerName || 'Unknown';
        transcript.push(`${speakerName}: ${item.text}`);
      }
    });
  } else if (jsonData.contents?.length > 0) {
    // Process the contents array which contains the conversation
    transcript.push('\n## TRANSCRIPT\n');
    
    let currentSection = '';
    
    jsonData.contents.forEach(item => {
      if (item.type === 'heading2') {
        // Add section headers to organize the transcript
        currentSection = item.content;
        transcript.push(`\n### ${currentSection}\n`);
      } else if (item.type === 'blockquote' && item.content) {
        // Add the actual conversation with speaker name
        const speakerName = item.speakerName || 'Unknown';
        transcript.push(`${speakerName} (${formatTimestamp(item.startTime)}): ${item.content}`);
      }
    });
  }
  
  return transcript.join('\n');
}

/**
 * Process a single JSON file and convert it to a TXT transcript
 */
async function processFile(jsonFilePath) {
  try {
    const jsonData = await fs.readJson(jsonFilePath);
    const transcript = convertToTranscript(jsonData);
    
    // Create a corresponding TXT filename
    const jsonFileName = path.basename(jsonFilePath);
    const txtFileName = jsonFileName.replace('.json', '.txt');
    const txtFilePath = path.join(TRANSCRIPTS_DIR, txtFileName);
    
    // Write the transcript to a TXT file
    await fs.writeFile(txtFilePath, transcript);
    console.log(`Created transcript: ${txtFilePath}`);
    
    return true;
  } catch (error) {
    console.error(`Error processing file ${jsonFilePath}: ${error.message}`);
    return false;
  }
}

/**
 * Process all JSON files that don't have corresponding TXT files
 */
async function processAllFiles() {
  try {
    // Get a list of all JSON files in the lifelogs directory
    const files = await fs.readdir(LIFELOGS_DIR);
    const jsonFiles = files.filter(file => file.endsWith('.json'));
    
    // Get a list of existing TXT files in the transcripts directory
    const existingTxtFiles = await fs.readdir(TRANSCRIPTS_DIR);
    
    // Track statistics
    let processed = 0;
    let skipped = 0;
    let failed = 0;
    
    // Process each JSON file that doesn't have a corresponding TXT file
    for (const jsonFile of jsonFiles) {
      const txtFile = jsonFile.replace('.json', '.txt');
      
      if (existingTxtFiles.includes(txtFile)) {
        // Skip if transcript already exists
        console.log(`Skipping ${jsonFile} - transcript already exists`);
        skipped++;
        continue;
      }
      
      const jsonFilePath = path.join(LIFELOGS_DIR, jsonFile);
      const success = await processFile(jsonFilePath);
      
      if (success) {
        processed++;
      } else {
        failed++;
      }
    }
    
    console.log(`\nConversion complete:`);
    console.log(`- ${processed} files processed`);
    console.log(`- ${skipped} files skipped (transcript already exists)`);
    console.log(`- ${failed} files failed to process`);
    
  } catch (error) {
    console.error(`Error processing files: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Main function
 */
async function main() {
  console.log('Limitless Lifelog Transcript Generator');
  
  // Check if a specific file was provided as a command-line argument
  const specificFile = process.argv[2];
  
  if (specificFile) {
    // Process only the specified file
    let filePath = specificFile;
    
    // If the path is not absolute, assume it's relative to the lifelogs directory
    if (!path.isAbsolute(filePath)) {
      // Check if it's just a filename or includes the lifelogs directory
      if (!filePath.includes('lifelogs/')) {
        filePath = path.join(LIFELOGS_DIR, filePath);
      }
    }
    
    // Ensure the file has a .json extension
    if (!filePath.endsWith('.json')) {
      filePath += '.json';
    }
    
    // Check if the file exists
    if (!fs.existsSync(filePath)) {
      console.error(`Error: File not found: ${filePath}`);
      process.exit(1);
    }
    
    console.log(`Processing single file: ${filePath}`);
    await processFile(filePath);
  } else {
    // Process all files
    console.log('Processing all JSON files without existing transcripts...');
    await processAllFiles();
  }
}

// Execute main function
main().catch(error => {
  console.error(`Unhandled error: ${error.message}`);
  process.exit(1);
}); 