/**
 * Site Protection Utilities for Flowerpil Production
 * 
 * Handles site-wide password protection via NGINX basic auth
 * Provides utilities for managing protection state and creating/removing .htpasswd files
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const HTPASSWD_PATH = '/etc/nginx/.htpasswd';
const DEFAULT_USERNAME = 'flowerpil';

/**
 * Check if site protection is currently enabled
 * @returns {boolean} True if .htpasswd file exists
 */
export function isSiteProtectionEnabled() {
  try {
    return fs.existsSync(HTPASSWD_PATH);
  } catch (error) {
    console.error('Error checking site protection status:', error);
    return false;
  }
}

/**
 * Enable site protection by creating .htpasswd file
 * @param {string} password - Password for site access
 * @param {string} username - Username (default: 'flowerpil')
 * @returns {boolean} Success status
 */
export function enableSiteProtection(password = 'FlowerpilTest2025', username = DEFAULT_USERNAME) {
  try {
    // Create .htpasswd file with htpasswd command
    const command = `sudo htpasswd -cb ${HTPASSWD_PATH} ${username} "${password}"`;
    execSync(command, { stdio: 'pipe' });
    
    // Set proper permissions
    execSync(`sudo chmod 644 ${HTPASSWD_PATH}`, { stdio: 'pipe' });
    
    console.log(`✅ Site protection enabled for user: ${username}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to enable site protection:', error.message);
    return false;
  }
}

/**
 * Disable site protection by removing .htpasswd file
 * @returns {boolean} Success status
 */
export function disableSiteProtection() {
  try {
    if (fs.existsSync(HTPASSWD_PATH)) {
      execSync(`sudo rm ${HTPASSWD_PATH}`, { stdio: 'pipe' });
      console.log('✅ Site protection disabled');
    } else {
      console.log('ℹ️ Site protection was already disabled');
    }
    return true;
  } catch (error) {
    console.error('❌ Failed to disable site protection:', error.message);
    return false;
  }
}

/**
 * Get current site protection status and user info
 * @returns {object} Status information
 */
export function getSiteProtectionStatus() {
  const enabled = isSiteProtectionEnabled();
  let users = [];
  
  if (enabled) {
    try {
      const htpasswdContent = fs.readFileSync(HTPASSWD_PATH, 'utf8');
      users = htpasswdContent.split('\n')
        .filter(line => line.trim())
        .map(line => line.split(':')[0]);
    } catch (error) {
      console.error('Error reading .htpasswd file:', error);
    }
  }
  
  return {
    enabled,
    users,
    htpasswdPath: HTPASSWD_PATH,
    method: 'nginx_basic_auth'
  };
}

/**
 * Reload NGINX configuration after changes
 * @returns {boolean} Success status
 */
export function reloadNginxConfig() {
  try {
    // Test configuration first
    execSync('sudo nginx -t', { stdio: 'pipe' });
    
    // Reload if test passes
    execSync('sudo systemctl reload nginx', { stdio: 'pipe' });
    
    console.log('✅ NGINX configuration reloaded');
    return true;
  } catch (error) {
    console.error('❌ Failed to reload NGINX:', error.message);
    return false;
  }
}

/**
 * Quick toggle site protection with default settings
 * @param {boolean} enable - True to enable, false to disable
 * @param {string} password - Password if enabling
 * @returns {boolean} Success status
 */
export function toggleSiteProtection(enable, password = 'FlowerpilTest2025') {
  const result = enable 
    ? enableSiteProtection(password)
    : disableSiteProtection();
  
  if (result) {
    // NGINX picks up changes automatically, but reload for immediate effect
    setTimeout(() => reloadNginxConfig(), 1000);
  }
  
  return result;
}