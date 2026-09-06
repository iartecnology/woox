// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AI ADAPTER — Motor unificado multi-proveedor para Woox SaaS
// Soporta: Google Gemini, Groq, OpenAI, DeepSeek, OpenRouter, Cerebras, Z.AI, Custom/Ollama
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── TIPOS ──────────────────────────────────────────────────

export interface AIConfig {
    provider: 'google_gemini' | 'groq' | 'openai' | 'deepseek' | 'openrouter' | 'cerebras' | 'zai' | 'custom';
    model: string;
    apiKey: string;
    baseUrl?: string; // Solo para custom/ollama
    temperature: number;
    maxTokens: number;
    fallbackGeminiKey?: string;
}

export interface AIMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    tool_call_id?: string; // Solo para role=tool
    tool_calls?: AIToolCall[]; // Solo para role=assistant con tool calls
}

export interface AIToolCall {
    id: string;
    name: string;
    arguments: Record<string, any>;
}

export interface AIToolDef {
    name: string;
    description: string;
    parameters: Record<string, any>;
}

export interface AIResult {
    text: string;
    toolCalls: AIToolCall[];
    debugLogs: string[];
}

// ── RESOLUCIÓN DE CONFIGURACIÓN ────────────────────────────

const PROVIDER_URLS: Record<string, string> = {
    groq: 'https://api.groq.com/openai/v1/chat/completions',
    openai: 'https://api.openai.com/v1/chat/completions',
    deepseek: 'https://api.deepseek.com/v1/chat/completions',
    openrouter: 'https://openrouter.ai/api/v1/chat/completions',
    cerebras: 'https://api.cerebras.ai/v1/chat/completions',
    zai: 'https://api.z.ai/api/paas/v4/chat/completions'
};

const ENV_KEY_MAP: Record<string, string> = {
    google_gemini: 'GEMINI_API_KEY',
    groq: 'GROQ_API_KEY',
    openai: 'OPENAI_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
    cerebras: 'CEREBRAS_API_KEY',
    zai: 'ZAI_API_KEY'
};

/**
 * Detecta el proveedor correcto basándose en el nombre del modelo.
 */
function detectProviderFromModel(model: string): string {
    const m = model.toLowerCase();
    if (m.includes('llama') || m.includes('mixtral') || m.includes('whisper')) return 'groq';
    if (m.includes('gpt-') || m.includes('o1-') || m.includes('o3-')) return 'openai';
    if (m.includes('deepseek')) return 'deepseek';
    if (m.includes('gemini') || m.includes('gemma')) return 'google_gemini';
    if (m.includes('openrouter')) return 'openrouter';
    if (m.includes('cerebras')) return 'cerebras';
    if (m.includes('glm')) return 'zai';
    return 'google_gemini'; // default
}

/**
 * Normaliza el nombre del modelo para asegurar compatibilidad con la API.
 */
function normalizeModel(model: string, provider: string): string {
    const m = model.replace('models/', '');
    if (provider === 'google_gemini') {
        // Usar los alias -latest que siempre apuntan al modelo vigente
        if (m.includes('flash') && !m.includes('latest')) return 'gemini-flash-latest';
        if (m.includes('pro') && !m.includes('latest') && !m.includes('preview')) return 'gemini-pro-latest';
    }
    return m;
}

/**
 * Resuelve la configuración completa del AI (proveedor, modelo, key, URL).
 * Prioridad: Comercio > Nodo > Plataforma > Env.
 */
export function resolveAIConfig(
    merchant: any,
    nodeData: any,
    platform: any,
    overrides?: { temperature?: number; maxTokens?: number }
): AIConfig {
    // 1. Resolver modelo (Comercio > Nodo > Plataforma > Default)
    let model = merchant?.ai_model || nodeData?.model || platform?.ai_model || 'gemini-flash-latest';

    // 2. Resolver proveedor (auto-detectar del modelo tiene prioridad sobre config mal puesta)
    const detectedProvider = detectProviderFromModel(model);
    let provider = merchant?.ai_provider || nodeData?.provider || 'google_gemini';

    // Auto-corrección: si el modelo es de un proveedor diferente al configurado, usar el detectado
    if (detectedProvider !== provider) {
        console.log(`[AI-ADAPTER] Auto-corrección: proveedor ${provider} → ${detectedProvider} (modelo: ${model})`);
        provider = detectedProvider;
    }

    // 3. Normalizar modelo
    model = normalizeModel(model, provider);

    // 4. Resolver API Key (ai_keys JSONB > ai_api_key legacy validada > platform > env)
    let apiKey = '';
    const keys = merchant?.ai_keys || {};

    if (keys[provider]) {
        // Mejor caso: key específica por proveedor en ai_keys JSONB
        apiKey = keys[provider];
    } else if (merchant?.ai_api_key) {
        // Legacy: SOLO usar ai_api_key si pertenece al proveedor correcto
        const legacyKey = merchant.ai_api_key;
        const keyBelongsToProvider = (
            (provider === 'groq' && legacyKey.startsWith('gsk_')) ||
            (provider === 'openai' && legacyKey.startsWith('sk-')) ||
            (provider === 'google_gemini' && legacyKey.startsWith('AIza')) ||
            (provider === 'deepseek' && legacyKey.startsWith('sk-')) ||
            (provider === 'openrouter') ||
            (provider === 'cerebras') ||
            (provider === 'zai')
        );
        if (keyBelongsToProvider) {
            apiKey = legacyKey;
        } else {
            console.log(`[AI-ADAPTER] Legacy key (${legacyKey.slice(0,4)}...) no coincide con provider ${provider}, usando env var`);
        }
    }

    // Fallback a platform o variables de entorno
    if (!apiKey) {
        apiKey = Deno.env.get(ENV_KEY_MAP[provider] || '') || platform?.ai_api_key || '';
    }

    // 5. Resolver URL base (solo para custom/ollama)
    let baseUrl = merchant?.ai_api_url || undefined;
    if (baseUrl) {
        provider = 'custom' as any;
    }

    const fallbackGeminiKey = platform?.ai_api_key || Deno.env.get('GEMINI_API_KEY') || '';

    return {
        provider: provider as AIConfig['provider'],
        model,
        apiKey,
        baseUrl,
        temperature: overrides?.temperature ?? 0.7,
        maxTokens: overrides?.maxTokens ?? 1024,
        fallbackGeminiKey
    };
}

// ── LLAMADA UNIFICADA AL MODELO ────────────────────────────

/**
 * Ejecuta una llamada completa al modelo de IA con soporte de tools.
 * Maneja el loop de tool-calling internamente.
 * 
 * @param config - Configuración del proveedor/modelo
 * @param messages - Historial de mensajes en formato universal
 * @param tools - Definiciones de herramientas disponibles
 * @param executeToolFn - Función para ejecutar cada herramienta
 * @returns AIResult con texto final y logs de debug
 */
export async function callUnifiedAI(
    config: AIConfig,
    messages: AIMessage[],
    tools: AIToolDef[],
    executeToolFn: (name: string, args: any) => Promise<string>
): Promise<AIResult> {
    const debugLogs: string[] = [];
    const MAX_TOOL_LOOPS = 5;

    console.log(`[AI-ADAPTER] Provider: ${config.provider} | Model: ${config.model} | Tools: ${tools.length}`);
    debugLogs.push(`[CONFIG] ${config.provider}/${config.model} | ${tools.length} tools`);

    if (!config.apiKey) {
        debugLogs.push('[ERROR] No API key found');
        return { text: '⚠️ Configuración de IA no disponible. Contacta a soporte.', toolCalls: [], debugLogs };
    }

    try {
        let result: AIResult;
        
        if (config.provider === 'google_gemini') {
            result = await callGeminiWithTools(config, messages, tools, executeToolFn, debugLogs, MAX_TOOL_LOOPS);
            
            // Detección proactiva de fallos de cuota (Rate Limit) o fallos silenciosos
            const has429 = result.debugLogs.some(log => log.includes('Gemini 429') || log.includes('quota'));
            
            if ((!result.text || has429)) {
                const groqKey = Deno.env.get('GROQ_API_KEY');
                
                if (groqKey) {
                    console.warn('[AI-ADAPTER] [FALLBACK] Gemini falló o arrojó 429. Intentando fallback con Groq...');
                    debugLogs.push('[FALLBACK-TRIGGERED] Gemini falló/429. Reintentando con Groq (llama-3.3-70b-versatile)...');
                    
                    const fallbackConfig: AIConfig = {
                        provider: 'groq',
                        model: 'llama-3.3-70b-versatile',
                        apiKey: groqKey,
                        temperature: config.temperature,
                        maxTokens: config.maxTokens
                    };
                    
                    const groqResult = await callOpenAICompatibleWithTools(fallbackConfig, messages, tools, executeToolFn, debugLogs, MAX_TOOL_LOOPS);
                    if (groqResult.text) return groqResult;
                }
            }
            return result;
            
        } else {
            // Groq, OpenAI, DeepSeek, OpenRouter, Cerebras, Custom — todos usan formato OpenAI
            result = await callOpenAICompatibleWithTools(config, messages, tools, executeToolFn, debugLogs, MAX_TOOL_LOOPS);
            
            // Detección proactiva de fallos de cuota o de servicio en Groq
            const hasError = result.debugLogs.some(log => log.includes('429') || log.includes('Rate limit') || log.includes('ERROR'));
            
            if ((!result.text || hasError) && config.provider === 'groq') {
                const geminiKey = config.fallbackGeminiKey || Deno.env.get('GEMINI_API_KEY');
                
                if (geminiKey) {
                    console.warn('[AI-ADAPTER] [FALLBACK] Groq falló o arrojó 429. Intentando fallback con Gemini...');
                    debugLogs.push('[FALLBACK-TRIGGERED] Groq falló/429. Reintentando con Gemini (gemini-flash-latest)...');
                    
                    const fallbackConfig: AIConfig = {
                        provider: 'google_gemini',
                        model: 'gemini-flash-latest',
                        apiKey: geminiKey,
                        temperature: config.temperature,
                        maxTokens: config.maxTokens
                    };
                    
                    const geminiResult = await callGeminiWithTools(fallbackConfig, messages, tools, executeToolFn, debugLogs, MAX_TOOL_LOOPS);
                    if (geminiResult.text) return geminiResult;
                }
            }
            return result;
        }
    } catch (err: any) {
        console.error('[AI-ADAPTER] Error fatal:', err);
        debugLogs.push(`[FATAL] ${err.message || String(err)}`);
        return { text: `Error al conectar con el servicio de IA: ${err.message}`, toolCalls: [], debugLogs };
    }
}

// ── GEMINI ──────────────────────────────────────────────────

async function callGeminiWithTools(
    config: AIConfig,
    messages: AIMessage[],
    tools: AIToolDef[],
    executeToolFn: (name: string, args: any) => Promise<string>,
    debugLogs: string[],
    maxLoops: number
): Promise<AIResult> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;

    // Separar system de historial
    const systemMsg = messages.find(m => m.role === 'system');
    const conversationMsgs = messages.filter(m => m.role !== 'system');

    // Convertir a formato Gemini
    const contents: any[] = [];
    let lastRole = '';
    for (const m of conversationMsgs) {
        const geminiRole = m.role === 'assistant' ? 'model' : 'user';
        if (geminiRole === lastRole && contents.length > 0) {
            contents[contents.length - 1].parts[0].text += '\n' + m.content;
        } else {
            contents.push({ role: geminiRole, parts: [{ text: m.content }] });
            lastRole = geminiRole;
        }
    }

    const body: any = {
        contents,
        generationConfig: { temperature: config.temperature, maxOutputTokens: config.maxTokens }
    };
    if (systemMsg) {
        body.system_instruction = { parts: [{ text: systemMsg.content }] };
    }
    if (tools.length > 0) {
        body.tools = [{ function_declarations: tools }];
        body.tool_config = { function_calling_config: { mode: 'AUTO' } };
    }

    let finalText = '';
    const allToolCalls: AIToolCall[] = [];

    for (let i = 0; i < maxLoops; i++) {
        debugLogs.push(`[GEMINI-LOOP ${i}]`);
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error(`[AI-ADAPTER] Gemini ${res.status}:`, errText.slice(0, 300));
            debugLogs.push(`[ERROR] Gemini ${res.status}: ${errText.slice(0, 200)}`);
            break;
        }

        const data = await res.json();
        const candidate = data.candidates?.[0]?.content;
        if (!candidate) break;

        // Agregar la respuesta al historial de la conversación
        body.contents.push(candidate);

        // Extraer texto
        const textParts = candidate.parts?.filter((p: any) => p.text) || [];
        if (textParts.length > 0) {
            const combinedText = textParts.map((p: any) => p.text).join('\n');
            finalText = (finalText ? finalText + '\n' : '') + combinedText;
        }

        // Extraer function calls
        const fnCallParts = candidate.parts?.filter((p: any) => p.functionCall) || [];
        if (fnCallParts.length > 0) {
            const toolResponseParts: any[] = [];
            for (const part of fnCallParts) {
                const call = part.functionCall;
                console.log(`[AI-ADAPTER] Gemini tool call: ${call.name}`, call.args);
                debugLogs.push(`[TOOL] ${call.name}(${JSON.stringify(call.args).slice(0, 100)})`);

                const result = await executeToolFn(call.name, call.args);
                allToolCalls.push({ id: `gemini-${i}-${call.name}`, name: call.name, arguments: call.args });
                toolResponseParts.push({
                    functionResponse: { name: call.name, response: { content: result } }
                });
            }
            body.contents.push({ role: 'user', parts: toolResponseParts });
            // Continuar el loop para que el modelo procese el resultado
        } else {
            // No hay más tool calls, terminamos
            break;
        }
    }

    return { text: finalText.trim(), toolCalls: allToolCalls, debugLogs };
}

// ── OPENAI-COMPATIBLE (Groq, OpenAI, DeepSeek, OpenRouter, Cerebras, Z.AI, Custom) ─────

async function callOpenAICompatibleWithTools(
    config: AIConfig,
    messages: AIMessage[],
    tools: AIToolDef[],
    executeToolFn: (name: string, args: any) => Promise<string>,
    debugLogs: string[],
    maxLoops: number
): Promise<AIResult> {
    // Resolver URL
    let chatUrl: string;
    if (config.baseUrl) {
        chatUrl = `${config.baseUrl.replace(/\/$/, '')}/v1/chat/completions`;
    } else {
        chatUrl = PROVIDER_URLS[config.provider] || PROVIDER_URLS['openai'];
    }

    // Convertir mensajes a formato OpenAI
    const oaiMessages: any[] = messages.map(m => {
        const msg: any = { role: m.role === 'assistant' ? 'assistant' : m.role, content: m.content };
        if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
        if (m.tool_calls) {
            msg.tool_calls = m.tool_calls.map(tc => ({
                id: tc.id,
                type: 'function',
                function: { name: tc.name, arguments: JSON.stringify(tc.arguments) }
            }));
        }
        return msg;
    });

    // Preparar tools en formato OpenAI
    const oaiTools = tools.length > 0 ? tools.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters }
    })) : undefined;

    const requestBody: any = {
        model: config.model,
        messages: oaiMessages,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        stream: false
    };
    if (oaiTools) {
        requestBody.tools = oaiTools;
        requestBody.tool_choice = 'auto';
    }

    let finalText = '';
    const allToolCalls: AIToolCall[] = [];
    const KNOWN_TOOLS = new Set(tools.map(t => t.name));


    for (let i = 0; i < maxLoops; i++) {
        debugLogs.push(`[OAI-LOOP ${i}] ${config.provider}`);

        const res = await fetch(chatUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error(`[AI-ADAPTER] ${config.provider} ${res.status}:`, errText.slice(0, 500));

            // ── GROQ TOOL_USE_FAILED RECOVERY ──────────────────────
            // Llama models sometimes generate malformed tool calls.
            // Groq returns 400 with failed_generation containing the raw text.
            // We extract tool calls manually and execute them.
            if (res.status === 400 && errText.includes('tool_use_failed')) {
                try {
                    const errObj = JSON.parse(errText);
                    const failedGen = errObj.error?.failed_generation || '';
                    console.log(`[AI-ADAPTER] Groq failed_generation FULL:`, failedGen);
                    debugLogs.push(`[GROQ-RECOVERY] failed_generation: ${failedGen.slice(0, 300)}`);

                    // Try multiple patterns to extract the tool call
                    let toolName = '';
                    let toolArgs: any = {};

                    // Pattern 1: <tool_call>{"name":"...", "arguments":{...}}</tool_call>
                    const xmlMatch = failedGen.match(/<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/);
                    if (xmlMatch) {
                        const parsed = JSON.parse(xmlMatch[1]);
                        toolName = parsed.name;
                        toolArgs = parsed.arguments || parsed.parameters || {};
                    }

                    // Pattern 2: {"name":"...", "arguments":{...}} (raw JSON)
                    if (!toolName) {
                        const jsonMatch = failedGen.match(/\{"name"\s*:\s*"([^"]+)"[\s\S]*?"arguments"\s*:\s*(\{[^}]*\})/);
                        if (jsonMatch) {
                            toolName = jsonMatch[1];
                            try { toolArgs = JSON.parse(jsonMatch[2]); } catch(_e) {}
                        }
                    }

                    // Pattern 3: function_name({"key":"value"}) or function_name\n{"key":"value"}
                    if (!toolName) {
                        for (const known of KNOWN_TOOLS) {
                            const fnMatch = failedGen.match(new RegExp(known + '[\\s(]*([{\\[].+?[}\\]])', 's'));
                            if (fnMatch) {
                                toolName = known;
                                try { toolArgs = JSON.parse(fnMatch[1]); } catch(_e) {}
                                break;
                            }
                        }
                    }

                    if (toolName && KNOWN_TOOLS.has(toolName)) {
                        console.log(`[AI-ADAPTER] Recovered tool call: ${toolName}`, toolArgs);
                        debugLogs.push(`[TOOL-RECOVERED] ${toolName}(${JSON.stringify(toolArgs).slice(0, 100)})`);

                        const result = await executeToolFn(toolName, toolArgs);
                        allToolCalls.push({ id: `recovered-${i}`, name: toolName, arguments: toolArgs });

                        requestBody.messages.push({
                            role: 'assistant',
                            content: null,
                            tool_calls: [{
                                id: `recovered-${i}`,
                                type: 'function',
                                function: { name: toolName, arguments: JSON.stringify(toolArgs) }
                            }]
                        });
                        requestBody.messages.push({
                            role: 'tool',
                            tool_call_id: `recovered-${i}`,
                            content: result
                        });
                        continue;
                    }

                    // If we couldn't parse, retry WITHOUT tools
                    debugLogs.push(`[GROQ-RECOVERY] Could not parse tool call, retrying without tools`);
                    delete requestBody.tools;
                    delete requestBody.tool_choice;
                    continue;
                } catch (parseErr) {
                    console.error('[AI-ADAPTER] Error parsing failed_generation:', parseErr);
                    debugLogs.push(`[GROQ-RECOVERY-FAIL] ${String(parseErr)}`);
                }
            }

            debugLogs.push(`[ERROR] ${config.provider} ${res.status}: ${errText.slice(0, 200)}`);
            break;
        }

        const data = await res.json();
        const message = data.choices?.[0]?.message;
        if (!message) break;

        // Acumular texto
        if (message.content) {
            finalText = (finalText ? finalText + '\n' : '') + message.content;
        }

        // Procesar tool calls
        const toolCalls = message.tool_calls;
        if (toolCalls && toolCalls.length > 0) {
            // Agregar la respuesta del asistente con tool_calls al historial
            requestBody.messages.push(message);

            for (const tc of toolCalls) {
                const name = tc.function.name;
                let args: any = {};
                try { args = JSON.parse(tc.function.arguments); } catch (_e) { /* ignore */ }

                console.log(`[AI-ADAPTER] ${config.provider} tool call: ${name}`, args);
                debugLogs.push(`[TOOL] ${name}(${JSON.stringify(args).slice(0, 100)})`);

                const result = await executeToolFn(name, args);
                allToolCalls.push({ id: tc.id, name, arguments: args });

                requestBody.messages.push({
                    role: 'tool',
                    tool_call_id: tc.id,
                    content: result
                });
            }
            // Continuar el loop para que el modelo procese el resultado
        } else {
            // No hay más tool calls, terminamos
            break;
        }
    }

    // Fallback: si no hay texto pero hubo tool calls, usar el último resultado de tool
    if (!finalText && allToolCalls.length > 0) {
        const lastToolMsg = requestBody.messages.filter((m: any) => m.role === 'tool').pop();
        if (lastToolMsg?.content) {
            finalText = lastToolMsg.content;
            debugLogs.push('[FALLBACK] Using last tool result as response');
        }
    }

    return { text: finalText.trim(), toolCalls: allToolCalls, debugLogs };
}
