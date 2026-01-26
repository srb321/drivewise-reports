export interface LogEntry {
  date: string;
  time: string;
  status: string;
  duration: string;
  durationMinutes: number;
  odometer: number | null;
  location: string;
  notes: string;
  remarks: string;
  comments: string;
  rawRow: string[];
}

export interface ParsedLog {
  driverName: string;
  logDate: string;
  country: 'USA' | 'Canada' | 'Unknown';
  format: 'Motive' | 'Samsara' | 'Generic';
  entries: LogEntry[];
  unidentifiedEvents: LogEntry[];
}

export interface Violation {
  id: string;
  category: ViolationCategory;
  severity: 'Critical' | 'Major' | 'Minor';
  date: string;
  time: string;
  description: string;
  details: {
    currentOdometer?: number;
    previousOdometer?: number;
    odometerDiff?: number;
    currentLocation?: string;
    previousLocation?: string;
    duration?: string;
    status?: string;
    totalDrivingHours?: number;
    allowedHours?: number;
    notes?: string;
  };
}

export type ViolationCategory = 
  | 'Odometer Jump'
  | 'Odometer Mismatch (Date Change)'
  | 'Location Change Without Driving'
  | 'Stationary While Driving'
  | 'Driving Hours Exceeded'
  | 'Unidentified Driving Event'
  | 'Notes/Remarks Present';

export interface AnalysisReport {
  generatedAt: string;
  totalViolations: number;
  violationsByCategory: Record<ViolationCategory, number>;
  violations: Violation[];
  parsedLogs: ParsedLog[];
  summary: {
    totalEntries: number;
    totalDrivingMinutes: number;
    dateRange: { start: string; end: string };
  };
}
