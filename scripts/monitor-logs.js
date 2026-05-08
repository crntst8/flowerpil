#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_DIR = path.join(__dirname, '..', 'logs');

class LogMonitor {
  constructor() {
    this.watchers = new Map();
    this.filters = new Set();
    this.running = false;
  }

  start(logFiles = [], filterKeywords = []) {
    console.log('🚀 Starting log monitor...');
    console.log(`📂 Log directory: ${LOG_DIR}`);
    
    this.filters = new Set(filterKeywords.map(k => k.toLowerCase()));
    this.running = true;

    // Default to all log files if none specified
    const filesToWatch = logFiles.length > 0 ? logFiles : [
      'api.log',
      'curator.log', 
      'database.log',
      'error.log',
      'debug.log'
    ];

    filesToWatch.forEach(filename => {
      this.watchLogFile(filename);
    });

    console.log(`👀 Watching ${filesToWatch.length} log files...`);
    if (this.filters.size > 0) {
      console.log(`🔍 Filtering for: ${Array.from(this.filters).join(', ')}`);
    }
    console.log('📺 Live logs will appear below:\n');
  }

  watchLogFile(filename) {
    const filepath = path.join(LOG_DIR, filename);
    
    // Create file if it doesn't exist
    if (!fs.existsSync(filepath)) {
      console.log(`📝 Creating log file: ${filename}`);
      fs.writeFileSync(filepath, '');
    }

    // Track file position to only show new content
    let position = fs.statSync(filepath).size;

    const watcher = fs.watchFile(filepath, { interval: 100 }, (curr, prev) => {
      if (curr.size > position) {
        // Read only new content
        const stream = fs.createReadStream(filepath, { 
          start: position, 
          end: curr.size - 1 
        });
        
        let buffer = '';
        stream.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop(); // Keep incomplete line in buffer
          
          lines.forEach(line => {
            if (line.trim()) {
              this.processLogLine(filename, line);
            }
          });
        });
        
        position = curr.size;
      }
    });

    this.watchers.set(filename, watcher);
  }

  processLogLine(filename, line) {
    try {
      const logEntry = JSON.parse(line);
      
      // Apply filters
      if (this.filters.size > 0) {
        const searchText = `${logEntry.component} ${logEntry.message} ${JSON.stringify(logEntry.data || {})}`.toLowerCase();
        const hasMatch = Array.from(this.filters).some(filter => searchText.includes(filter));
        if (!hasMatch) return;
      }

      this.displayLogEntry(filename, logEntry);
    } catch (error) {
      // Handle non-JSON log lines
      if (this.filters.size === 0 || Array.from(this.filters).some(filter => line.toLowerCase().includes(filter))) {
        console.log(`[${filename}] ${line}`);
      }
    }
  }

  displayLogEntry(filename, entry) {
    const colors = {
      ERROR: '\x1b[31m',   // Red
      WARN: '\x1b[33m',    // Yellow  
      INFO: '\x1b[36m',    // Cyan
      DEBUG: '\x1b[90m',   // Gray
      SUCCESS: '\x1b[32m'  // Green
    };
    const reset = '\x1b[0m';
    const bold = '\x1b[1m';
    
    const color = colors[entry.level] || '';
    const timestamp = new Date(entry.timestamp).toLocaleTimeString();
    
    let output = `${color}${bold}[${entry.level}]${reset} `;
    output += `${color}${timestamp}${reset} `;
    output += `${bold}${filename}${reset} `;
    output += `${entry.component}: ${entry.message}`;
    
    if (entry.data && Object.keys(entry.data).length > 0) {
      output += `\n  📊 ${JSON.stringify(entry.data, null, 2).split('\n').join('\n  ')}`;
    }
    
    console.log(output + '\n');
  }

  stop() {
    console.log('\n🛑 Stopping log monitor...');
    this.running = false;
    
    this.watchers.forEach((watcher, filename) => {
      fs.unwatchFile(path.join(LOG_DIR, filename));
      console.log(`❌ Stopped watching ${filename}`);
    });
    
    this.watchers.clear();
    console.log('✅ Log monitor stopped');
  }
}

// CLI interface
const args = process.argv.slice(2);
const monitor = new LogMonitor();

// Parse command line arguments
let logFiles = [];
let filters = [];
let showHelp = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  
  if (arg === '--help' || arg === '-h') {
    showHelp = true;
  } else if (arg === '--files' || arg === '-f') {
    // Next arguments until next flag are file names
    i++;
    while (i < args.length && !args[i].startsWith('--')) {
      logFiles.push(args[i]);
      i++;
    }
    i--; // Back up one since loop will increment
  } else if (arg === '--filter' || arg === '--grep') {
    // Next arguments until next flag are filters
    i++;
    while (i < args.length && !args[i].startsWith('--')) {
      filters.push(args[i]);
      i++;
    }
    i--; // Back up one since loop will increment
  }
}

if (showHelp) {
  console.log(`
📺 Flowerpil Log Monitor

Usage: node scripts/monitor-logs.js [options]

Options:
  --files, -f <files...>     Specific log files to watch (default: all)
  --filter, --grep <terms>   Filter logs containing these terms
  --help, -h                 Show this help

Examples:
  node scripts/monitor-logs.js
  node scripts/monitor-logs.js --files curator.log api.log
  node scripts/monitor-logs.js --filter curator colby
  node scripts/monitor-logs.js --files curator.log --filter FETCH_BY_NAME

Available log files:
  - api.log       (API requests/responses)
  - curator.log   (Curator operations)
  - database.log  (Database queries)
  - error.log     (All errors)
  - debug.log     (Debug information)
`);
  process.exit(0);
} 

// Handle graceful shutdown
process.on('SIGINT', () => {
  monitor.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  monitor.stop();
  process.exit(0);
});

// Start monitoring
monitor.start(logFiles, filters);