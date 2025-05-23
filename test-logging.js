// Quick test script to verify structured logging
const logger = require('./dist/helpers/axiom_logger').default;

console.log('Testing structured logging...');

// Test basic structured log
logger.log({
  level: 'info',
  event: 'test_event',
  trace_id: 'test123',
  context: { test: true, latency_ms: 150 }
});

// Test legacy compatibility
logger.info('Legacy log message', { context: 'test' });

console.log('Structured logging test complete');