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

interface ExperienceFormProps {
  companyId: string;
  onSuccess: () => void;
}

export const ExperienceForm = ({ companyId, onSuccess }: ExperienceFormProps) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    round_name: "",
    experience: "",
    difficulty: "",
    result: "",
    tips: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);

    try {
      const { error } = await supabase.from("interview_experiences").insert({
        company_id: companyId,
        user_id: user.id,
        round_name: formData.round_name,
        experience: formData.experience,
        difficulty: formData.difficulty || null,
        result: formData.result || null,
        tips: formData.tips || null,
      });

      if (error) throw error;

      toast({ title: "Success", description: "Experience shared successfully" });
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
        <Label htmlFor="round_name">Round Name *</Label>
        <Input
          id="round_name"
          value={formData.round_name}
          onChange={(e) => setFormData({ ...formData, round_name: e.target.value })}
          placeholder="e.g., Technical Round 1, HR Round"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="experience">Your Experience *</Label>
        <Textarea
          id="experience"
          value={formData.experience}
          onChange={(e) => setFormData({ ...formData, experience: e.target.value })}
          placeholder="Share your interview experience in detail..."
          rows={5}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="difficulty">Difficulty</Label>
          <Select
            value={formData.difficulty}
            onValueChange={(value) => setFormData({ ...formData, difficulty: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select difficulty" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Easy">Easy</SelectItem>
              <SelectItem value="Medium">Medium</SelectItem>
              <SelectItem value="Hard">Hard</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="result">Result</Label>
          <Select
            value={formData.result}
            onValueChange={(value) => setFormData({ ...formData, result: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select result" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Selected">Selected</SelectItem>
              <SelectItem value="Not Selected">Not Selected</SelectItem>
              <SelectItem value="Pending">Pending</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="tips">Tips for Others</Label>
        <Textarea
          id="tips"
          value={formData.tips}
          onChange={(e) => setFormData({ ...formData, tips: e.target.value })}
          placeholder="Any tips or advice for others..."
          rows={3}
        />
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Share Experience
      </Button>
    </form>
  );
};
