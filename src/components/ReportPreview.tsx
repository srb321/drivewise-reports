import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AlertTriangle, Clock, MapPin, Gauge, FileText, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { AnalysisReport, Violation, ViolationCategory } from '@/types/driverLog';

interface ReportPreviewProps {
  report: AnalysisReport;
}

const categoryIcons: Record<ViolationCategory, React.ReactNode> = {
  'Odometer Jump': <Gauge className="h-4 w-4" />,
  'Odometer Mismatch (Date Change)': <Gauge className="h-4 w-4" />,
  'Location Change Without Driving': <MapPin className="h-4 w-4" />,
  'Stationary While Driving': <AlertCircle className="h-4 w-4" />,
  'Driving Hours Exceeded': <Clock className="h-4 w-4" />,
  'Unidentified Driving Event': <AlertTriangle className="h-4 w-4" />,
  'Notes/Remarks Present': <FileText className="h-4 w-4" />,
};

const severityColors: Record<string, string> = {
  Critical: 'bg-destructive text-destructive-foreground',
  Major: 'bg-orange-500 text-white',
  Minor: 'bg-yellow-500 text-black',
};

function ViolationRow({ violation }: { violation: Violation }) {
  return (
    <TableRow>
      <TableCell>
        <Badge className={severityColors[violation.severity]}>
          {violation.severity}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          {categoryIcons[violation.category]}
          <span className="text-sm">{violation.category}</span>
        </div>
      </TableCell>
      <TableCell className="font-mono text-sm">{violation.date}</TableCell>
      <TableCell className="font-mono text-sm">{violation.time || '-'}</TableCell>
      <TableCell className="max-w-md">
        <p className="text-sm">{violation.description}</p>
        {violation.details.notes && (
          <p className="text-xs text-muted-foreground mt-1">
            Notes: {violation.details.notes}
          </p>
        )}
      </TableCell>
    </TableRow>
  );
}

function SummaryCard({ title, value, icon, variant = 'default' }: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  variant?: 'default' | 'warning' | 'success';
}) {
  const bgColor = variant === 'warning' ? 'bg-destructive/10' : variant === 'success' ? 'bg-green-500/10' : 'bg-muted';
  const iconColor = variant === 'warning' ? 'text-destructive' : variant === 'success' ? 'text-green-500' : 'text-primary';
  
  return (
    <Card className={bgColor}>
      <CardContent className="flex items-center gap-4 p-4">
        <div className={iconColor}>{icon}</div>
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function ReportPreview({ report }: ReportPreviewProps) {
  const categories = Object.entries(report.violationsByCategory)
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Total Violations"
          value={report.totalViolations}
          icon={<AlertTriangle className="h-8 w-8" />}
          variant={report.totalViolations > 0 ? 'warning' : 'success'}
        />
        <SummaryCard
          title="Log Entries Analyzed"
          value={report.summary.totalEntries}
          icon={<FileText className="h-8 w-8" />}
        />
        <SummaryCard
          title="Total Driving Time"
          value={`${(report.summary.totalDrivingMinutes / 60).toFixed(1)}h`}
          icon={<Clock className="h-8 w-8" />}
        />
        <SummaryCard
          title="Date Range"
          value={report.summary.dateRange.start === report.summary.dateRange.end 
            ? report.summary.dateRange.start 
            : `${report.summary.dateRange.start.split('/').slice(0,2).join('/')} - ${report.summary.dateRange.end.split('/').slice(0,2).join('/')}`}
          icon={<CheckCircle2 className="h-8 w-8" />}
          variant="success"
        />
      </div>

      {/* Violations by Category */}
      {categories.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Violations by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {categories.map(([category, count]) => (
                <div
                  key={category}
                  className="flex items-center gap-2 px-4 py-2 bg-muted rounded-lg"
                >
                  {categoryIcons[category as ViolationCategory]}
                  <span className="text-sm font-medium">{category}</span>
                  <Badge variant="secondary">{count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detailed Violations Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Violation Details</CardTitle>
        </CardHeader>
        <CardContent>
          {report.violations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
              <h3 className="text-xl font-semibold mb-2">No Violations Found</h3>
              <p className="text-muted-foreground">
                The analyzed driver logs appear to be compliant.
              </p>
            </div>
          ) : (
            <Tabs defaultValue="all">
              <TabsList className="mb-4 flex-wrap h-auto">
                <TabsTrigger value="all">All ({report.violations.length})</TabsTrigger>
                {categories.map(([category, count]) => (
                  <TabsTrigger key={category} value={category}>
                    {category.split(' ')[0]} ({count})
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="all">
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-24">Severity</TableHead>
                        <TableHead className="w-48">Category</TableHead>
                        <TableHead className="w-28">Date</TableHead>
                        <TableHead className="w-20">Time</TableHead>
                        <TableHead>Description</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.violations.map((violation) => (
                        <ViolationRow key={violation.id} violation={violation} />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              {categories.map(([category]) => (
                <TabsContent key={category} value={category}>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-24">Severity</TableHead>
                          <TableHead className="w-48">Category</TableHead>
                          <TableHead className="w-28">Date</TableHead>
                          <TableHead className="w-20">Time</TableHead>
                          <TableHead>Description</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {report.violations
                          .filter((v) => v.category === category)
                          .map((violation) => (
                            <ViolationRow key={violation.id} violation={violation} />
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* Report Generation Info */}
      <p className="text-xs text-muted-foreground text-center">
        Report generated at {new Date(report.generatedAt).toLocaleString()}
      </p>
    </div>
  );
}
