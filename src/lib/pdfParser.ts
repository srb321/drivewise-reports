import * as pdfjsLib from 'pdfjs-dist';
import type { LogEntry, ParsedLog } from '@/types/driverLog';

// Set up the worker - use unpkg which has proper CORS headers
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs`;

export async function extractTextFromPDF(file: File): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ');
    pages.push(pageText);
  }

  return pages;
}

function detectFormat(text: string): 'Motive' | 'Samsara' | 'Generic' {
  const lowerText = text.toLowerCase();
  if (lowerText.includes('motive') || lowerText.includes('keeptruckin')) {
    return 'Motive';
  }
  if (lowerText.includes('samsara')) {
    return 'Samsara';
  }
  return 'Generic';
}

function detectCountry(text: string): 'USA' | 'Canada' | 'Unknown' {
  const lowerText = text.toLowerCase();
  // Check for Canadian provinces
  const canadianIndicators = ['canada', 'ontario', 'quebec', 'british columbia', 'alberta', 'manitoba', 'saskatchewan', 'nova scotia', 'new brunswick', 'newfoundland', 'pei', 'yukon', 'nunavut', 'nwt'];
  const usaIndicators = ['usa', 'united states', 'california', 'texas', 'florida', 'new york', 'illinois', 'pennsylvania', 'ohio', 'georgia', 'michigan', 'arizona', 'washington', 'oregon', 'nevada'];
  
  for (const indicator of canadianIndicators) {
    if (lowerText.includes(indicator)) return 'Canada';
  }
  for (const indicator of usaIndicators) {
    if (lowerText.includes(indicator)) return 'USA';
  }
  return 'Unknown';
}

function extractDate(text: string): string {
  // Look for common date patterns
  const datePatterns = [
    /(\d{1,2}\/\d{1,2}\/\d{4})/,
    /(\d{4}-\d{2}-\d{2})/,
    /(\d{1,2}-\d{1,2}-\d{4})/,
    /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4})/i,
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return 'Unknown';
}

function parseDurationToMinutes(duration: string): number {
  if (!duration || duration.trim() === '') return 0;
  
  // Handle formats like "1:30", "01:30:00", "1h 30m", "90 min"
  const hhmm = duration.match(/(\d+):(\d+)/);
  if (hhmm) {
    return parseInt(hhmm[1]) * 60 + parseInt(hhmm[2]);
  }
  
  const hm = duration.match(/(\d+)\s*h(?:ours?)?\s*(\d+)?\s*m?/i);
  if (hm) {
    return parseInt(hm[1]) * 60 + (parseInt(hm[2]) || 0);
  }
  
  const minOnly = duration.match(/(\d+)\s*(?:min|minutes?)/i);
  if (minOnly) {
    return parseInt(minOnly[1]);
  }
  
  return 0;
}

function parseOdometer(value: string): number | null {
  if (!value || value.trim() === '') return null;
  const cleaned = value.replace(/[^0-9.]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function extractLogEntries(text: string, format: string): LogEntry[] {
  const entries: LogEntry[] = [];
  const lines = text.split(/\n|\r\n?/);
  
  // Common status keywords
  const statusKeywords = ['driving', 'on duty', 'off duty', 'sleeper', 'on-duty', 'off-duty', 'personal', 'yard move'];
  
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    const hasStatus = statusKeywords.some(status => lowerLine.includes(status));
    
    if (hasStatus) {
      // Try to parse the line
      const parts = line.split(/\s{2,}|\t/);
      
      if (parts.length >= 2) {
        const timeMatch = line.match(/(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)/i);
        const odometerMatch = line.match(/(\d{4,}(?:\.\d+)?)/);
        const durationMatch = line.match(/(\d+:\d+(?::\d+)?)/g);
        
        let status = '';
        for (const keyword of statusKeywords) {
          if (lowerLine.includes(keyword)) {
            status = keyword.charAt(0).toUpperCase() + keyword.slice(1);
            break;
          }
        }
        
        const duration = durationMatch && durationMatch.length > 1 ? durationMatch[1] : (durationMatch ? durationMatch[0] : '');
        
        entries.push({
          date: '',
          time: timeMatch ? timeMatch[1] : '',
          status,
          duration,
          durationMinutes: parseDurationToMinutes(duration),
          odometer: odometerMatch ? parseOdometer(odometerMatch[1]) : null,
          location: extractLocation(line),
          notes: extractNotes(line, 'notes'),
          remarks: extractNotes(line, 'remarks'),
          comments: extractNotes(line, 'comments'),
          rawRow: parts,
        });
      }
    }
  }
  
  return entries;
}

function extractLocation(line: string): string {
  // Try to extract location (usually city, state format)
  const locationMatch = line.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?,\s*[A-Z]{2})/);
  if (locationMatch) return locationMatch[1];
  
  // Try to find coordinates or mile markers
  const coordMatch = line.match(/(\d+\.\d+,\s*-?\d+\.\d+)/);
  if (coordMatch) return coordMatch[1];
  
  return '';
}

function extractNotes(line: string, field: string): string {
  const regex = new RegExp(`${field}[:\\s]+([^|]+)`, 'i');
  const match = line.match(regex);
  return match ? match[1].trim() : '';
}

function extractUnidentifiedEvents(text: string): LogEntry[] {
  const entries: LogEntry[] = [];
  const lowerText = text.toLowerCase();
  
  // Look for unidentified events section
  if (lowerText.includes('unidentified') && lowerText.includes('event')) {
    const lines = text.split(/\n|\r\n?/);
    let inUnidentifiedSection = false;
    
    for (const line of lines) {
      if (line.toLowerCase().includes('unidentified')) {
        inUnidentifiedSection = true;
        continue;
      }
      
      if (inUnidentifiedSection && line.toLowerCase().includes('driving')) {
        const timeMatch = line.match(/(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)/i);
        const odometerMatch = line.match(/(\d{4,}(?:\.\d+)?)/);
        const durationMatch = line.match(/(\d+:\d+(?::\d+)?)/);
        
        entries.push({
          date: '',
          time: timeMatch ? timeMatch[1] : '',
          status: 'Driving',
          duration: durationMatch ? durationMatch[0] : '',
          durationMinutes: parseDurationToMinutes(durationMatch ? durationMatch[0] : ''),
          odometer: odometerMatch ? parseOdometer(odometerMatch[1]) : null,
          location: extractLocation(line),
          notes: '',
          remarks: '',
          comments: '',
          rawRow: line.split(/\s{2,}|\t/),
        });
      }
    }
  }
  
  return entries;
}

export async function parseDriverLogPDF(file: File): Promise<ParsedLog> {
  const pages = await extractTextFromPDF(file);
  const fullText = pages.join('\n');
  
  const format = detectFormat(fullText);
  const country = detectCountry(fullText);
  const logDate = extractDate(fullText);
  
  // Extract driver name (usually near the top)
  const driverMatch = fullText.match(/(?:Driver|Name)[:\s]+([A-Z][a-z]+\s+[A-Z][a-z]+)/i);
  const driverName = driverMatch ? driverMatch[1] : 'Unknown Driver';
  
  const entries = extractLogEntries(fullText, format);
  const unidentifiedEvents = format === 'Motive' ? extractUnidentifiedEvents(fullText) : [];
  
  // Assign dates to entries
  let currentDate = logDate;
  entries.forEach(entry => {
    entry.date = currentDate;
  });
  
  return {
    driverName,
    logDate,
    country: country === 'Unknown' ? 'USA' : country,
    format,
    entries,
    unidentifiedEvents,
  };
}
