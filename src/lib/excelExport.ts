import * as XLSX from 'xlsx';
import type { AnalysisReport, Violation } from '@/types/driverLog';

export function exportToExcel(report: AnalysisReport): void {
  const workbook = XLSX.utils.book_new();
  
  // Summary Sheet
  const summaryData = [
    ['Driver Log Violation Report'],
    ['Generated At:', new Date(report.generatedAt).toLocaleString()],
    [''],
    ['Summary'],
    ['Total Violations:', report.totalViolations],
    ['Total Log Entries:', report.summary.totalEntries],
    ['Total Driving Time:', `${(report.summary.totalDrivingMinutes / 60).toFixed(2)} hours`],
    ['Date Range:', `${report.summary.dateRange.start} to ${report.summary.dateRange.end}`],
    [''],
    ['Violations by Category'],
    ...Object.entries(report.violationsByCategory).map(([category, count]) => [category, count]),
  ];
  
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
  
  // Violations Sheet
  const violationHeaders = [
    'ID',
    'Category',
    'Severity',
    'Date',
    'Time',
    'Description',
    'Current Odometer',
    'Previous Odometer',
    'Odometer Diff',
    'Duration',
    'Status',
    'Location',
    'Notes',
  ];
  
  const violationRows = report.violations.map((v: Violation) => [
    v.id,
    v.category,
    v.severity,
    v.date,
    v.time,
    v.description,
    v.details.currentOdometer ?? '',
    v.details.previousOdometer ?? '',
    v.details.odometerDiff ?? '',
    v.details.duration ?? '',
    v.details.status ?? '',
    v.details.currentLocation ?? v.details.previousLocation ?? '',
    v.details.notes ?? '',
  ]);
  
  const violationsSheet = XLSX.utils.aoa_to_sheet([violationHeaders, ...violationRows]);
  
  // Set column widths
  violationsSheet['!cols'] = [
    { wch: 10 }, // ID
    { wch: 30 }, // Category
    { wch: 10 }, // Severity
    { wch: 12 }, // Date
    { wch: 10 }, // Time
    { wch: 60 }, // Description
    { wch: 15 }, // Current Odometer
    { wch: 15 }, // Previous Odometer
    { wch: 12 }, // Diff
    { wch: 10 }, // Duration
    { wch: 15 }, // Status
    { wch: 25 }, // Location
    { wch: 40 }, // Notes
  ];
  
  XLSX.utils.book_append_sheet(workbook, violationsSheet, 'Violations');
  
  // Violations by Category Sheets
  const categories = [...new Set(report.violations.map(v => v.category))];
  
  for (const category of categories) {
    const categoryViolations = report.violations.filter(v => v.category === category);
    const categoryRows = categoryViolations.map((v: Violation) => [
      v.id,
      v.severity,
      v.date,
      v.time,
      v.description,
      v.details.currentOdometer ?? '',
      v.details.previousOdometer ?? '',
      v.details.odometerDiff ?? '',
      v.details.duration ?? '',
      v.details.status ?? '',
      v.details.notes ?? '',
    ]);
    
    const categoryHeaders = [
      'ID', 'Severity', 'Date', 'Time', 'Description',
      'Current Odometer', 'Previous Odometer', 'Diff',
      'Duration', 'Status', 'Notes'
    ];
    
    const categorySheet = XLSX.utils.aoa_to_sheet([categoryHeaders, ...categoryRows]);
    const sheetName = category.substring(0, 31); // Excel sheet name limit
    XLSX.utils.book_append_sheet(workbook, categorySheet, sheetName);
  }
  
  // Download the file
  const fileName = `violation-report-${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(workbook, fileName);
}
