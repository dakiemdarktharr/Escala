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
      <h3><Icon name="spark" size={16} />{processing ? "Đang chờ chuẩn bị câu trả lời" : uncertain ? "Cần bạn xem yêu cầu này" : needsApproval ? "Cần bạn phê duyệt bản nháp" : "Đề xuất cho bước tiếp theo"}</h3>
      <p className="draft-reason">{processing ? "Bạn có thể tự trả lời trong lúc tin nhắn đang chờ xử lý." : uncertain ? "Chưa đủ cơ sở để trả lời yêu cầu này. Hãy đọc tin nhắn và bổ sung thông tin cần thiết." : requestSummary(intent)}</p>
    </div>
  );
}
