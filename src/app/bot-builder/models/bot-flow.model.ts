export interface FlowNode {
  id: string;
  type: 'start' | 'message' | 'question' | 'menu' | 'condition' | 'action' | 'ai_agent' | 'end' | 'ai_skill';
  position: { x: number; y: number };
  data: {
    label: string;
    message?: string;
    action?: string;
    params?: any;
    variable?: string;
    validation?: 'text' | 'number' | 'email' | 'phone';
    options?: { id: string; text: string; value: string }[];
    actionType?: 'register_order' | 'create_booking' | 'send_notification' | 'transfer_human' | 'tag_customer' | 'add_to_cart' | 'empty_cart' | 'catalog_search' | 'inventory_check' | 'order_status';
    operator?: '==' | '!=' | 'contains' | '>' | '<' | 'exists';
    value?: string;
    prompt?: string; // System Prompt
    user_prompt?: string; // Plantilla del mensaje del usuario
    model?: string;
    temperature?: number;
    memory_limit?: number; // Cuántos mensajes previos recordar
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
