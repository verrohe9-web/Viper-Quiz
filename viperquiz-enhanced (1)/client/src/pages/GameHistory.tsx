import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Download, FileText, Loader2, Printer } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] || character);
}

export function GameHistory() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportReady, setReportReady] = useState(false);
  const reportQuery = trpc.game.generateGamesPDF.useQuery(undefined, { enabled: false });

  const handleGeneratePDF = async () => {
    setIsGenerating(true);
    try {
      const result = await reportQuery.refetch();
      const report = result.data;
      if (!report?.success || !report.pdfContent) {
        toast.error(report?.error || "No completed game history is available yet.");
        return;
      }

      setReportReady(true);
      const printWindow = window.open("", "_blank", "noopener,noreferrer");
      if (!printWindow) {
        toast.error("Allow pop-ups to open the printable PDF report.");
        return;
      }
      printWindow.document.write(`<!doctype html><html><head><title>ViperQuiz Game History Report</title><style>body{font-family:Arial,sans-serif;color:#172033;margin:36px;line-height:1.45}h1{color:#6d28d9}pre{white-space:pre-wrap;font:14px/1.55 Arial,sans-serif} @media print{body{margin:20px}}</style></head><body><h1>ViperQuiz Game History Report</h1><pre>${escapeHtml(report.pdfContent)}</pre><script>window.onload=()=>window.print()</script></body></html>`);
      printWindow.document.close();
      toast.success("Report ready. Choose ‘Save as PDF’ in the print dialog.");
    } catch (error) {
      console.error("Error generating report:", error);
      toast.error("Failed to generate the game report.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadText = async () => {
    const result = await reportQuery.refetch();
    const report = result.data;
    if (!report?.success || !report.pdfContent) {
      toast.error(report?.error || "No completed game history is available yet.");
      return;
    }
    const blob = new Blob([report.pdfContent], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "viperquiz-game-history.md";
    link.click();
    URL.revokeObjectURL(url);
    setReportReady(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8"><h1 className="mb-2 text-4xl font-bold text-white">Game History</h1><p className="text-purple-100">View and download reports of all games played</p></div>
        <Card className="rounded-lg bg-white p-8 shadow-lg">
          <div className="space-y-6">
            <div className="rounded-lg border-2 border-dashed border-purple-300 p-8 text-center">
              <Download className="mx-auto mb-4 h-12 w-12 text-purple-600" />
              <h2 className="mb-2 text-2xl font-bold text-gray-800">Download Game Report</h2>
              <p className="mb-6 text-gray-600">Generate a comprehensive report of recorded games, including questions, answers, and player performance.</p>
              <div className="flex flex-wrap justify-center gap-3">
                <Button onClick={handleGeneratePDF} disabled={isGenerating} className="bg-gradient-to-r from-purple-600 to-blue-600 font-bold text-white hover:from-purple-700 hover:to-blue-700">
                  {isGenerating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating report…</> : <><Printer className="mr-2 h-4 w-4" />Generate PDF Report</>}
                </Button>
                <Button onClick={handleDownloadText} disabled={isGenerating} variant="outline"><FileText className="mr-2 h-4 w-4" />Download data</Button>
              </div>
              {reportReady && <p className="mt-4 text-sm font-medium text-emerald-700" role="status">Report generated successfully. The PDF is available through your print dialog.</p>}
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-lg bg-gradient-to-br from-purple-50 to-blue-50 p-6"><h3 className="mb-2 font-bold text-gray-800">What&apos;s Included</h3><ul className="space-y-2 text-sm text-gray-700"><li>✓ All recorded completed games</li><li>✓ Complete question sets</li><li>✓ Correct answers and player responses</li><li>✓ Performance scores and analysis</li></ul></div>
              <div className="rounded-lg bg-gradient-to-br from-blue-50 to-purple-50 p-6"><h3 className="mb-2 font-bold text-gray-800">Report Options</h3><ul className="space-y-2 text-sm text-gray-700"><li>✓ Print dialog with Save as PDF</li><li>✓ Downloadable Markdown data copy</li><li>✓ Organized by game session</li><li>✓ Timestamp information</li></ul></div>
            </div>
          </div>
        </Card>
        <div className="mt-8 text-center text-purple-100"><p className="text-sm">Reports are generated on-demand from available historical game data.</p></div>
      </div>
    </div>
  );
}
