        // ── AGENTE IA (CON FUNCTION CALLING REAL) ───
        if (node.type === 'ai_agent') {
            const userTemplate = node.data.user_prompt || '{{message}}';
            const temp = node.data.temperature ?? 0.7;
            const memoryLimit = node.data.memory_limit ?? 6;

            try {
                // ── 1. CONSULTAS PARALELAS A BD ────────────────────────────
                const [merchantRes, platformRes, promptRes, histRes] = await Promise.all([
                    supabase.from('merchants').select('name, ai_api_key, ai_keys, ai_model, ai_api_url, ai_provider').eq('id', merchantId).single(),
                    supabase.from('platform_settings').select('ai_api_key, ai_model').eq('id', 'global').maybeSingle(),
                    supabase.rpc('get_compiled_prompt', { p_merchant_id: merchantId }),
                    memoryLimit > 0
                        ? supabase.from('bot_flow_history').select('role, content').eq('session_id', session.id).order('created_at', { ascending: false }).limit(memoryLimit)
                        : Promise.resolve({ data: [] })
                ]);

                const merchant = merchantRes.data;
                const platform = platformRes.data;
                const compiledPrompt = promptRes.data;
                const history = histRes.data ? histRes.data.reverse() : [];

                if (promptRes.error) console.error('[BOT-ENGINE] Error al obtener prompt centralizado:', promptRes.error);

                // ── 2. RESOLVER CONFIG DE IA (Adaptador Unificado) ─────────
                const aiConfig = resolveAIConfig(merchant, node.data, platform, {
                    temperature: temp,
                    maxTokens: 1024
                });

                if (!aiConfig.apiKey) {
                    messagesToReturn.push('⚠️ Configuración de IA no disponible. Contacta a soporte.');
                    waitingFor = 'ai_input'; break;
                }

                // ── 3. GUARDAR MENSAJE DEL USUARIO EN HISTORIAL ───────────
                const { data: lastHist } = await supabase.from('bot_flow_history')
                    .select('role, content')
                    .eq('session_id', session.id)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (!lastHist || (lastHist.role !== 'user' || lastHist.content !== messageText.trim())) {
                    await supabase.from('bot_flow_history').insert({
                        session_id: session.id,
                        role: 'user',
                        content: messageText.trim()
                    });
                    const { data: newHist } = await supabase.from('bot_flow_history')
                        .select('role, content')
                        .eq('session_id', session.id)
                        .order('created_at', { ascending: false })
                        .limit(memoryLimit);
                    history.length = 0;
                    if (newHist) history.push(...newHist.reverse());
                }

                // ── 4. CARGAR SKILLS (HERRAMIENTAS) ───────────────────────
                const skillConns = connections.filter((c: any) => c.to === node.id && c.toPort === 'skills_in');
                const skills = skillConns.map((c: any) => nodes.find((n: any) => n.id === c.from)).filter((n: any) => n?.type === 'ai_skill');
                const toolDefs: AIToolDef[] = skills.map((s: any) => {
                    const def = TOOL_DEFINITIONS[s.data.actionType];
                    if (def) {
                        const customized = { ...def };
                        if (s.data.message) customized.description = s.data.message;
                        return customized;
                    }
                    return null;
                }).filter((d: any) => d !== null);

                console.log(`[BOT-ENGINE] Skills cargadas: ${toolDefs.map(t => t.name).join(', ') || 'ninguna'}`);

                // ── 5. CONSTRUIR SYSTEM PROMPT ────────────────────────────
                const systemPrompt = `
${compiledPrompt || 'Eres un asistente de ventas amigable.'}

### INSTRUCCIONES ESPECÍFICAS DE ESTA ETAPA:
${node.data.prompt || ''}

### INSTRUCCIONES OPERATIVAS:
1. USA LAS HERRAMIENTAS NATIVAS: No escribas el nombre de la herramienta en texto. Usa la función técnica real.
2. NO EXPLIQUES TUS ACCIONES: No digas "Voy a usar la herramienta...". Simplemente úsala y da los resultados.
3. PRIORIZA EL CATÁLOGO: Solo ofrece productos que encuentres con catalog_search.
4. CIERRA LA VENTA: Si el cliente tiene productos en el carrito, guíalo a finalizar el pedido pidiendo sus datos (Nombre, Dirección, Celular).
5. REGISTRO FINAL: Solo usa register_order cuando el cliente confirme explícitamente el pedido y el total.
6. RESPUESTAS CORTAS: Sé amable, vendedor y mantén tus respuestas breves (máximo 3 párrafos).
7. VERACIDAD ABSOLUTA: Si el cliente pregunta detalles o ingredientes, usa ÚNICAMENTE la descripción del catálogo. PROHIBIDO inventar.
8. RECUERDA: Tienes prohibido negociar precios o inventar productos.
9. RESPUESTA OBLIGATORIA: Si usas una herramienta, tu respuesta final DEBE explicar los resultados al cliente de forma amable y vendedora.

### ESTADO ACTUAL DE LA SESIÓN:
- Tienda: ${merchant?.name || 'Nuestra tienda'}
- Carrito del cliente: ${variables['cart']?.length > 0 ? variables['cart'].map((it: any) => it.name + ' x' + it.qty + ' ($' + (it.price * it.qty) + ')').join(', ') : 'vacío'}
- Número de pedido activo: ${variables['orderNumber'] || 'ninguno'}
`;
                const finalUserMessage = userTemplate.replace('{{message}}', messageText);

                // ── 6. CONSTRUIR HISTORIAL EN FORMATO UNIVERSAL ───────────
                const aiMessages: AIMessage[] = [
                    { role: 'system', content: systemPrompt }
                ];

                let lastMsgRole = 'system';
                for (const m of (history || [])) {
                    const role: 'user' | 'assistant' = m.role === 'user' ? 'user' : 'assistant';
                    if (role !== lastMsgRole) {
                        aiMessages.push({ role, content: m.content });
                        lastMsgRole = role;
                    } else if (aiMessages.length > 0) {
                        aiMessages[aiMessages.length - 1].content += '\n' + m.content;
                    }
                }

                // Asegurar que el último mensaje sea del usuario
                if (lastMsgRole !== 'user') {
                    aiMessages.push({ role: 'user', content: finalUserMessage });
                }

                // ── 7. LLAMAR AL MODELO (ADAPTADOR UNIFICADO) ─────────────
                const result = await callUnifiedAI(
                    aiConfig,
                    aiMessages,
                    toolDefs,
                    async (name: string, args: any) => {
                        return await executeAgentTool(supabase, name, args, variables, merchantId, conversationId, customerId);
                    }
                );

                // ── 8. PROCESAR RESULTADO ─────────────────────────────────
                debugLogs.push(...result.debugLogs);

                if (result.text) {
                    messagesToReturn.push(result.text);
                    await supabase.from('bot_flow_history').insert({
                        session_id: session.id,
                        role: 'model',
                        content: result.text
                    });
                } else {
                    console.log('[BOT-ENGINE] Sin respuesta de texto del modelo.');
                    const generic = `Lo siento, tuve un problema. DEBUG:\n${debugLogs.join('\n')}`;
                    messagesToReturn.push(generic);
                }

            } catch (err: any) {
                console.error('[BOT-ENGINE] Error en AI Agent:', err);
                messagesToReturn.push(`Ocurrió un error procesando tu solicitud. Error: ${err.message || String(err)}`);
                debugLogs.push(`[GLOBAL-AI-ERROR] ${err.message || String(err)}`);
            }

            // El AI Agent siempre pausa para esperar el siguiente mensaje
            waitingFor = 'ai_input';
            break;
        }
