import type {
  IAuthenticateGeneric,
  ICredentialType,
  INodeProperties,
} from "n8n-workflow";

export class DriftCreApi implements ICredentialType {
  name = "driftCreApi";
  displayName = "Drift CRE API";
  documentationUrl = "https://driftai.studio/docs/api";

  properties: INodeProperties[] = [
    {
      displayName: "Supabase URL",
      name: "supabaseUrl",
      type: "string",
      default: "",
      placeholder: "https://your-project.supabase.co",
      description: "The Supabase project URL for this workspace",
    },
    {
      displayName: "Supabase Service Role Key",
      name: "supabaseKey",
      type: "string",
      typeOptions: { password: true },
      default: "",
      description: "Service role key with full access to the workspace data",
    },
    {
      displayName: "Workspace ID",
      name: "workspaceId",
      type: "string",
      default: "",
      description: "The Drift workspace ID this credential is scoped to",
    },
  ];

  authenticate: IAuthenticateGeneric = {
    type: "generic",
    properties: {
      headers: {
        apikey: "={{$credentials.supabaseKey}}",
        Authorization: "=Bearer {{$credentials.supabaseKey}}",
      },
    },
  };
}
