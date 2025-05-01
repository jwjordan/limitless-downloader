# Limitless Lifelog Downloader

A Node.js script to download Limitless Lifelog transcripts via the API.

## Features

- Automatically downloads transcripts from the Limitless API
- Stores each lifelog as a separate JSON file
- Maintains a state file to track the last downloaded log
- Handles API pagination
- Can be run manually or as a scheduled job (cron)
- Detailed logging with automatic log rotation
- Converts JSON files to human-readable text transcripts

## Setup

### Prerequisites

- Node.js (v14 or later)
- npm

### Installation

1. Clone or download this repository
2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file in the project root:

```
# Limitless API Key (required)
LIMITLESS_API_KEY="YOUR_API_KEY_HERE"

# Optional timezone setting (defaults to UTC if not set)
# Examples: "America/New_York", "Europe/London", "Asia/Tokyo"
# TIMEZONE="UTC"
```

4. Make sure the scripts are executable (for Unix/Linux/Mac):

```bash
chmod +x index.js
chmod +x convert_to_transcript.js
```

## Usage

### Downloading Lifelogs

To run the download script manually:

```bash
node index.js
```

Or using the npm script:

```bash
npm start
```

### Converting to Text Transcripts

The project includes a script to convert the JSON lifelog files into more readable text transcripts. This script:

- Creates a `transcripts` directory where text files will be stored
- Generates well-formatted transcripts from the JSON data
- Skips files that already have a corresponding text transcript
- Can process a single file or all files

#### Convert All Files

To convert all JSON files in the `lifelogs` directory that don't already have a corresponding text file:

```bash
node convert_to_transcript.js
```

Or using the npm script:

```bash
npm run convert
```

#### Convert a Single File

To convert a specific JSON file:

```bash
node convert_to_transcript.js 2025_05_01_12_18_53Z_miavwS4SQR1B4LjbodO9.json
```

You can provide either:
- Full path: `/path/to/file.json`
- Path relative to the project: `lifelogs/file.json`
- Just the filename: `file.json` (the script will look in the lifelogs directory)

### Automatic Log Rotation

The script includes automatic log rotation to prevent the log file from growing too large:

- The log file size is checked at the start of each run
- If the log file exceeds 1MB (1,048,576 bytes), it's truncated to 900KB (921,600 bytes)
- During truncation, the script preserves the most recent log entries
- No manual maintenance of log files is required

### Automation (Cron)

To set up automatic periodic downloads, you can create a cron job. Here's an example crontab entry that runs the script every hour:

```crontab
# Run the Limitless lifelog fetcher every hour
0 * * * * cd /path/to/limitless-downloader && node index.js && node convert_to_transcript.js
```

Note: On a Mac, cron may require that you provide the full path to `node`, which you can determine with `which node`

Make sure to replace `/path/to/limitless-downloader` with the absolute path to your script's directory.

## How It Works

### Download Script Logic

1. The script first checks the log file size and truncates it if necessary.
2. It loads configuration from the `.env` file and sets up logging.
3. It checks for a state file (`.last_fetch_timestamp`) to determine if this is the first run.
4. If the state file exists, it performs an incremental fetch, downloading only logs newer than the last timestamp.
5. If it's the first run, it fetches logs day by day starting from a predefined date.
6. For each lifelog received from the API:
   - It constructs a filename using the lifelog's timestamp and ID.
   - It checks if a file with this name already exists (to avoid duplicates).
   - If the file doesn't exist, it saves the lifelog data to a new file.
7. After successful downloads, it updates the state file with the timestamp of the latest log (plus a small buffer).

### Transcript Converter Logic

1. The script reads JSON files from the `lifelogs` directory.
2. For each file, it extracts key information:
   - Conversation title and metadata
   - Speaker names and timestamps
   - The actual conversation content
3. It formats this data into a readable text transcript, organizing content by sections.
4. The transcript is saved as a text file in the `transcripts` directory with the same base filename.

### Folder Structure

- `index.js`: Main download script
- `convert_to_transcript.js`: Transcript converter script
- `.env`: Configuration file (create this yourself with your API key)
- `.last_fetch_timestamp`: State file (created automatically after first run)
- `fetch_lifelogs.log`: Log file (automatically rotated when it exceeds 1MB)
- `lifelogs/`: Directory where downloaded logs are stored
- `transcripts/`: Directory where text transcripts are stored
- `README.md`: Documentation
- `package.json`: Node.js dependencies

## Error Handling

The scripts handle various errors:
- Missing API key
- Network issues
- Invalid API responses
- File system errors
- Invalid/corrupt JSON files

All errors are logged to the console and to the log files.

## Notes

This project was refactored from a shell script to Node.js to leverage more powerful libraries and improve maintainability. 