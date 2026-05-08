#!/usr/bin/env node

/**
 * PM2 Log Analyzer
 *
 * Analyzes PM2 logs and provides human-readable insights about system health,
 * errors, performance issues, and recommendations.
 */

import { execSync } from 'child_process';
import chalk from 'chalk';

// ANSI color codes for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bold: '\x1b[1m'
};

// Fallback if chalk not available
const c = {
  red: (str) => `${colors.red}${str}${colors.reset}`,
  green: (str) => `${colors.green}${str}${colors.reset}`,
  yellow: (str) => `${colors.yellow}${str}${colors.reset}`,
  blue: (str) => `${colors.blue}${str}${colors.reset}`,
  cyan: (str) => `${colors.cyan}${str}${colors.reset}`,
  magenta: (str) => `${colors.magenta}${str}${colors.reset}`,
  gray: (str) => `${colors.gray}${str}${colors.reset}`,
  bold: (str) => `${colors.bold}${str}${colors.reset}`,
};

function section(title) {
  console.log('\n' + c.bold(c.cyan('═'.repeat(80))));
  console.log(c.bold(c.cyan(`  ${title}`)));
  console.log(c.bold(c.cyan('═'.repeat(80))));
}

function subsection(title) {
  console.log('\n' + c.bold(c.blue(`  ${title}`)));
  console.log(c.gray('  ' + '─'.repeat(78)));
}

function critical(msg) {
  console.log('  ' + c.red('✖ CRITICAL: ') + msg);
}

function warning(msg) {
  console.log('  ' + c.yellow('⚠ WARNING: ') + msg);
}

function success(msg) {
  console.log('  ' + c.green('✓ ') + msg);
}

function info(msg) {
  console.log('  ' + c.blue('ℹ ') + msg);
}

function getProcessList() {
  try {
    const output = execSync('pm2 jlist', { encoding: 'utf-8' });
    return JSON.parse(output);
  } catch (err) {
    console.error('Failed to get PM2 process list:', err.message);
    return [];
  }
}

function getLogs(processName, lines = 100) {
  try {
    const output = execSync(`pm2 logs ${processName} --lines ${lines} --nostream --raw`, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });
    return output.split('\n').filter(Boolean);
  } catch (err) {
    return [];
  }
}

function analyzeProcessHealth(processes) {
  subsection('Process Health Status');

  const issues = [];

  for (const proc of processes) {
    const name = proc.name;
    const status = proc.pm2_env.status;
    const restarts = proc.pm2_env.restart_time;
    const uptime = proc.pm2_env.pm_uptime;
    const memory = proc.monit.memory;
    const cpu = proc.monit.cpu;

    const uptimeMin = uptime ? Math.floor((Date.now() - uptime) / 1000 / 60) : 0;
    const memoryMB = Math.round(memory / 1024 / 1024);

    // Status indicator
    let statusColor = status === 'online' ? c.green : c.red;
    let statusIcon = status === 'online' ? '●' : '○';

    console.log(`  ${statusColor(statusIcon)} ${c.bold(name)}`);
    console.log(`     Status: ${statusColor(status)}  |  Uptime: ${uptimeMin}m  |  Restarts: ${restarts}  |  Memory: ${memoryMB}MB  |  CPU: ${cpu}%`);

    // Check for issues
    if (status !== 'online') {
      issues.push({ process: name, severity: 'critical', issue: 'Process is offline' });
      critical(`${name} is not running`);
    }

    // High restart count
    if (restarts > 50) {
      issues.push({ process: name, severity: 'critical', issue: `High restart count (${restarts})` });
      critical(`${name} has restarted ${restarts} times - possible crash loop or memory leak`);
    } else if (restarts > 20) {
      issues.push({ process: name, severity: 'warning', issue: `Elevated restart count (${restarts})` });
      warning(`${name} has restarted ${restarts} times - monitor for stability`);
    }

    // Low uptime with high restarts
    if (uptimeMin < 5 && restarts > 10) {
      issues.push({ process: name, severity: 'critical', issue: 'Rapid restart cycle' });
      critical(`${name} is in a rapid restart cycle (uptime: ${uptimeMin}m, restarts: ${restarts})`);
    }
  }

  return issues;
}

function analyzeMemoryLeaks(processes) {
  subsection('Memory Leak Detection');

  const leaks = [];

  for (const proc of processes) {
    const name = proc.name;
    const restarts = proc.pm2_env.restart_time;
    const uptime = proc.pm2_env.pm_uptime;
    const memory = proc.monit.memory;
    const maxMemoryRestart = proc.pm2_env.max_memory_restart;

    const uptimeMin = uptime ? Math.floor((Date.now() - uptime) / 1000 / 60) : 0;
    const memoryMB = Math.round(memory / 1024 / 1024);
    const maxMemoryMB = maxMemoryRestart ? Math.round(maxMemoryRestart / 1024 / 1024) : null;

    // Check for memory-related restarts
    if (restarts > 50 && uptimeMin < 30 && maxMemoryMB) {
      const memoryUsagePercent = Math.round((memoryMB / maxMemoryMB) * 100);

      leaks.push({ process: name, severity: 'critical', memoryMB, maxMemoryMB, restarts, uptimeMin });

      critical(`${name} - MEMORY LEAK DETECTED`);
      console.log(`     ${c.red('├─')} Current memory: ${memoryMB}MB / ${maxMemoryMB}MB (${memoryUsagePercent}%)`);
      console.log(`     ${c.red('├─')} Restarts: ${restarts} times`);
      console.log(`     ${c.red('├─')} Uptime: ${uptimeMin} minutes`);
      console.log(`     ${c.red('└─')} Restart frequency: ~${Math.round(uptimeMin / Math.max(1, restarts))} minutes`);
    }
  }

  if (leaks.length === 0) {
    success('No memory leaks detected');
  }

  return leaks;
}

function analyzeErrors(processes) {
  subsection('Error Analysis (Last 100 Lines)');

  const errorPatterns = {
    unhandledRejection: /unhandledRejection/i,
    moduleNotFound: /Cannot find (module|package) ['"]([^'"]+)['"]/i,
    apiConnection: /Failed to connect to API/i,
    tokenExpired: /Token (expired|invalidated)/i,
    databaseError: /database|sqlite/i,
    apiError: /(API.*failed|API.*error)/i,
    timeout: /timeout|ETIMEDOUT/i,
    networkError: /ECONNREFUSED|ENOTFOUND|ENETUNREACH/i
  };

  const errorCounts = {};
  const criticalErrors = [];

  for (const proc of processes) {
    const name = proc.name;
    const logs = getLogs(name, 200);
    const errors = { unhandledRejection: [], moduleNotFound: [], apiConnection: [], tokenExpired: [], other: [] };

    for (const line of logs) {
      if (errorPatterns.unhandledRejection.test(line)) {
        errors.unhandledRejection.push(line);
      }
      if (errorPatterns.moduleNotFound.test(line)) {
        const match = line.match(errorPatterns.moduleNotFound);
        if (match && match[2]) {
          errors.moduleNotFound.push(match[2]);
        }
      }
      if (errorPatterns.apiConnection.test(line)) {
        errors.apiConnection.push(line);
      }
      if (errorPatterns.tokenExpired.test(line)) {
        errors.tokenExpired.push(line);
      }
    }

    // Report findings
    if (errors.unhandledRejection.length > 0) {
      critical(`${name} - ${errors.unhandledRejection.length} unhandled rejections found`);
      criticalErrors.push({ process: name, type: 'unhandledRejection', count: errors.unhandledRejection.length });
    }

    if (errors.moduleNotFound.length > 0) {
      const uniqueModules = [...new Set(errors.moduleNotFound)];
      critical(`${name} - Missing dependencies: ${uniqueModules.join(', ')}`);
      criticalErrors.push({ process: name, type: 'moduleNotFound', modules: uniqueModules });
    }

    if (errors.apiConnection.length > 5) {
      warning(`${name} - ${errors.apiConnection.length} API connection failures (may be expected if distributed mode is off)`);
    }

    if (errors.tokenExpired.length > 10) {
      warning(`${name} - ${errors.tokenExpired.length} token invalidation warnings (expected after server restart)`);
    }
  }

  if (criticalErrors.length === 0) {
    success('No critical errors found in recent logs');
  }

  return criticalErrors;
}

function analyzeWorkerActivity(processes) {
  subsection('Worker Activity');

  for (const proc of processes) {
    const name = proc.name;

    if (name.includes('worker')) {
      const logs = getLogs(name, 50);

      // Count activity indicators
      const successCount = logs.filter(l => l.includes('success') || l.includes('✓') || l.includes('completed')).length;
      const failCount = logs.filter(l => l.includes('failed') || l.includes('error') || l.includes('❌')).length;
      const idleCount = logs.filter(l => l.includes('Idle') || l.includes('no pending')).length;

      if (successCount > 0 || failCount > 0) {
        info(`${name} - ${c.green(successCount + ' successes')}, ${c.red(failCount + ' failures')}`);
      } else if (idleCount > 0) {
        info(`${name} - Idle (no work to process)`);
      } else {
        info(`${name} - No recent activity`);
      }
    }
  }
}

function generateRecommendations(issues, leaks, errors) {
  subsection('Recommendations');

  const recommendations = [];

  // Memory leak recommendations
  for (const leak of leaks) {
    recommendations.push({
      priority: 'CRITICAL',
      action: `Fix memory leak in ${leak.process}`,
      details: `Process is consuming ${leak.memoryMB}MB and restarting every ~${Math.round(leak.uptimeMin / Math.max(1, leak.restarts))} minutes. Increase max_memory_restart or fix the memory leak.`
    });
  }

  // Missing dependency recommendations
  const missingModules = errors.filter(e => e.type === 'moduleNotFound');
  if (missingModules.length > 0) {
    for (const err of missingModules) {
      recommendations.push({
        priority: 'HIGH',
        action: `Install missing dependencies for ${err.process}`,
        details: `Run: npm install ${err.modules.join(' ')}`
      });
    }
  }

  // High restart count recommendations
  const highRestarts = issues.filter(i => i.issue.includes('restart count'));
  if (highRestarts.length > 0) {
    for (const issue of highRestarts) {
      recommendations.push({
        priority: 'HIGH',
        action: `Investigate ${issue.process} stability`,
        details: `Check logs for crash causes: pm2 logs ${issue.process} --err --lines 200`
      });
    }
  }

  // Display recommendations
  if (recommendations.length === 0) {
    success('No immediate actions required');
    return;
  }

  recommendations.sort((a, b) => {
    const priority = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return priority[a.priority] - priority[b.priority];
  });

  for (let i = 0; i < recommendations.length; i++) {
    const rec = recommendations[i];
    const priorityColor = rec.priority === 'CRITICAL' ? c.red : rec.priority === 'HIGH' ? c.yellow : c.blue;

    console.log(`\n  ${priorityColor(`[${rec.priority}]`)} ${c.bold(rec.action)}`);
    console.log(`  ${c.gray('└─')} ${rec.details}`);
  }
}

function main() {
  console.clear();
  section('PM2 Process Health Analysis');
  console.log(c.gray(`  Generated at: ${new Date().toLocaleString()}`));

  const processes = getProcessList();

  if (processes.length === 0) {
    critical('No PM2 processes found');
    return;
  }

  const issues = analyzeProcessHealth(processes);
  const leaks = analyzeMemoryLeaks(processes);
  const errors = analyzeErrors(processes);

  analyzeWorkerActivity(processes);

  generateRecommendations(issues, leaks, errors);

  section('Quick Commands');
  console.log(`  ${c.gray('View logs:')}         pm2 logs <process-name> --lines 100`);
  console.log(`  ${c.gray('View errors only:')}  pm2 logs <process-name> --err --lines 100`);
  console.log(`  ${c.gray('Restart process:')}   pm2 restart <process-name>`);
  console.log(`  ${c.gray('Reset restarts:')}    pm2 reset <process-name>`);
  console.log(`  ${c.gray('Monitor real-time:')} pm2 monit`);

  console.log('');
}

main();
