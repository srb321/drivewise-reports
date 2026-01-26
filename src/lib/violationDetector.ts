import type { LogEntry, ParsedLog, Violation, ViolationCategory, AnalysisReport } from '@/types/driverLog';

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

function findPreviousEntryWithDuration(entries: LogEntry[], currentIndex: number): { entry: LogEntry; index: number } | null {
  for (let i = currentIndex - 1; i >= 0; i--) {
    if (entries[i].durationMinutes > 0) {
      return { entry: entries[i], index: i };
    }
  }
  return null;
}

function checkOdometerJump(entries: LogEntry[]): Violation[] {
  const violations: Violation[] = [];
  
  for (let i = 1; i < entries.length; i++) {
    const current = entries[i];
    const previous = entries[i - 1];
    
    if (current.odometer !== null && previous.odometer !== null) {
      const diff = current.odometer - previous.odometer;
      
      if (diff !== 0) {
        // Find previous entry with duration
        const prevWithDuration = findPreviousEntryWithDuration(entries, i);
        
        if (prevWithDuration) {
          const refEntry = prevWithDuration.entry;
          const refOdometer = entries[prevWithDuration.index].odometer;
          
          if (refOdometer !== null && current.odometer !== null) {
            const actualDiff = current.odometer - refOdometer;
            
            // Check if status was driving
            if (refEntry.status.toLowerCase() !== 'driving' && actualDiff > 0) {
              violations.push({
                id: generateId(),
                category: 'Odometer Jump',
                severity: actualDiff > 50 ? 'Critical' : 'Major',
                date: current.date,
                time: current.time,
                description: `Odometer changed by ${actualDiff.toFixed(1)} miles but status was "${refEntry.status}" (not Driving)`,
                details: {
                  currentOdometer: current.odometer,
                  previousOdometer: refOdometer,
                  odometerDiff: actualDiff,
                  duration: refEntry.duration,
                  status: refEntry.status,
                },
              });
            }
          }
        }
      }
    }
  }
  
  return violations;
}

function checkLocationChange(entries: LogEntry[]): Violation[] {
  const violations: Violation[] = [];
  
  for (let i = 1; i < entries.length; i++) {
    const current = entries[i];
    const previous = entries[i - 1];
    
    if (current.location && previous.location && current.location !== previous.location) {
      // Check if previous status was not driving
      const prevWithDuration = findPreviousEntryWithDuration(entries, i);
      
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

function checkStationaryWhileDriving(entries: LogEntry[]): Violation[] {
  const violations: Violation[] = [];
  
  for (const entry of entries) {
    if (
      entry.status.toLowerCase() === 'driving' &&
      entry.durationMinutes >= 10
    ) {
      // Check if odometer changed
      const entryIndex = entries.indexOf(entry);
      if (entryIndex > 0) {
        const previous = entries[entryIndex - 1];
        if (
          entry.odometer !== null &&
          previous.odometer !== null &&
          entry.odometer === previous.odometer
        ) {
          violations.push({
            id: generateId(),
            category: 'Stationary While Driving',
            severity: 'Major',
            date: entry.date,
            time: entry.time,
            description: `Status is "Driving" for ${entry.duration} but odometer unchanged`,
            details: {
              currentOdometer: entry.odometer,
              duration: entry.duration,
              status: entry.status,
            },
          });
        }
      }
    }
  }
  
  return violations;
}

function checkDrivingHoursExceeded(log: ParsedLog): Violation[] {
  const violations: Violation[] = [];
  const maxHours = log.country === 'Canada' ? 13 : 11;
  
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
    
    const totalHours = totalDrivingMinutes / 60;
    
    if (totalHours > maxHours) {
      violations.push({
        id: generateId(),
        category: 'Driving Hours Exceeded',
        severity: 'Critical',
        date,
        time: '',
        description: `Total driving time ${totalHours.toFixed(2)} hours exceeds ${maxHours} hour limit for ${log.country}`,
        details: {
          totalDrivingHours: totalHours,
          allowedHours: maxHours,
        },
      });
    }
  }
  
  return violations;
}

function checkOdometerAtDateChange(entries: LogEntry[]): Violation[] {
  const violations: Violation[] = [];
  
  let lastDateOdometer: { date: string; odometer: number } | null = null;
  
  for (const entry of entries) {
    if (entry.odometer !== null) {
      if (lastDateOdometer && lastDateOdometer.date !== entry.date) {
        const diff = entry.odometer - lastDateOdometer.odometer;
        
        if (diff !== 0) {
          violations.push({
            id: generateId(),
            category: 'Odometer Mismatch (Date Change)',
            severity: 'Major',
            date: entry.date,
            time: entry.time,
            description: `Odometer differs by ${diff.toFixed(1)} miles at date change from ${lastDateOdometer.date} to ${entry.date}`,
            details: {
              currentOdometer: entry.odometer,
              previousOdometer: lastDateOdometer.odometer,
              odometerDiff: diff,
            },
          });
        }
      }
      
      lastDateOdometer = { date: entry.date, odometer: entry.odometer };
    }
  }
  
  return violations;
}

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
          description: 'Unidentified driving event detected in Motive logs',
          details: {
            currentOdometer: event.odometer ?? undefined,
            duration: event.duration,
            currentLocation: event.location,
          },
        });
      }
    }
  }
  
  return violations;
}

function checkNotesAndRemarks(entries: LogEntry[]): Violation[] {
  const violations: Violation[] = [];
  
  for (const entry of entries) {
    const hasNotes = entry.notes && entry.notes.trim() !== '';
    const hasRemarks = entry.remarks && entry.remarks.trim() !== '';
    const hasComments = entry.comments && entry.comments.trim() !== '';
    
    if (hasNotes || hasRemarks || hasComments) {
      violations.push({
        id: generateId(),
        category: 'Notes/Remarks Present',
        severity: 'Minor',
        date: entry.date,
        time: entry.time,
        description: 'Entry has notes, remarks, or comments that may need review',
        details: {
          notes: [entry.notes, entry.remarks, entry.comments].filter(Boolean).join(' | '),
          status: entry.status,
          duration: entry.duration,
        },
      });
    }
  }
  
  return violations;
}

export function analyzeDriverLogs(logs: ParsedLog[]): AnalysisReport {
  const allViolations: Violation[] = [];
  
  // Sort logs by date
  logs.sort((a, b) => new Date(a.logDate).getTime() - new Date(b.logDate).getTime());
  
  for (const log of logs) {
    // Sort entries by time
    log.entries.sort((a, b) => {
      const timeA = a.time || '00:00';
      const timeB = b.time || '00:00';
      return timeA.localeCompare(timeB);
    });
    
    // Run all violation checks
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
  
  dates.sort();
  
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
