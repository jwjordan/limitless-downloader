# Limitless Lifelog Downloader - Development Plan

This document outlines the plan to create an automated script for downloading Limitless Lifelog transcripts via the API.

**Phase 1: Setup & Configuration**

1.  **Create Directory:** Create a directory named `lifelogs` in the current workspace root. This directory will store the downloaded transcript files.
2.  **Create `.env` File:** Create a file named `.env` in the workspace root. This file will securely store the Limitless API key.
    ```dotenv
    # .env
    LIMITLESS_API_KEY="YOUR_API_KEY_HERE"
    
    # Optional timezone setting (defaults to UTC if not set)
    # TIMEZONE="UTC"
    ```
3.  **Dependency Check:** The script will rely on `curl` (usually pre-installed on macOS) and `jq` for processing JSON. The `README` will instruct the user to install `jq` if they don't have it (e.g., using `brew install jq`).

**Phase 2: Script Development (`fetch_lifelogs.zsh`)**

1.  **Initialization:**
    *   Define variables for the `lifelogs` directory path and a state file (`.last_fetch_timestamp`) to track the timestamp of the most recently downloaded lifelog.
    *   Implement basic logging to a file (e.g., `fetch_lifelogs.log`) to record script activity and errors.
2.  **Load Configuration:**
    *   Source the `.env` file to load the `LIMITLESS_API_KEY`.
    *   Check if the API key is loaded; exit with an error if not found.
3.  **State Management:**
    *   Read the ISO 8601 timestamp from the state file (`.last_fetch_timestamp`). If the file doesn't exist or is empty, treat it as the first run (fetch logs starting from a predefined date, using the Limitless API's day-by-day approach).
4.  **API Interaction Logic:**
    *   Implement a loop to handle API pagination (`cursor`).
    *   Construct the API URL: `https://api.limitless.ai/v1/lifelogs`.
    *   For incremental fetches:
        *   Set query parameters: `limit=10`, `direction=asc`, and `start=<last_fetch_timestamp>`.
        *   Format the `start` parameter by replacing 'T' with space, removing 'Z', and trimming any milliseconds.
    *   For first-run fetches:
        *   Loop through days from a predefined start date (configured as `FIRST_RUN_START_DATE="2023-03-12"`) to the current date.
        *   Set query parameters: `limit=10`, `date=<current_date>`, and `timezone=<configured_timezone>`.
    *   Use `curl` with the `X-API-Key` header to fetch data. Include error handling for the `curl` command.
    *   Use `jq` to parse the JSON response. Include error handling for `jq`.
5.  **API Response Structure:**
    *   The API is expected to return a response with the following structure:
        ```json
        {
          "data": {
            "lifelogs": [
              { 
                "id": "lifelog_id",
                "startTime": "ISO8601_timestamp",
                // ... other fields
              }
            ]
          },
          "meta": {
            "lifelogs": {
              "count": 10,
              "nextCursor": "cursor_for_pagination"
            }
          }
        }
        ```
    *   Extract the `lifelogs` array from `data.lifelogs` and pagination cursor from `meta.lifelogs.nextCursor`.
    *   For each lifelog, the `id` and `startTime` fields are required.
6.  **Processing Lifelogs:**
    *   Keep track of the `startTime` of the *latest* log fetched in the current run.
    *   Iterate through the received lifelogs:
        *   Construct a filename using the lifelog's `startTime` and `id` (e.g., `YYYY-MM-DDTHHMMSSZ_<id>.json`) to ensure uniqueness and sortability.
        *   Check if a file with this name already exists in the `lifelogs` directory. If it does, skip to the next log (this handles potential overlaps or reruns).
        *   Save the full JSON data for the individual lifelog to the file in the `lifelogs` directory.
        *   Log the download.
    *   Continue to the next page using the `cursor` if necessary.
7.  **Update State:**
    *   After the loop finishes processing all pages for the current run, if new logs were successfully downloaded, update the `.last_fetch_timestamp` file with the `startTime` of the *latest* log processed during this run. **Important:** Add a small buffer (e.g., 1 second) to the timestamp before saving to avoid potential race conditions or fetching the exact same last log again.

**Phase 3: Node.js Refactor (`index.js`)**

1.  **Project Setup:**
    *   Create `package.json` to manage Node.js dependencies.
    *   Install required npm packages:
        *   `axios` for HTTP requests (replacing `curl`)
        *   `dotenv` for loading environment variables
        *   `fs-extra` for enhanced file system operations
        *   `moment-timezone` for improved date/time handling
        *   `winston` for robust logging
    *   Create `.gitignore` to exclude `node_modules`, `.env`, and other non-versioned files.

2.  **Code Structure:**
    *   Implement the same core logic from the shell script in JavaScript
    *   Utilize modern JavaScript features (async/await, error handling)
    *   Maintain the same behaviors for first run vs. incremental fetch
    *   Use the same file naming conventions and directory structure

3.  **Enhanced Functionality:**
    *   Improved error handling with try/catch blocks
    *   Structured logging with timestamp, level, and consistent formatting
    *   Automatic directory creation if `lifelogs` doesn't exist
    *   Proper timezone handling with moment-timezone
    *   JSON parsing/writing with native JavaScript

4.  **Benefits over Shell Script:**
    *   Cross-platform compatibility
    *   Better error handling and recovery
    *   More robust HTTP requests with retries and timeouts
    *   Dependency management through npm
    *   Improved code readability and maintainability
    *   Better date/time handling

**Phase 4: Documentation (`README.md`)**

1.  **Create `README.md`:** Create a `README.md` file explaining:
    *   The purpose of the script.
    *   **Setup:** How to clone/set up the files, create/populate the `.env` file, and install dependencies with npm.
    *   **How it Works:** Explain the script's logic, including how it fetches data, uses the state file (`.last_fetch_timestamp`) to determine the starting point for new fetches, saves files, handles pagination, and logs activity.
    *   **Manual Execution:** How to run the script directly from the terminal (`node index.js` or `npm start`).
    *   **Automation (Cron):** Explain how to set up the cron job, provide the necessary crontab entry, and emphasize using absolute paths in crontab. Mention checking the log file (`fetch_lifelogs.log`).
    *   **Folder Structure:** Briefly describe the files (`.env`, `index.js`, `.last_fetch_timestamp`, `README.md`, `package.json`) and the `lifelogs/` directory.
    *   **Error Handling:** Mention potential errors (API key missing, network issues) and how they are logged.

**Phase 5: Crontab Entry**

1.  **Provide Crontab Line:** The `README.md` contains the example crontab line. It will look similar to this (user needs to replace `/path/to/` with the actual absolute path to the script's directory):
    ```crontab
    # Run the Limitless lifelog fetcher every hour
    0 * * * * cd /path/to/limitless-lifelog-downloader && node index.js >> fetch_lifelogs.log 2>&1
    ```
    *   `0 * * * *`: Run at the start of every hour.
    *   `cd /path/to/limitless-lifelog-downloader &&`: Change directory to the script's location first to ensure relative paths (like `.env`, `lifelogs/`, `.last_fetch_timestamp`) work correctly.
    *   `node index.js`: Execute the script.
    *   `>> fetch_lifelogs.log 2>&1`: Append standard output and standard error to the log file. 