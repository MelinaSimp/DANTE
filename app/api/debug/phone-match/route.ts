import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

/**
 * Diagnostic endpoint to check phone number matching
 * GET /api/debug/phone-match?phone=+12163508215
 */
export async function GET(req: NextRequest) {
  try {
    const phone = req.nextUrl.searchParams.get("phone");
    
    if (!phone) {
      return NextResponse.json({ 
        error: "Please provide a phone parameter",
        example: "/api/debug/phone-match?phone=+12163508215"
      }, { status: 400 });
    }

    const normalized = normalizePhone(phone);
    
    // Generate all possible formats (same as incoming route)
    const possibleFormats = [
      normalized,
      phone,
      normalized?.replace(/^\+1/, ""),
      phone.replace(/^\+1/, ""),
      normalized?.replace(/^\+1/, "").replace(/(\d{3})(\d{3})(\d{4})/, "$1 $2 $3"),
      phone.replace(/^\+1/, "").replace(/(\d{3})(\d{3})(\d{4})/, "$1 $2 $3"),
    ].filter(Boolean) as string[];

    const uniqueFormats = [...new Set(possibleFormats)];

    // Get all agents
    const { data: allAgents, error: agentsError } = await supabaseAdmin
      .from("agents")
      .select("id, name, phone_number, status, is_specialist")
      .order("status", { ascending: false })
      .order("is_specialist", { ascending: true });

    if (agentsError) {
      return NextResponse.json({ error: agentsError.message }, { status: 500 });
    }

    // Check for exact matches
    const exactMatches = allAgents?.filter(agent => 
      uniqueFormats.includes(agent.phone_number || "")
    ) || [];

    // Check for normalized matches
    const normalizedMatches = allAgents?.filter(agent => {
      if (!agent.phone_number) return false;
      const agentNormalized = normalizePhone(agent.phone_number);
      return agentNormalized === normalized || agentNormalized === phone;
    }) || [];

    // Check deployed agents specifically
    const deployedAgents = allAgents?.filter(agent => agent.status === "deployed") || [];

    return NextResponse.json({
      input: {
        original: phone,
        normalized: normalized,
        possibleFormats: uniqueFormats,
      },
      agents: {
        total: allAgents?.length || 0,
        deployed: deployedAgents.length,
        all: allAgents?.map(agent => ({
          id: agent.id,
          name: agent.name,
          phone_number: agent.phone_number,
          status: agent.status,
          is_specialist: agent.is_specialist,
          normalized: normalizePhone(agent.phone_number),
        })) || [],
      },
      matches: {
        exact: exactMatches.map(agent => ({
          id: agent.id,
          name: agent.name,
          phone_number: agent.phone_number,
          status: agent.status,
        })),
        normalized: normalizedMatches.map(agent => ({
          id: agent.id,
          name: agent.name,
          phone_number: agent.phone_number,
          normalized: normalizePhone(agent.phone_number),
          status: agent.status,
        })),
        deployed: deployedAgents.filter(agent => {
          if (!agent.phone_number) return false;
          const agentNormalized = normalizePhone(agent.phone_number);
          return agentNormalized === normalized || agentNormalized === phone;
        }).map(agent => ({
          id: agent.id,
          name: agent.name,
          phone_number: agent.phone_number,
          status: agent.status,
        })),
      },
      diagnosis: {
        willWork: exactMatches.some(agent => agent.status === "deployed") || 
                 normalizedMatches.some(agent => agent.status === "deployed"),
        issues: [
          ...(exactMatches.length === 0 && normalizedMatches.length === 0 
            ? ["No agent found with matching phone number"] 
            : []),
          ...(exactMatches.length > 0 && !exactMatches.some(a => a.status === "deployed")
            ? ["Agent(s) found but status is not 'deployed'"] 
            : []),
          ...(normalizedMatches.length > 0 && !normalizedMatches.some(a => a.status === "deployed")
            ? ["Agent(s) found (normalized match) but status is not 'deployed'"] 
            : []),
        ],
      },
    });
  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message || "Unknown error" 
    }, { status: 500 });
  }
}




