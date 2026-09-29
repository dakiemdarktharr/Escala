import { Icon } from "@/components/ui/icon";
import { requestSummary } from "./presentation";

/** A single plain-language introduction to the reply directly below it. */
export function RecommendationPanel({ intent, needsApproval, uncertain, processing }: {
  intent: string;
  needsApproval: boolean;
  uncertain: boolean;
  processing: boolean;
}) {
  return (
    <div className="recommendation-card">
      <h3><Icon name="spark" size={16} />{processing ? "Reply not prepared yet" : uncertain ? "Escala needs help" : needsApproval ? "Escala needs your approval" : "Escala recommends"}</h3>
      <p className="draft-reason">{processing ? "You can reply manually while this message is waiting for review." : uncertain ? "I’m not confident how to answer this request. Please review the customer’s message." : requestSummary(intent)}</p>
    </div>
  );
}
