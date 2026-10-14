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
  is_active: boolean;
  currency?: string;
  logo_url?: string;
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
  full_name: string;
  phone?: string;
  email?: string;
  address?: string;
  orders?: Order[];
}

export interface Order {
  id: string;
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
