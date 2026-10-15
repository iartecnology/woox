export interface Profile {
  id: string;
  email: string;
  full_name?: string;
  role?: string;
  merchant_id?: string;
}

export interface Merchant {
  id: string;
  name?: string;
  business_name?: string;
  slug: string;
  industry_type?: string;
  phone?: string;
  address?: string;
  is_active: boolean;
  currency?: string;
  logo_url?: string;
  ai_welcome_message?: string;
  schedule_mode?: 'manual' | 'automatic';
  is_open_manual?: boolean;
  weekly_schedule?: {
    day: string;
    name: string;
    enabled: boolean;
    open: string;
    close: string;
  }[];
}

export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled';

export interface OrderItem {
  id: string;
  order_id: string;
  product_id?: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  notes?: string;
}

export interface Customer {
  id: string;
  merchant_id?: string;
  full_name: string;
  phone?: string;
  email?: string;
  address?: string;
  loyalty_level?: 'bronze' | 'silver' | 'gold' | 'platinum' | string;
  loyalty_points?: number;
  churn_risk?: 'low' | 'medium' | 'high' | string;
  clv?: number;
  avg_ticket?: number;
  total_orders?: number;
  sentiment?: string;
  tags?: string[];
  last_purchase_at?: string;
  status?: string;
  telegram_user_id?: string;
  whatsapp_phone?: string;
  created_at?: string;
  orders?: Order[];
}

export interface Order {
  id: string;
  order_number?: number;
  merchant_id: string;
  customer_id?: string;
  conversation_id?: string;
  status: OrderStatus;
  total_amount: number;
  delivery_address?: string;
  notes?: string;
  created_at: string;
  updated_at?: string;
  customers?: Customer;
  order_items?: OrderItem[];
}

export type ChannelType = 'whatsapp' | 'telegram' | 'facebook' | 'instagram' | 'web';

export interface Conversation {
  id: string;
  merchant_id: string;
  customer_id?: string;
  channel?: ChannelType | string;
  platform?: string;
  channel_user_id?: string;
  customer_identifier?: string;
  ai_active?: boolean;
  is_bot_active?: boolean;
  status: 'open' | 'pending' | 'resolved';
  last_message_at: string;
  created_at: string;
  customers?: Customer;
  unread_count?: number;
  last_message?: string;
  typing_data?: any;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_type: 'customer' | 'ai' | 'human_agent' | 'bot' | 'agent';
  content: string;
  media_url?: string;
  metadata?: any;
  created_at: string;
}

export interface Reservation {
  id: string;
  merchant_id: string;
  customer_id?: string;
  resource_id?: string;
  service_id?: string;
  reservation_date: string; // YYYY-MM-DD
  start_time: string;       // HH:MM
  end_time?: string;
  party_size?: number;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  notes?: string;
  created_at: string;
  customers?: Customer;
}

export interface Category {
  id: string;
  merchant_id: string;
  name: string;
  parent_id?: string | null;
  sort_order?: number;
  display_order?: number;
}

export interface Product {
  id: string;
  merchant_id: string;
  name: string;
  description?: string;
  price: number;
  category_id?: string;
  image_url?: string;
  is_available: boolean;
  stock?: number;
  categories?: Category;
  metadata?: any;
}
