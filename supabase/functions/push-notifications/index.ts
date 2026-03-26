import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { create, getNumericDate } from "https://deno.land/x/djwt@v2.8/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { user_id, title, body, data } = await req.json()

    if (!user_id) throw new Error('user_id is required')

    // 1. Get user tokens
    const { data: tokens, error: tokensError } = await supabaseClient
      .from('fcm_tokens')
      .select('token')
      .eq('profile_id', user_id)

    if (tokensError) throw tokensError
    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ message: 'No tokens found for user' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // 2. Get Access Token for FCM V1
    const accessToken = await getFcmAccessToken()

    // 3. Send notifications
    const project_id = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT')!).project_id
    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${project_id}/messages:send`

    const sendPromises = tokens.map(t => {
      return fetch(fcmUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          message: {
            token: t.token,
            notification: { title, body },
            data: data || {},
            android: {
               priority: "high",
               notification: {
                  sound: "default",
                  click_action: "OPEN_APP"
               }
            }
          }
        })
      })
    })

    const results = await Promise.all(sendPromises)
    const successCount = results.filter(r => r.ok).length

    return new Response(JSON.stringify({ success: true, successCount, total: tokens.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})

async function getFcmAccessToken() {
  const serviceAccount = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT')!)
  
  const jwt = await create(
    { alg: "RS256", typ: "JWT" },
    {
      iss: serviceAccount.client_email,
      sub: serviceAccount.client_email,
      aud: "https://oauth2.googleapis.com/token",
      iat: getNumericDate(0),
      exp: getNumericDate(3600),
      scope: "https://www.googleapis.com/auth/cloud-platform"
    },
    await crypto.subtle.importKey(
      "pkcs8",
      hexToUint8Array(pemToBinary(serviceAccount.private_key)),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"]
    )
  )

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  })

  const { access_token } = await resp.json()
  return access_token
}

function pemToBinary(pem: string) {
  return b64ToUint8Array(pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "")
  )
}

function b64ToUint8Array(b64: string) {
  const bin = atob(b64)
  const len = bin.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = bin.charCodeAt(i)
  }
  return bytes
}

function hexToUint8Array(bytes: Uint8Array) {
  return bytes // Deno's importKey expects Uint8Array for pkcs8
}
