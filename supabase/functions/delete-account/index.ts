import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders })
    }

    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
        return new Response(JSON.stringify({ error: "Missing authorization header" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

    // Validate JWT with anon key to identify the caller
    const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) {
        return new Response(JSON.stringify({ error: "Invalid token" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
    }

    // Check that the user does not own any teams
    const { data: ownedTeams, error: teamsError } = await userClient
        .from("teams")
        .select("id")
        .eq("owner_id", user.id)
    if (teamsError) {
        return new Response(JSON.stringify({ error: "Failed to check teams" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
    }
    if (ownedTeams && ownedTeams.length > 0) {
        return new Response(JSON.stringify({ error: "owns_teams" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
    }

    // Delete the user using service_role — never exposed to the frontend
    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id)
    if (deleteError) {
        return new Response(JSON.stringify({ error: deleteError.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
    }

    return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
})
