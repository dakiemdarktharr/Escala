# Escala seller-response demo

Use the existing inbox with synthetic seed data. All deliveries are simulated in MongoDB; no marketplace message, refund or cancellation occurs.

1. Open **Buyer reply-black**. Prepare recommendation. With no API key the suggestion is explicitly a reviewed template, confidence unavailable, review required. It asks for the product link rather than inventing black availability. Edit and send; show the seller message.
2. Open **Buyer reply-wrong-size**. The factual report remains neutral, priority 47. Prepare a photo/order-number question; edit/send and inspect Activity → Reply delivery & edits for original/final wording. Reload: the reply remains.
3. Open **Buyer reply-shipment**. Profanity is negative, shipment intent is low risk. Send a normal order-number question without turning hostility into a financial-risk decision.
4. Open **Buyer reply-cancel** and **Buyer reply-refund**. The requests can be neutral and temporally low urgency but have high business risk. A useful draft stays visible. Approve & send sends only the reply. Editing into the composer requires explicit sensitive-action approval; neither draft claims the action was completed.
5. Open **Buyer vn-hostile**. Vietnamese rules, negative/refund, low temporal urgency, priority 85 stay visible. Approve the Vietnamese acknowledgement and reload.
6. Open **Buyer reply-uncertain**. The clarification draft stays visible for review. Decline it, then write/send a new manual response. Without live generation confidence is null; the numeric low-confidence path is covered by the test-only protocol stub, not presented as real AI in this demo.
7. Open **Buyer vn-positive** before generating a recommendation. The composer is available immediately. Write/send a thank-you reply, reload, and show its manual-source audit.

Automatic delivery is eligibility, not a claim of a live connector. With configured live generation it additionally needs confidence >=0.90, exact reviewed wording, required evidence, known intent and no risk. The test suite exercises high-confidence automatic simulated delivery using a local Responses API protocol stub. Do not describe that as a live OpenAI run. Fallback templates cannot auto-send.

Remaining validation: representative seller-reviewed reply data, calibrated confidence/grounding evaluation, broader risk/intent and Vietnamese coverage. A few synthetic examples do not establish real-customer accuracy. Existing priority and sentiment models are unchanged.
