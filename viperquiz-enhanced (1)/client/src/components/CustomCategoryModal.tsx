import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface CustomCategoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CustomCategoryModal({ open, onOpenChange, onSuccess }: CustomCategoryModalProps) {
  const [categoryName, setCategoryName] = useState("");
  const [categoryDescription, setCategoryDescription] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const generateMutation = trpc.ai.generateCustomCategory.useMutation();
  const loginAnimation = "/manus-storage/viperquiz-login-animation_d57645e3.mp4";

  const handleGenerateCategory = async () => {
    if (!categoryName.trim()) {
      toast.error("Please enter a category name");
      return;
    }

    if (!categoryDescription.trim()) {
      toast.error("Please enter a category description");
      return;
    }

    if (categoryDescription.trim().length < 10) {
      toast.error("Description must be at least 10 characters");
      return;
    }

    setIsGenerating(true);
    try {
      const result = await generateMutation.mutateAsync({
        categoryName: categoryName.trim(),
        categoryDescription: categoryDescription.trim(),
      });

      if (result.success) {
        toast.success(`Category "${result.categoryName}" created with ${result.questionCount} questions!`);
        setCategoryName("");
        setCategoryDescription("");
        onOpenChange(false);
        onSuccess?.();
      } else {
        toast.error(result.error || "Failed to generate category");
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to generate custom category");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Custom Category</DialogTitle>
          <DialogDescription>
            Use AI to generate a new quiz category with 10 unique questions
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Category Name
            </label>
            <Input
              placeholder="e.g., Space Exploration, Ancient Rome"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              disabled={isGenerating}
              maxLength={100}
            />
            <p className="text-xs text-gray-500 mt-1">{categoryName.length}/100</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Category Description
            </label>
            <Textarea
              placeholder="Describe what topics should be covered in this category..."
              value={categoryDescription}
              onChange={(e) => setCategoryDescription(e.target.value)}
              disabled={isGenerating}
              maxLength={500}
              rows={4}
            />
            <p className="text-xs text-gray-500 mt-1">{categoryDescription.length}/500</p>
          </div>

          {isGenerating && (
            <div className="relative overflow-hidden rounded-xl border border-cyan-200/30 bg-[#050b1b] py-5 text-white shadow-[0_0_35px_rgba(34,211,238,.15)]" role="status" aria-live="polite">
              <video className="absolute inset-0 h-full w-full object-cover opacity-45" src={loginAnimation} autoPlay muted loop playsInline aria-hidden="true" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(17,112,255,.35),transparent_50%),rgba(5,11,27,.55)]" />
              <div className="relative flex flex-col items-center justify-center gap-2 px-4 text-center">
                <Spinner className="h-6 w-6 text-cyan-200" />
                <span className="text-sm font-semibold text-cyan-50">ViperQuiz AI is building your arena…</span>
                <span className="text-xs text-blue-100/70">Generating 10 unique questions for {categoryName.trim() || "your topic"}</span>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isGenerating}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleGenerateCategory}
              disabled={isGenerating || !categoryName.trim() || categoryDescription.trim().length < 10}
              className="flex-1"
            >
              {isGenerating ? "Generating..." : "Generate Category"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
