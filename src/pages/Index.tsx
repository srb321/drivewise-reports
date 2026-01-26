import React, { useState, useCallback } from 'react';
import { FileUpload } from '@/components/FileUpload';
import { ReportPreview } from '@/components/ReportPreview';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { parseDriverLogPDF } from '@/lib/pdfParser';
import { analyzeDriverLogs } from '@/lib/violationDetector';
import { exportToExcel } from '@/lib/excelExport';
import { FileSpreadsheet, Eye, Loader2, Truck, Shield, AlertTriangle } from 'lucide-react';
import type { AnalysisReport, ParsedLog } from '@/types/driverLog';
import { useToast } from '@/hooks/use-toast';

const Index = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [activeTab, setActiveTab] = useState('upload');
  const { toast } = useToast();

  const handleFilesSelected = useCallback((newFiles: File[]) => {
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const handleRemoveFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleAnalyze = async () => {
    if (files.length === 0) {
      toast({
        title: 'No files selected',
        description: 'Please upload at least one PDF file to analyze.',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessing(true);

    try {
      const parsedLogs: ParsedLog[] = [];

      for (const file of files) {
        try {
          const parsed = await parseDriverLogPDF(file);
          parsedLogs.push(parsed);
        } catch (error) {
          console.error(`Error parsing ${file.name}:`, error);
          toast({
            title: `Error parsing ${file.name}`,
            description: 'The file could not be parsed. It may be corrupted or in an unsupported format.',
            variant: 'destructive',
          });
        }
      }

      if (parsedLogs.length > 0) {
        const analysisReport = analyzeDriverLogs(parsedLogs);
        setReport(analysisReport);
        setActiveTab('preview');

        toast({
          title: 'Analysis Complete',
          description: `Found ${analysisReport.totalViolations} violation(s) in ${parsedLogs.length} log(s).`,
        });
      }
    } catch (error) {
      console.error('Analysis error:', error);
      toast({
        title: 'Analysis Failed',
        description: 'An unexpected error occurred during analysis.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExportExcel = () => {
    if (report) {
      exportToExcel(report);
      toast({
        title: 'Export Successful',
        description: 'The violation report has been downloaded as an Excel file.',
      });
    }
  };

  const handleReset = () => {
    setFiles([]);
    setReport(null);
    setActiveTab('upload');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary rounded-lg">
              <Truck className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">ELD Log Analyzer</h1>
              <p className="text-sm text-muted-foreground">
                Analyze driver logs for HOS violations
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between mb-6">
            <TabsList>
              <TabsTrigger value="upload" className="gap-2">
                <Shield className="h-4 w-4" />
                Upload & Analyze
              </TabsTrigger>
              <TabsTrigger value="preview" disabled={!report} className="gap-2">
                <Eye className="h-4 w-4" />
                Report Preview
              </TabsTrigger>
            </TabsList>

            {report && (
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleReset}>
                  New Analysis
                </Button>
                <Button onClick={handleExportExcel} className="gap-2">
                  <FileSpreadsheet className="h-4 w-4" />
                  Export to Excel
                </Button>
              </div>
            )}
          </div>

          <TabsContent value="upload" className="space-y-6">
            {/* Features Info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-primary" />
                    Violation Detection
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Detects odometer jumps, location changes, driving hours exceeded, and more.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Eye className="h-4 w-4 text-primary" />
                    HTML Preview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Review violations with an interactive, categorized report view.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4 text-primary" />
                    Excel Export
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Export detailed reports to Excel with categorized sheets.
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Upload Section */}
            <Card>
              <CardHeader>
                <CardTitle>Upload Driver Log PDFs</CardTitle>
                <CardDescription>
                  Supports Motive (KeepTruckin), Samsara, and other ELD formats.
                  Upload multiple files to analyze across dates.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <FileUpload
                  onFilesSelected={handleFilesSelected}
                  files={files}
                  onRemoveFile={handleRemoveFile}
                  isProcessing={isProcessing}
                />

                {files.length > 0 && (
                  <Button
                    onClick={handleAnalyze}
                    disabled={isProcessing}
                    size="lg"
                    className="w-full"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Shield className="h-4 w-4 mr-2" />
                        Analyze {files.length} File{files.length > 1 ? 's' : ''}
                      </>
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Supported Violations */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Supported Violation Checks</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div className="flex items-start gap-2">
                    <span className="text-primary">✓</span>
                    <span>Odometer jumps when not driving</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-primary">✓</span>
                    <span>Location changes without driving status</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-primary">✓</span>
                    <span>Stationary while status is driving (≥10 min)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-primary">✓</span>
                    <span>USA: 11-hour driving limit exceeded</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-primary">✓</span>
                    <span>Canada: 13-hour driving limit exceeded</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-primary">✓</span>
                    <span>Odometer mismatch at date change</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-primary">✓</span>
                    <span>Unidentified driving events (Motive)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-primary">✓</span>
                    <span>Notes/remarks/comments flagging</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="preview">
            {report && <ReportPreview report={report} />}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
