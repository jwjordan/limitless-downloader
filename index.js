#!/usr/bin/env node

/**
 * Limitless Lifelog Downloader
 * Node.js script to download Limitless Lifelog transcripts via the API
 */

// Import dependencies
require('dotenv').config();
const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const moment = require('moment-timezone');
const winston = require('winston');

// Configuration
const LIFELOGS_DIR = path.join(__dirname, 'lifelogs');
const STATE_FILE = path.join(__dirname, '.last_fetch_timestamp');
const API_BASE_URL = 'https://api.limitless.ai/v1/lifelogs';
const LIMIT = 10; // Max allowed by API for pagination
const FIRST_RUN_START_DATE = '2025-03-10'; // First date with available data
const TIMEZONE = process.env.TIMEZONE || 'UTC'; // Default timezone, can be overridden in .env

// Set up logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.File({ filename: path.join(__dirname, 'fetch_lifelogs.log') }),
    new winston.transports.Console()
  ]
});

// Helper functions
const formatTimestampForFilename = (timestamp) => {
  return timestamp
    .replace(/[:-]/g, '_')
    .replace(/\.[0-9]*[-+][0-9:]*/g, 'Z')
    .replace('T', '_');
};

const addBufferToTimestamp = (timestamp) => {
  // Add a 1-second buffer to avoid race conditions
  const date = new Date(timestamp);
  date.setSeconds(date.getSeconds() + 1);
  return date.toISOString();
};

// API functions
const callLimitlessApi = async (url, description) => {
  logger.info(`Requesting ${description}: ${url.split('&cursor=')[0]}`); // Log URL without sensitive cursor
  
  try {
    const response = await axios.get(url, {
      headers: {
        'X-API-Key': process.env.LIMITLESS_API_KEY
      },
      timeout: 60000 // 60 seconds timeout
    });
    
    return response.data;
  } catch (error) {
    const errorMessage = error.response?.data?.error || error.response?.data?.message || error.message;
    logger.error(`API request for '${description}' failed: ${errorMessage}`);
    throw new Error(`API request failed: ${errorMessage}`);
  }
};

const processLifelogs = async (data, pageDesc) => {
  let newLogsDownloaded = false;
  let latestProcessedTimestamp = null;
  
  const lifelogs = data.data?.lifelogs || [];
  const nextCursor = data.meta?.lifelogs?.nextCursor || '';
  const count = data.meta?.lifelogs?.count || 0;
  
  if (count === 0) {
    logger.info(`(${pageDesc}) No lifelogs found for this period.`);
    return { nextCursor, newLogsDownloaded, latestProcessedTimestamp };
  }
  
  logger.info(`(${pageDesc}) Found ${count} lifelogs.`);
  
  for (const lifelog of lifelogs) {
    const lifelog_id = lifelog.id;
    const lifelog_start_time = lifelog.startTime;
    
    if (!lifelog_id || !lifelog_start_time) {
      logger.warn(`(${pageDesc}) Skipping lifelog with missing required fields`);
      continue;
    }
    
    const filename_ts = formatTimestampForFilename(lifelog_start_time);
    const filename = path.join(LIFELOGS_DIR, `${filename_ts}_${lifelog_id}.json`);
    
    // Check if file already exists
    try {
      if (await fs.pathExists(filename)) {
        logger.info(`(${pageDesc}) Skipping existing lifelog: ${filename}`);
        continue;
      }
      
      // Save the lifelog
      await fs.writeJson(filename, lifelog, { spaces: 2 });
      logger.info(`(${pageDesc}) Saved new lifelog: ${filename}`);
      newLogsDownloaded = true;
      
      // Update latest timestamp if necessary
      if (!latestProcessedTimestamp || lifelog_start_time > latestProcessedTimestamp) {
        latestProcessedTimestamp = lifelog_start_time;
      }
    } catch (error) {
      logger.error(`Failed to save lifelog: ${filename} - ${error.message}`);
    }
  }
  
  return { nextCursor, newLogsDownloaded, latestProcessedTimestamp };
};

const performIncrementalFetch = async (lastFetchTimestamp) => {
  logger.info(`State file found. Performing incremental fetch since ${lastFetchTimestamp}`);
  let latestProcessedTimestamp = lastFetchTimestamp;
  let newLogsDownloaded = false;
  let cursor = '';
  let pageCount = 0;
  
  while (true) {
    pageCount++;
    const pageDesc = `Incremental Page ${pageCount}`;
    
    // Format the timestamp for the API
    const startParam = lastFetchTimestamp
      .replace('T', ' ')
      .replace('Z', '')
      .replace(/\.[0-9]*$/, '');
    
    // Construct the API URL
    let apiUrl = `${API_BASE_URL}?limit=${LIMIT}&direction=asc&start=${encodeURIComponent(startParam)}`;
    if (cursor) {
      apiUrl += `&cursor=${encodeURIComponent(cursor)}`;
    }
    
    try {
      // Call the API
      const data = await callLimitlessApi(apiUrl, pageDesc);
      
      // Process the response
      const result = await processLifelogs(data, pageDesc);
      
      // Update state
      if (result.newLogsDownloaded) {
        newLogsDownloaded = true;
      }
      
      if (result.latestProcessedTimestamp && result.latestProcessedTimestamp > latestProcessedTimestamp) {
        latestProcessedTimestamp = result.latestProcessedTimestamp;
      }
      
      if (!result.nextCursor) {
        logger.info(`(${pageDesc}) No next cursor found. End of incremental results.`);
        break;
      } else {
        logger.info(`(${pageDesc}) Found next cursor.`);
        cursor = result.nextCursor;
      }
    } catch (error) {
      logger.error(`Failed API call during incremental fetch: ${error.message}`);
      throw error; // Re-throw to be caught by the main function
    }
  }
  
  return { newLogsDownloaded, latestProcessedTimestamp };
};

const performFirstRun = async () => {
  logger.info(`State file not found. Performing first run fetch starting from ${FIRST_RUN_START_DATE}`);
  let latestProcessedTimestamp = null;
  let newLogsDownloaded = false;
  
  // Set up date range for the first run
  const today = moment().tz(TIMEZONE);
  let currentDate = moment(FIRST_RUN_START_DATE).tz(TIMEZONE);
  
  logger.info(`Fetching from ${currentDate.format('YYYY-MM-DD')} to ${today.format('YYYY-MM-DD')}`);
  
  while (currentDate.isSameOrBefore(today, 'day')) {
    const dateStr = currentDate.format('YYYY-MM-DD');
    const dayDesc = `First Run Day: ${dateStr}`;
    logger.info(`--- Starting fetch for ${dateStr} ---`);
    
    // Construct the base API URL for this day
    const apiUrlBase = `${API_BASE_URL}?limit=${LIMIT}&date=${dateStr}&timezone=${encodeURIComponent(TIMEZONE)}`;
    
    let cursor = '';
    let pageCount = 0;
    let dayHasData = false;
    
    // Loop for pagination within a day
    while (true) {
      pageCount++;
      const pageDesc = `${dayDesc} Page ${pageCount}`;
      
      let apiUrl = apiUrlBase;
      if (cursor) {
        apiUrl += `&cursor=${encodeURIComponent(cursor)}`;
      }
      
      try {
        // Call the API
        const data = await callLimitlessApi(apiUrl, pageDesc);
        
        // Process the response
        const result = await processLifelogs(data, pageDesc);
        
        // Update state
        if (result.newLogsDownloaded) {
          newLogsDownloaded = true;
          dayHasData = true;
        }
        
        if (result.latestProcessedTimestamp && 
            (!latestProcessedTimestamp || result.latestProcessedTimestamp > latestProcessedTimestamp)) {
          latestProcessedTimestamp = result.latestProcessedTimestamp;
        }
        
        if (!result.nextCursor) {
          if (dayHasData) {
            logger.info(`(${pageDesc}) Completed processing data for ${dateStr}`);
          } else {
            logger.info(`(${pageDesc}) No data found for ${dateStr}`);
          }
          break; // Break inner pagination loop
        } else {
          cursor = result.nextCursor;
        }
      } catch (error) {
        logger.error(`API call failed for ${pageDesc}: ${error.message}`);
        break; // Break inner pagination loop for this day, continue to next day
      }
    }
    
    // Move to the next day
    currentDate.add(1, 'day');
  }
  
  return { newLogsDownloaded, latestProcessedTimestamp };
};

// Main function
const main = async () => {
  logger.info('Script started.');
  
  // Ensure lifelogs directory exists
  try {
    await fs.ensureDir(LIFELOGS_DIR);
    logger.info(`Ensured lifelogs directory exists at: ${LIFELOGS_DIR}`);
  } catch (error) {
    logger.error(`Failed to create lifelogs directory: ${error.message}`);
    throw error;
  }
  
  // Check API Key validity
  if (!process.env.LIMITLESS_API_KEY || process.env.LIMITLESS_API_KEY === 'YOUR_API_KEY_HERE') {
    logger.error('LIMITLESS_API_KEY not set or is placeholder. Please set it in .env file.');
    throw new Error('LIMITLESS_API_KEY not set or is placeholder');
  }
  
  logger.info(`API Key loaded. Using Timezone: ${TIMEZONE}`);
  
  let newLogsDownloaded = false;
  let latestProcessedTimestamp = null;
  
  try {
    // Check for state file to determine run type
    if (await fs.pathExists(STATE_FILE)) {
      const lastFetchTimestamp = (await fs.readFile(STATE_FILE, 'utf8')).trim();
      
      // Perform incremental fetch
      const result = await performIncrementalFetch(lastFetchTimestamp);
      newLogsDownloaded = result.newLogsDownloaded;
      latestProcessedTimestamp = result.latestProcessedTimestamp;
    } else {
      // Perform first run
      const result = await performFirstRun();
      newLogsDownloaded = result.newLogsDownloaded;
      latestProcessedTimestamp = result.latestProcessedTimestamp;
    }
    
    // Update state file if new logs were downloaded
    if (newLogsDownloaded && latestProcessedTimestamp) {
      const timestampWithBuffer = addBufferToTimestamp(latestProcessedTimestamp);
      logger.info(`Updating state file with latest timestamp: ${timestampWithBuffer}`);
      await fs.writeFile(STATE_FILE, timestampWithBuffer);
    } else if (newLogsDownloaded) {
      logger.warn('New logs were downloaded, but latestProcessedTimestamp is empty. State file not updated.');
    } else {
      logger.info('No new logs were downloaded in this run.');
    }
  } catch (error) {
    logger.error(`Script failed: ${error.message}`);
    process.exit(1);
  }
  
  logger.info('Script finished successfully.');
};

// Execute main function
main().catch(error => {
  logger.error(`Unhandled error: ${error.message}`);
  process.exit(1);
}); 