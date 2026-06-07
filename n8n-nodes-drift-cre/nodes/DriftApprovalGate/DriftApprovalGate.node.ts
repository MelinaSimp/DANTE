import type {
  IDataObject,
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  IWebhookFunctions,
  IWebhookResponseData,
} from "n8n-workflow";

export class DriftApprovalGate implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Drift CRE: Approval Gate",
    name: "driftApprovalGate",
    icon: "file:../../icons/drift.svg",
    group: ["transform"],
    version: 1,
    description:
      "Pause workflow execution, send an approval request via email/SMS, and resume when the approver responds. Uses n8n waitTill for durable pausing.",
    defaults: {
      name: "Approval Gate",
    },
    inputs: ["main"],
    outputs: ["main", "main"],
    outputNames: ["Approved", "Rejected"],
    credentials: [
      {
        name: "driftCreApi",
        required: true,
      },
    ],
    webhooks: [
      {
        name: "default",
        httpMethod: "GET",
        responseMode: "onReceived",
        path: "approval",
      },
    ],
    properties: [
      {
        displayName: "Approval Message",
        name: "message",
        type: "string",
        typeOptions: { rows: 4 },
        default: "",
        required: true,
        description: "Message shown to the approver explaining what they are approving",
      },
      {
        displayName: "Approver Role",
        name: "approverRole",
        type: "options",
        options: [
          { name: "Owner", value: "owner" },
          { name: "Admin", value: "admin" },
          { name: "Any Team Member", value: "any" },
        ],
        default: "owner",
        description: "Which workspace role can approve this gate",
      },
      {
        displayName: "Notification Method",
        name: "notifyVia",
        type: "options",
        options: [
          { name: "Email", value: "email" },
          { name: "SMS", value: "sms" },
          { name: "Both", value: "both" },
        ],
        default: "email",
        description: "How to notify the approver",
      },
      {
        displayName: "Timeout (Hours)",
        name: "timeoutHours",
        type: "number",
        typeOptions: { minValue: 1, maxValue: 720 },
        default: 72,
        description: "Hours to wait for approval before auto-rejecting. Max 30 days.",
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const credentials = await this.getCredentials("driftCreApi");
    const supabaseUrl = credentials.supabaseUrl as string;
    const supabaseKey = credentials.supabaseKey as string;
    const workspaceId = credentials.workspaceId as string;

    const message = this.getNodeParameter("message", 0, "") as string;
    const approverRole = this.getNodeParameter("approverRole", 0, "owner") as string;
    const notifyVia = this.getNodeParameter("notifyVia", 0, "email") as string;
    const timeoutHours = this.getNodeParameter("timeoutHours", 0, 72) as number;

    // Construct webhook URL for approval callbacks.
    // n8n registers waiting-webhook endpoints at /webhook-waiting/<path>
    // when putExecutionToWait is called. The execution ID is appended by
    // the caller so the correct paused run resumes.
    const n8nBaseUrl = (process.env.WEBHOOK_URL || process.env.N8N_HOST || "").replace(/\/$/, "");
    const executionId = this.getExecutionId();
    const webhookUrl = `${n8nBaseUrl}/webhook-waiting/approval/${executionId}`;

    const approveUrl = `${webhookUrl}?action=approve`;
    const rejectUrl = `${webhookUrl}?action=reject`;

    // Look up approvers from workspace profiles
    const profileFilter = approverRole === "any"
      ? `workspace_id=eq.${workspaceId}`
      : `workspace_id=eq.${workspaceId}&role=eq.${approverRole}`;

    const profilesResponse = await this.helpers.httpRequest({
      method: "GET",
      url: `${supabaseUrl}/rest/v1/profiles?${profileFilter}&select=id,full_name,sms_phone,sms_verified_at,role`,
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });

    const approvers = Array.isArray(profilesResponse) ? profilesResponse : [];

    if (approvers.length === 0) {
      // No approvers found -- auto-reject
      return [[], [{ json: { approved: false, reason: "No approvers found for the specified role" } }]];
    }

    // Send notifications to approvers
    for (const approver of approvers) {
      if ((notifyVia === "email" || notifyVia === "both")) {
        // Get email from auth.users (profiles does not store email)
        try {
          const resendKey = process.env.RESEND_API_KEY;
          if (resendKey) {
            // Look up email via Supabase admin API
            const userResponse = await this.helpers.httpRequest({
              method: "GET",
              url: `${supabaseUrl}/auth/v1/admin/users/${approver.id}`,
              headers: {
                apikey: supabaseKey,
                Authorization: `Bearer ${supabaseKey}`,
              },
            });
            const email = userResponse?.email;
            if (email) {
              await this.helpers.httpRequest({
                method: "POST",
                url: "https://api.resend.com/emails",
                headers: {
                  Authorization: `Bearer ${resendKey}`,
                  "Content-Type": "application/json",
                },
                body: {
                  from: process.env.RESEND_FROM_EMAIL || "Drift <ops@driftai.studio>",
                  to: email,
                  subject: "Approval Required -- Drift Workflow",
                  html: `
                    <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto;">
                      <h2 style="color: #1a1a1a;">Approval Required</h2>
                      <p style="color: #444; line-height: 1.6;">${message}</p>
                      <div style="margin: 24px 0;">
                        <a href="${approveUrl}" style="display: inline-block; padding: 10px 24px; background: #22c55e; color: white; text-decoration: none; border-radius: 6px; margin-right: 12px;">Approve</a>
                        <a href="${rejectUrl}" style="display: inline-block; padding: 10px 24px; background: #ef4444; color: white; text-decoration: none; border-radius: 6px;">Reject</a>
                      </div>
                      <p style="color: #999; font-size: 12px;">This request will auto-expire in ${timeoutHours} hours.</p>
                    </div>
                  `.trim(),
                },
              });
            }
          }
        } catch {
          // Email send failed -- continue to SMS
        }
      }

      if ((notifyVia === "sms" || notifyVia === "both") && approver.sms_phone && approver.sms_verified_at) {
        try {
          // Send via Drift's SMS API
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://driftai.studio";
          await this.helpers.httpRequest({
            method: "POST",
            url: `${appUrl}/api/sms/send`,
            headers: { "Content-Type": "application/json" },
            body: {
              to: approver.sms_phone,
              body: `Approval needed: ${message.slice(0, 120)}. Reply APPROVE or REJECT.`,
            },
          });
        } catch {
          // SMS send failed -- continue
        }
      }
    }

    // Set waitTill to pause execution until webhook callback or timeout
    const waitUntil = new Date(Date.now() + timeoutHours * 60 * 60 * 1000);

    // Return wait state -- n8n will pause this execution
    // The webhook handler below will resume it
    const waitData: INodeExecutionData = {
      json: {
        status: "waiting_approval",
        message,
        approver_role: approverRole,
        approvers_notified: approvers.length,
        approve_url: approveUrl,
        reject_url: rejectUrl,
        timeout: waitUntil.toISOString(),
      } as IDataObject,
    };

    // Use n8n's built-in wait mechanism
    await this.putExecutionToWait(waitUntil);

    return [[waitData], []];
  }

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const query = this.getQueryData() as { action?: string };
    const action = query.action || "reject";
    const approved = action === "approve";

    const responseHtml = `
      <html>
        <body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #fafafa;">
          <div style="text-align: center; padding: 40px;">
            <h1 style="color: ${approved ? "#22c55e" : "#ef4444"};">${approved ? "Approved" : "Rejected"}</h1>
            <p style="color: #666;">The workflow has been ${approved ? "approved and will continue" : "rejected and has been stopped"}.</p>
            <p style="color: #999; font-size: 14px;">You can close this tab.</p>
          </div>
        </body>
      </html>
    `.trim();

    const outputData: INodeExecutionData = {
      json: {
        approved,
        action,
        responded_at: new Date().toISOString(),
      },
    };

    return {
      webhookResponse: responseHtml,
      workflowData: approved ? [[outputData], []] : [[], [outputData]],
    };
  }
}
