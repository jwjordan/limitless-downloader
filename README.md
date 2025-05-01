# Limitless Lifelog Downloader

A Node.js script to download Limitless Lifelog transcripts via the API.

## Features

- Automatically downloads transcripts from the Limitless API
- Stores each lifelog as a separate JSON file
- Maintains a state file to track the last downloaded log
- Handles API pagination
- Can be run manually or as a scheduled job (cron)
- Detailed logging

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

4. Make sure the script is executable (for Unix/Linux/Mac):

```bash
chmod +x index.js
```

## Usage

### Manual Execution

To run the script manually:

```bash
node index.js
```

Or using the npm script:

```bash
npm start
```

### Automation (Cron)

To set up automatic periodic downloads, you can create a cron job. Here's an example crontab entry that runs the script every hour:

```crontab
# Run the Limitless lifelog fetcher every hour
0 * * * * cd /path/to/limitless-lifelog-downloader && node index.js >> fetch_lifelogs.log 2>&1
```

Make sure to replace `/path/to/limitless-lifelog-downloader` with the absolute path to your script's directory.

## How It Works

### Script Logic

1. The script first loads configuration from the `.env` file and sets up logging.
2. It checks for a state file (`.last_fetch_timestamp`) to determine if this is the first run.
3. If the state file exists, it performs an incremental fetch, downloading only logs newer than the last timestamp.
4. If it's the first run, it fetches logs day by day starting from a predefined date.
5. For each lifelog received from the API:
   - It constructs a filename using the lifelog's timestamp and ID.
   - It checks if a file with this name already exists (to avoid duplicates).
   - If the file doesn't exist, it saves the lifelog data to a new file.
6. After successful downloads, it updates the state file with the timestamp of the latest log (plus a small buffer).

### Folder Structure

- `index.js`: Main script
- `.env`: Configuration file (create this yourself with your API key)
- `.last_fetch_timestamp`: State file (created automatically after first run)
- `fetch_lifelogs.log`: Log file
- `lifelogs/`: Directory where downloaded logs are stored
- `README.md`: Documentation
- `package.json`: Node.js dependencies

## Error Handling

The script handles various errors:
- Missing API key
- Network issues
- Invalid API responses
- File system errors

All errors are logged to the console and to the `fetch_lifelogs.log` file.

## Notes

This script was refactored from a shell script to Node.js to leverage more powerful libraries and improve maintainability. 