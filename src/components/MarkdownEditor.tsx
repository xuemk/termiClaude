import React, { useState, useEffect, useCallback } from "react";
import MDEditor from "@uiw/react-md-editor";
import { motion } from "framer-motion";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toast, ToastContainer } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { handleError } from "@/lib/errorHandler";
interface MarkdownEditorProps {
  /**
   * Callback to go back to the main view
   */
  onBack: () => void;
  /**
   * Optional className for styling
   */
  className?: string;
}

/**
 * MarkdownEditor component for editing the CLAUDE.md system prompt
 *
 * A full-featured markdown editor for editing Claude Code system prompts with
 * real-time preview, auto-save detection, error handling, and internationalization
 * support. Features include syntax highlighting, change detection, and toast notifications.
 *
 * @param onBack - Callback to return to the previous view
 * @param className - Additional CSS classes for styling
 *
 * @example
 * ```tsx
 * <MarkdownEditor
 *   onBack={() => setView('main')}
 *   className="custom-editor"
 * />
 * ```
 */
export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({ onBack, className }) => {
  const { t } = useI18n();
  const [content, setContent] = useState<string>("");
  const [originalContent, setOriginalContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const hasChanges = content !== originalContent;

  // Load the system prompt on mount
  const loadSystemPrompt = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const prompt = await api.getSystemPrompt();
      setContent(prompt);
      setOriginalContent(prompt);
    } catch (err) {
      await handleError("Failed to load system prompt:", { context: err });
      setError(t.claudemd.failedToLoad);
    } finally {
      setLoading(false);
    }
  }, [t.claudemd.failedToLoad]);

  useEffect(() => {
    loadSystemPrompt();
  }, [loadSystemPrompt]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setToast(null);
      await api.saveSystemPrompt(content);
      setOriginalContent(content);
      setToast({ message: t.claudemd.savedSuccessfully, type: "success" });
    } catch (err) {
      await handleError("Failed to save system prompt:", { context: err });
      setError(t.claudemd.failedToSave);
      setToast({ message: t.claudemd.failedToSave, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (hasChanges) {
      const confirmLeave = window.confirm(t.claudemd.unsavedChanges);
      if (!confirmLeave) return;
    }
    onBack();
  };

  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      <div className="w-full max-w-5xl mx-auto flex flex-col h-full">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-center justify-between p-4 border-b border-border"
        >
          <div className="flex items-center space-x-3">
            <Button variant="ghost" size="icon" onClick={handleBack} className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h2 className="text-lg font-semibold">{t.claudemd.title}</h2>
              <p className="text-xs text-muted-foreground">{t.claudemd.editSystemPrompt}</p>
            </div>
          </div>

          <Button onClick={handleSave} disabled={!hasChanges || saving} size="sm">
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {saving ? t.common.loading : t.common.save}
          </Button>
        </motion.div>

        {/* Error display */}
        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mx-4 mt-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive"
          >
            {error}
          </motion.div>
        )}

        {/* Editor */}
        <div className="flex-1 p-4 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div
              className="h-full rounded-lg border border-border overflow-hidden shadow-sm"
              data-color-mode="dark"
            >
              <MDEditor
                value={content}
                onChange={(val) => setContent(val || "")}
                preview="edit"
                height="100%"
                visibleDragbar={false}
              />
            </div>
          )}
        </div>
      </div>

      {/* Toast Notification */}
      <ToastContainer>
        {toast && (
          <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
        )}
      </ToastContainer>
    </div>
  );
};
