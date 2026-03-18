export interface FlowNode {
  id: string;
  type: 'start' | 'message' | 'question' | 'menu' | 'condition' | 'action' | 'ai_agent' | 'end' | 'ai_skill' | 'n8n' | 'mcp' | 'api' | 'memory_extract' | 'db_query' | 'set_variable' | 'switch' | 'delay' | 'business_hours' | 'semantic_router' | 'image_generator' | 'knowledge_query' | 'send_email' | 'transfer_operator' | 'wa_template' | 'catalog_search' | 'cart_summary' | 'order_checkout';
  position: { x: number; y: number };
  data: {
    label: string;
    message?: string;
    action?: string;
    params?: any;
    variable?: string;
    validation?: 'text' | 'number' | 'email' | 'phone';
    options?: { id: string; text: string; value: string }[];
    // Action types para nodos 'action'
    actionType?: 'register_order' | 'create_booking' | 'send_notification' | 'transfer_human' | 'tag_customer' | 'add_to_cart' | 'empty_cart'
               // Skill types para nodos 'ai_skill' (tools del Agente IA)
               | 'catalog_search' | 'inventory_check' | 'add_to_cart' | 'get_cart' | 'remove_from_cart' | 'register_order' | 'order_status' | 'shopping_cart' | 'transfer_human' | 'knowledge_base';
    operator?: '==' | '!=' | 'contains' | '>' | '<' | 'exists';
    value?: string;
    prompt?: string;       // System Prompt del Agente IA
    user_prompt?: string;  // Plantilla del mensaje del usuario
    model?: string;        // Modelo de IA (gemini-1.5-flash, etc.)
    temperature?: number;  // Creatividad del LLM 0-1
    memory_limit?: number; // Cuántos mensajes previos recordar
    // Propiedades para Integraciones Externas
    n8n_webhook_url?: string;
    n8n_wait_for_response?: boolean;
    mcp_server_id?: string;
    mcp_tool_name?: string;
    api_url?: string;
    api_method?: 'GET' | 'POST' | 'PUT';
    api_headers?: string;
    api_body?: string;
    response_mapping?: string; // Donde guardar la respuesta (ej. nombre_variable)
    // Propiedades para Contexto y Memoria
    memory_prompt?: string;
    memory_key?: string;
    db_table?: string;
    db_column?: string;
    db_value?: string;
    db_operation?: 'select' | 'insert' | 'update';
    variable_name?: string;
    variable_value?: string;
    // Propiedades para Lógica y Flujo
    switch_variable?: string;
    switch_cases?: { id: string; value: string; label: string }[];
    delay_hours?: number;
    delay_minutes?: number;
    business_hours?: {
      day: string;
      open: string;
      close: string;
      enabled: boolean;
    }[];
    timezone?: string;
    // Propiedades para IA
    ai_intents?: { id: string; name: string; description: string }[]; // Semantic Router
    image_prompt?: string; // Generador de imagenes
    image_size?: '256x256' | '512x512' | '1024x1024';
    knowledge_query?: string; // RAG especifico
    knowledge_doc_id?: string;
    // Propiedades para Comunicación
    email_to?: string;
    email_subject?: string;
    email_body?: string;
    wa_template_name?: string;
    wa_template_params?: string[];
  };
}

export interface FlowConnection {
  id: string;
  from: string;
  fromPort: string;
  to: string;
  toPort: string;
}

export interface FlowData {
  nodes: FlowNode[];
  connections: FlowConnection[];
}

export interface BotFlow {
  id?: string;
  merchant_id: string;
  name: string;
  description?: string;
  is_active: boolean;
  trigger_type: 'always' | 'greeting' | 'keyword';
  trigger_keywords?: string[];
  flow_data: FlowData;
  variables?: any[];
  stats?: any;
}
