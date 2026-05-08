# PM2 Process Management

## Purpose

Manages Flowerpil Node.js processes on production servers with automatic restarts, environment variable injection, log management, and boot persistence.

## How It Works

PM2 loads process configurations from ecosystem.config.cjs and manages application lifecycle. Processes inherit environment variables from the shell session at PM2 command execution time. The --update-env flag forces PM2 to re-read current environment when restarting processes.

Environment variables are persisted in /etc/environment on production boxes. The shell must source this file before PM2 commands to ensure PM2 inherits the latest values. PM2 saves process list to disk via pm2 save, enabling automatic restart on server reboot when pm2 startup is configured.

Logs are captured per process with automatic rotation. The pm2 logs command tails combined output, pm2 monit provides real-time resource monitoring dashboard.

## API/Interface

### PM2 Commands

**Start all processes:**
```bash
cd /var/www/flowerpil
source /etc/environment
pm2 start ecosystem.config.cjs --env production
```

**Restart single process with environment refresh:**
```bash
cd /var/www/flowerpil
source /etc/environment
pm2 restart ecosystem.config.cjs --only flowerpil-api --env production --update-env
```

**List running processes:**
```bash
pm2 list
```

**View process environment:**
```bash
pm2 env flowerpil-api
pm2 env 0  # By cluster ID
pm2 env flowerpil-api | grep LOGGING
```

**Tail logs:**
```bash
pm2 logs flowerpil-api --lines 200
pm2 logs --lines 50  # All processes
```

**Resource monitoring:**
```bash
pm2 monit
```

**Save process list:**
```bash
pm2 save
```

**Configure startup script:**
```bash
pm2 startup  # Run once per host
```

**Stop processes:**
```bash
pm2 stop flowerpil-api
pm2 stop all
```

**Delete processes:**
```bash
pm2 delete flowerpil-api
pm2 delete all
```

## Database

No direct database interaction. PM2 stores process list and metadata in ~/.pm2 directory.

## Integration Points

### Internal Dependencies

- **ecosystem.config.cjs** - Process definitions at repository root
- **/etc/environment** - System-wide environment variables
- `server/index.js` - Application entry point

### External Dependencies

- **PM2** - Process manager (npm package)
- **Node.js** - JavaScript runtime

### Process Definitions

From ecosystem.config.cjs:

```javascript
module.exports = {
  apps: [
    {
      name: 'flowerpil-api',
      script: 'server/index.js',
      instances: 1,
      exec_mode: 'cluster',
      env_production: {
        NODE_ENV: 'production'
      }
    }
  ]
};
```

## Configuration

### Environment Variables

**LOGGING_SERVER_BASE_URL**
- Base URL for external logging service
- Example: https://fb.fpil.xyz

**LOGGING_SERVICE_KEY**
- Authentication key for logging service

**NODE_ENV**
- Application environment (production, development)

All environment variables must be added to /etc/environment and sourced before PM2 commands.

### Environment File Location

**/etc/environment** - System-wide environment variables

Edit with:
```bash
sudo nano /etc/environment
```

Format:
```
VARIABLE_NAME="value"
LOGGING_SERVER_BASE_URL="https://fb.fpil.xyz"
LOGGING_SERVICE_KEY="secret_key_here"
```

### Startup Configuration

PM2 generates systemd/init script for automatic startup:

```bash
pm2 startup
# Follow displayed instructions (may require sudo)
```

After configuring processes, save state:
```bash
pm2 save
```

## Usage Examples

### Initial Setup

```bash
# Install PM2 globally
npm install -g pm2

# Navigate to application directory
cd /var/www/flowerpil

# Load environment variables
source /etc/environment

# Start processes
pm2 start ecosystem.config.cjs --env production

# Save process list
pm2 save

# Configure startup
pm2 startup
```

### Updating Environment Variables

```bash
# Edit environment file
sudo nano /etc/environment

# Add or modify variables
LOGGING_SERVER_BASE_URL="https://new-url.com"

# Restart processes with new environment
cd /var/www/flowerpil
source /etc/environment
pm2 restart ecosystem.config.cjs --only flowerpil-api --env production --update-env

# Verify environment loaded
pm2 env flowerpil-api | grep LOGGING
```

### Deploying Code Updates

```bash
# Pull latest code
cd /var/www/flowerpil
git pull

# Install dependencies if needed
npm install

# Restart application
source /etc/environment
pm2 restart flowerpil-api
```

### Monitoring Logs

```bash
# Tail logs for specific process
pm2 logs flowerpil-api

# Tail last 200 lines
pm2 logs flowerpil-api --lines 200

# Tail all processes
pm2 logs

# Clear logs
pm2 flush
```

### Resource Monitoring

```bash
# Interactive dashboard
pm2 monit

# Process list with resources
pm2 list

# Detailed process info
pm2 show flowerpil-api
```

### Troubleshooting

**Environment variables not loading:**
```bash
# Ensure sourced before PM2 commands
source /etc/environment
pm2 restart flowerpil-api --update-env

# Verify variables loaded
pm2 env flowerpil-api
```

**Process not starting:**
```bash
# Check logs for errors
pm2 logs flowerpil-api --lines 100

# View detailed process info
pm2 show flowerpil-api

# Check application directory exists
ls -la /var/www/flowerpil
```

**Startup script not working:**
```bash
# Reconfigure startup
pm2 unstartup
pm2 startup

# Save current process list
pm2 save

# Test by rebooting server
sudo reboot
```
