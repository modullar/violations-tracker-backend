const mongoose = require('mongoose');
const Report = require('./src/models/Report');
const Violation = require('./src/models/Violation');
const config = require('./src/config/config');

async function findRecentViolations() {
  try {
    await mongoose.connect(config.mongoUri);
    
    // Find reports processed in the last hour (around your batch processing time)
    const startTime = new Date('2025-07-05T20:00:00.000Z');
    const endTime = new Date('2025-07-05T21:00:00.000Z');
    
    const reports = await Report.find({
      status: 'processed',
      'processing_metadata.last_attempt': {
        $gte: startTime,
        $lte: endTime
      }
    }).populate('violation_ids');
    
    console.log('Reports processed in the batch:');
    reports.forEach((report, index) => {
      console.log(`\n${index + 1}. Report ID: ${report._id}`);
      console.log(`   Channel: ${report.metadata.channel}`);
      console.log(`   Processed at: ${report.processing_metadata.last_attempt}`);
      console.log(`   Violations created: ${report.violation_ids.length}`);
      
      if (report.violation_ids.length > 0) {
        console.log('   Violation IDs:');
        report.violation_ids.forEach(violation => {
          console.log(`     - ${violation._id} (${violation.type}) - ${violation.location?.name?.en || 'Unknown location'}`);
        });
      }
    });
    
    const totalViolations = reports.reduce((sum, report) => sum + report.violation_ids.length, 0);
    console.log(`\nTotal violations created: ${totalViolations}`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

findRecentViolations(); 