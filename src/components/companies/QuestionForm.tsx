import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface QuestionFormProps {
  companyId: string;
  onSuccess: () => void;
}

export const QuestionForm = ({ companyId, onSuccess }: QuestionFormProps) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    question: "",
    answer: "",
    topic: "",
    question_type: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);

    try {
      const { error } = await supabase.from("interview_questions").insert({
        company_id: companyId,
        user_id: user.id,
        question: formData.question,
        answer: formData.answer || null,
        topic: formData.topic || null,
        question_type: formData.question_type || null,
      });

      if (error) throw error;

      toast({ title: "Success", description: "Question added successfully" });
      onSuccess();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="question">Question *</Label>
        <Textarea
          id="question"
          value={formData.question}
          onChange={(e) => setFormData({ ...formData, question: e.target.value })}
          placeholder="Enter the interview question..."
          rows={3}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="answer">Answer (Optional)</Label>
        <Textarea
          id="answer"
          value={formData.answer}
          onChange={(e) => setFormData({ ...formData, answer: e.target.value })}
          placeholder="Provide the answer or solution..."
          rows={4}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="topic">Topic</Label>
          <Input
            id="topic"
            value={formData.topic}
            onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
            placeholder="e.g., Arrays, SQL"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="question_type">Type</Label>
          <Select
            value={formData.question_type}
            onValueChange={(value) => setFormData({ ...formData, question_type: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="DSA">DSA</SelectItem>
              <SelectItem value="System Design">System Design</SelectItem>
              <SelectItem value="Behavioral">Behavioral</SelectItem>
              <SelectItem value="Technical">Technical</SelectItem>
              <SelectItem value="HR">HR</SelectItem>
              <SelectItem value="Puzzle">Puzzle</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Add Question
      </Button>
    </form>
  );
};
