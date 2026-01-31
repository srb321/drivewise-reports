import type { LogEntry, ParsedLog, Violation, ViolationCategory, AnalysisReport } from '@/types/driverLog';

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

/**
 * Find the previous row where duration is present (not empty and > 0)
 * This is used for odometer diff calculations - we skip rows without duration
 */
function findPreviousRowWithDuration(entries: LogEntry[], currentIndex: number): { entry: LogEntry; index: number } | null {
  for (let i = currentIndex - 1; i >= 0; i--) {
    if (entries[i].duration && entries[i].duration.trim() !== '' && entries[i].durationMinutes > 0) {
      return { entry: entries[i], index: i };
    }
  }
  return null;
}

/**
 * Check odometer jumps:
 * - Find rows where odometer changed
 * - Look at the previous row WITH duration present
 * - If that previous row's status was NOT driving, it's a violation
 */
function checkOdometerJump(entries: LogEntry[]): Violation[] {
  const violations: Violation[] = [];
  
  for (let i = 1; i < entries.length; i++) {
    const current = entries[i];
    
    if (current.odometer === null) continue;
    
    // Find previous row with duration present
    const prevWithDuration = findPreviousRowWithDuration(entries, i);
    
    if (!prevWithDuration) continue;
    
    const prevOdometer = entries[prevWithDuration.index].odometer;
    
    if (prevOdometer === null) continue;
    
    const odometerDiff = current.odometer - prevOdometer;
    
    // If there's an odometer difference
    if (odometerDiff !== 0 && odometerDiff > 0) {
      const prevStatus = prevWithDuration.entry.status.toLowerCase();
      
      // If previous row (with duration) status was NOT driving, it's a violation
      if (prevStatus !== 'driving') {
        violations.push({
          id: generateId(),
          category: 'Odometer Jump',
          severity: odometerDiff > 50 ? 'Critical' : 'Major',
          date: current.date,
          time: current.time,
          description: `Odometer increased by ${odometerDiff.toFixed(1)} miles but previous status was "${prevWithDuration.entry.status}" (not Driving)`,
          details: {
            currentOdometer: current.odometer,
            previousOdometer: prevOdometer,
            odometerDiff: odometerDiff,
            duration: prevWithDuration.entry.duration,
            status: prevWithDuration.entry.status,
          },
        });
      }
    }
  }
  
  return violations;
}

/**
 * Check location changes:
 * - Compare location with previous row
 * - If location changed and previous row (with duration) status was NOT driving, it's a violation
 */
function checkLocationChange(entries: LogEntry[]): Violation[] {
  const violations: Violation[] = [];
  
  for (let i = 1; i < entries.length; i++) {
    const current = entries[i];
    const previous = entries[i - 1];
    
    // Skip if no locations to compare
    if (!current.location || !previous.location) continue;
    
    // Check if location changed (text or numeric values)
    const locationChanged = current.location.trim().toLowerCase() !== previous.location.trim().toLowerCase();
    
    if (locationChanged) {
      // Find previous row with duration
      const prevWithDuration = findPreviousRowWithDuration(entries, i);
      
      if (prevWithDuration && prevWithDuration.entry.status.toLowerCase() !== 'driving') {
        violations.push({
          id: generateId(),
          category: 'Location Change Without Driving',
          severity: 'Major',
          date: current.date,
          time: current.time,
          description: `Location changed from "${previous.location}" to "${current.location}" without driving status`,
          details: {
            currentLocation: current.location,
            previousLocation: previous.location,
            status: prevWithDuration.entry.status,
            duration: prevWithDuration.entry.duration,
          },
        });
      }
    }
  }
  
  return violations;
}

/**
 * Check stationary while driving:
 * - If status is "Driving" and duration >= 10 minutes
 * - But odometer didn't change from previous row
 * - Show violation
 */
function checkStationaryWhileDriving(entries: LogEntry[]): Violation[] {
  const violations: Violation[] = [];
  
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    
    // Check if status is driving with duration >= 10 minutes
    if (entry.status.toLowerCase() === 'driving' && entry.durationMinutes >= 10) {
      // Find previous row with odometer
      let prevOdometer: number | null = null;
      for (let j = i - 1; j >= 0; j--) {
        if (entries[j].odometer !== null) {
          prevOdometer = entries[j].odometer;
          break;
        }
      }
      
      // If odometer didn't change
      if (prevOdometer !== null && entry.odometer !== null && entry.odometer === prevOdometer) {
        violations.push({
          id: generateId(),
          category: 'Stationary While Driving',
          severity: 'Major',
          date: entry.date,
          time: entry.time,
          description: `Status is "Driving" for ${entry.duration} (${entry.durationMinutes} min) but odometer unchanged at ${entry.odometer}`,
          details: {
            currentOdometer: entry.odometer,
            duration: entry.duration,
            status: entry.status,
          },
        });
      }
    }
  }
  
  return violations;
}

/**
 * Check driving hours exceeded:
 * - USA: Max 11 hours driving per day
 * - Canada: Max 13 hours driving per day
 * - Add up all durations where status is "driving" for each date
 */
function checkDrivingHoursExceeded(log: ParsedLog): Violation[] {
  const violations: Violation[] = [];
  const maxHours = log.country === 'Canada' ? 13 : 11;
  const maxMinutes = maxHours * 60;
  
  // Group entries by date
  const entriesByDate: Record<string, LogEntry[]> = {};
  for (const entry of log.entries) {
    if (!entriesByDate[entry.date]) {
      entriesByDate[entry.date] = [];
    }
    entriesByDate[entry.date].push(entry);
  }
  
  for (const [date, dateEntries] of Object.entries(entriesByDate)) {
    let totalDrivingMinutes = 0;
    
    for (const entry of dateEntries) {
      if (entry.status.toLowerCase() === 'driving') {
        totalDrivingMinutes += entry.durationMinutes;
      }
    }
    
    // Violation if even 1 second over (1 minute in our case since we track minutes)
    if (totalDrivingMinutes > maxMinutes) {
      const totalHours = totalDrivingMinutes / 60;
      violations.push({
        id: generateId(),
        category: 'Driving Hours Exceeded',
        severity: 'Critical',
        date,
        time: '',
        description: `Total driving time ${totalHours.toFixed(2)} hours (${totalDrivingMinutes} min) exceeds ${maxHours} hour limit for ${log.country}`,
        details: {
          totalDrivingHours: totalHours,
          allowedHours: maxHours,
        },
      });
    }
  }
  
  return violations;
}

/**
 * Check odometer at date change:
 * - Store odometer for last row of previous date
 * - Compare with first row of next date
 * - If there's a difference, show violation
 */
function checkOdometerAtDateChange(entries: LogEntry[]): Violation[] {
  const violations: Violation[] = [];
  
  // Group entries by date and find last odometer for each date
  const dateOdometers: Record<string, { firstOdometer: number | null; lastOdometer: number | null; firstTime: string; lastTime: string }> = {};
  
  for (const entry of entries) {
    if (!dateOdometers[entry.date]) {
      dateOdometers[entry.date] = { firstOdometer: null, lastOdometer: null, firstTime: '', lastTime: '' };
    }
    
    if (entry.odometer !== null) {
      if (dateOdometers[entry.date].firstOdometer === null) {
        dateOdometers[entry.date].firstOdometer = entry.odometer;
        dateOdometers[entry.date].firstTime = entry.time;
      }
      dateOdometers[entry.date].lastOdometer = entry.odometer;
      dateOdometers[entry.date].lastTime = entry.time;
    }
  }
  
  // Sort dates in ascending order
  const sortedDates = Object.keys(dateOdometers).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  
  // Check continuity between consecutive dates
  for (let i = 1; i < sortedDates.length; i++) {
    const prevDate = sortedDates[i - 1];
    const currDate = sortedDates[i];
    
    const prevLastOdometer = dateOdometers[prevDate].lastOdometer;
    const currFirstOdometer = dateOdometers[currDate].firstOdometer;
    
    if (prevLastOdometer !== null && currFirstOdometer !== null) {
      const diff = currFirstOdometer - prevLastOdometer;
      
      if (diff !== 0) {
        violations.push({
          id: generateId(),
          category: 'Odometer Mismatch (Date Change)',
          severity: 'Major',
          date: currDate,
          time: dateOdometers[currDate].firstTime,
          description: `Odometer differs by ${diff.toFixed(1)} miles between end of ${prevDate} (${prevLastOdometer}) and start of ${currDate} (${currFirstOdometer})`,
          details: {
            currentOdometer: currFirstOdometer,
            previousOdometer: prevLastOdometer,
            odometerDiff: diff,
          },
        });
      }
    }
  }
  
  return violations;
}

/**
 * Check unidentified driving events (Motive format only):
 * - If format is Motive and there are unidentified events
 * - If any have status "driving", show all details
 */
function checkUnidentifiedDrivingEvents(log: ParsedLog): Violation[] {
  const violations: Violation[] = [];
  
  if (log.format === 'Motive' && log.unidentifiedEvents.length > 0) {
    for (const event of log.unidentifiedEvents) {
      if (event.status.toLowerCase() === 'driving') {
        violations.push({
          id: generateId(),
          category: 'Unidentified Driving Event',
          severity: 'Critical',
          date: event.date || log.logDate,
          time: event.time,
          description: `Unidentified driving event detected - Duration: ${event.duration}, Location: ${event.location || 'Unknown'}`,
          details: {
            currentOdometer: event.odometer ?? undefined,
            duration: event.duration,
            currentLocation: event.location,
            status: 'Unidentified Driving',
          },
        });
      }
    }
  }
  
  return violations;
}

/**
 * Check notes and remarks:
 * - If notes, comments, or remarks column has values (not empty)
 * - Show the details of those rows
 */
function checkNotesAndRemarks(entries: LogEntry[]): Violation[] {
  const violations: Violation[] = [];
  
  for (const entry of entries) {
    const notes = entry.notes?.trim() || '';
    const remarks = entry.remarks?.trim() || '';
    const comments = entry.comments?.trim() || '';
    
    const allNotes = [notes, remarks, comments].filter(n => n !== '').join(' | ');
    
    if (allNotes) {
      violations.push({
        id: generateId(),
        category: 'Notes/Remarks Present',
        severity: 'Minor',
        date: entry.date,
        time: entry.time,
        description: `Entry has notes/remarks that need review`,
        details: {
          notes: allNotes,
          status: entry.status,
          duration: entry.duration,
          currentOdometer: entry.odometer ?? undefined,
          currentLocation: entry.location,
        },
      });
    }
  }
  
  return violations;
}

/**
 * Main analysis function:
 * - Sort logs by date in ASCENDING order (lowest/oldest first)
 * - Sort entries within each log by time
 * - Run all violation checks
 * - Generate categorized report
 */
export function analyzeDriverLogs(logs: ParsedLog[]): AnalysisReport {
  const allViolations: Violation[] = [];
  
  // Sort logs by date in ASCENDING order (oldest first)
  logs.sort((a, b) => new Date(a.logDate).getTime() - new Date(b.logDate).getTime());
  
  for (const log of logs) {
    // Sort entries by time within each log
    log.entries.sort((a, b) => {
      const timeA = a.time || '00:00';
      const timeB = b.time || '00:00';
      return timeA.localeCompare(timeB);
    });
    
    // Run all violation checks in order
    allViolations.push(...checkOdometerJump(log.entries));
    allViolations.push(...checkLocationChange(log.entries));
    allViolations.push(...checkStationaryWhileDriving(log.entries));
    allViolations.push(...checkDrivingHoursExceeded(log));
    allViolations.push(...checkOdometerAtDateChange(log.entries));
    allViolations.push(...checkUnidentifiedDrivingEvents(log));
    allViolations.push(...checkNotesAndRemarks(log.entries));
  }
  
  // Count violations by category
  const violationsByCategory: Record<ViolationCategory, number> = {
    'Odometer Jump': 0,
    'Odometer Mismatch (Date Change)': 0,
    'Location Change Without Driving': 0,
    'Stationary While Driving': 0,
    'Driving Hours Exceeded': 0,
    'Unidentified Driving Event': 0,
    'Notes/Remarks Present': 0,
  };
  
  for (const v of allViolations) {
    violationsByCategory[v.category]++;
  }
  
  // Calculate summary
  let totalEntries = 0;
  let totalDrivingMinutes = 0;
  const dates: string[] = [];
  
  for (const log of logs) {
    totalEntries += log.entries.length;
    dates.push(log.logDate);
    
    for (const entry of log.entries) {
      if (entry.status.toLowerCase() === 'driving') {
        totalDrivingMinutes += entry.durationMinutes;
      }
    }
  }
  
  dates.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  
  return {
    generatedAt: new Date().toISOString(),
    totalViolations: allViolations.length,
    violationsByCategory,
    violations: allViolations,
    parsedLogs: logs,
    summary: {
      totalEntries,
      totalDrivingMinutes,
      dateRange: {
        start: dates[0] || 'Unknown',
        end: dates[dates.length - 1] || 'Unknown',
      },
    },
  };
}
